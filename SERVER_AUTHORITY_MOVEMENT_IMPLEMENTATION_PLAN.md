# Server-authority movement implementation plan

Date: 2026-07-13

Status: Implemented in the current working tree on 2026-07-13. Roblox Studio, published-server, and mobile runtime validation remain required.

Implementation coverage:

- Shared generic body mover and client/server initialization: implemented.
- All-player and tagged-crew ship carrying, including airborne carrying: implemented.
- Desired direction/speed/rotation intent migration: implemented.
- Shared projectile factory and server-only ECS authority boundary: implemented.
- Input Action based player-fire prediction and instance-stitching path: implemented; runtime stitching verification pending.
- AI projectile authority path: retained as server-only.
- Workspace authority prerequisites in Rojo configuration: implemented and Rojo-build verified.
- Optional render-proxy smoothing and multiple-carrier membership: intentionally deferred.

Related review: `SERVER_AUTHORITY_MOVEMENT_REVIEW.md`

## Objective

Replace the current partial prediction setup with a reusable server-authoritative movement foundation that:

- Runs identical generic motion integration on the server and every client through `RunService.BindToSimulation()`.
- Keeps boat paths, homing target selection, damage, collision authority, and gameplay ECS state on the server.
- Predicts movement from compact generic attributes without exposing entity-specific decision logic to clients.
- Supports deterministically stitched player-fired projectiles without introducing a client-side gameplay ECS.
- Carries all player characters and tagged crew with the ship on the server and clients, including while jumping.
- Remains extensible to multiple carrier ships and explicit occupant membership later.
- Narrows expensive prediction once correctness is established and measured.

## Agreed design decisions

1. Boat path logic remains server-only.
2. Homing and other AI decisions remain server-only.
3. A generic shared body mover consumes motion intent and integrates transforms; it does not know about boats, paths, cannons, targets, or ECS entities.
4. Bodies move forward while rotating toward a desired direction at a configured rotation speed.
5. Bodies face their direction of travel.
6. The ship's complete transform delta, including rotation, is applied to occupants.
7. Occupants continue following the ship while airborne. A jumping character therefore remains in the ship's coordinate frame while the ship turns.
8. Initially, all unseated player characters and all tagged crew models are treated as occupants of the one carrying ship.
9. Seated characters continue to rely on their seat weld and must not be moved twice.
10. Clients carry all visible occupants, not only the local character, so crew and other players do not visually fall behind the predicted ship.
11. Future multiple-ship membership will use a carrier ID on each occupant rather than a serialized table of player IDs on a boat.
12. Projectile creation and presentation can be shared/predicted, but collision, damage, fire validation, and authoritative destruction remain server-only.

## Target architecture

```text
Server-only decisions
    Boat path ECS ───────────────┐
    Homing ECS ──────────────────┼── writes generic motion intent
    Fire validation/cooldown ────┘
                 │
                 ▼
Shared fixed simulation (client + server)
    GenericBodyMotion
        rotate toward desired direction
        move forward at speed
        apply carrier delta to occupants

    ProjectileSimulation
        read synchronized fire input
        deterministically clone/create projectile
        initialize generic motion
        predict generic lifetime/range where safe
                 │
        ├── client: predicted/stitched visual + motion
                 │
                 └── server: attach authoritative ECS components
                              raycast, homing decisions, damage, destroy

RenderStepped presentation
    cameras, UI, sounds, effects, optional non-collidable smoothing proxies
```

The shared simulation is not a shared ECS. It is a deterministic transform and creation layer over Roblox instances. The existing ECS remains the server's authoritative gameplay model.

## 1. Generic body-motion contract

### 1.1 Required synchronized state

Replace the current velocity/look-direction contract with intent that the shared mover can advance independently:

| Attribute | Type | Meaning |
| --- | --- | --- |
| `MotionSpeed` | `number` | Forward speed in studs per second. Must be finite and non-negative. |
| `MotionDirection` | `Vector3` | Desired travel/facing direction. The mover normalizes it. |
| `MotionRotationSpeed` | `number` | Maximum turn rate in radians per second. Must be finite and non-negative. |
| `MotionEnabled` | `boolean` | Whether the body should currently integrate. |
| `MotionCarriesCharacters` | `boolean` | Whether the body's transform delta should be applied to occupants. |
| `MotionId` | `string` or `number` | Stable simulation identity for diagnostics and future carrier membership. |

`MotionVelocity`, `MotionLookDirection`, and `MotionLockLookDirection` should be retired after migration unless another system has a demonstrated need for raw velocity.

### 1.2 Direction semantics

`MotionDirection` means the desired heading, not a fully calculated per-frame velocity.

Each fixed simulation step should:

1. Read the current facing from the model pivot.
2. Normalize `MotionDirection` when its magnitude is above a small epsilon.
3. Rotate current facing toward desired direction by at most `MotionRotationSpeed * dt`.
4. Move along the newly calculated facing by `MotionSpeed * dt`.
5. Construct the next pivot with a stable up vector.
6. Compute `deltaPivot = nextPivot * previousPivot.Inverse()`.
7. Pivot the body once.
8. Apply `deltaPivot` to applicable occupants.

When direction is zero or invalid, retain the previous facing. When speed is zero, rotation may continue toward the desired direction unless the design later introduces a separate rotation lock.

### 1.3 Three-dimensional orientation

The rotation implementation must support both horizontal boats and vertically aimed projectiles:

- A boat supplies horizontal direction and naturally stays upright.
- A projectile may supply a direction with a Y component and must face that complete direction.
- Near-parallel direction/up-vector cases need a stable fallback to prevent `lookAt` singularities or sudden roll.
- Rotation interpolation should use a deterministic shortest-arc method, not Euler-angle component interpolation.

This fixes the current mover's horizontal-only facing calculation for projectiles.

### 1.4 Motion updates from server systems

Server decision systems may continue running independently when they are not replayable gameplay simulation, but they should write only changed intent:

- Boat path ECS sets speed, desired direction, or turn rate when its desired course changes.
- Homing ECS updates desired direction when its target solution changes.
- Locks set speed to zero or disable motion.
- Attribute setters compare against the existing value with a defined epsilon before writing.

The shared mover performs gradual turning. The server should not stream a newly calculated current look direction every `Heartbeat` merely to animate the turn.

Continuous server updates are still possible for homing or dynamic steering, but delayed changes can produce corrections. Update thresholds should balance steering accuracy against replication and rollback churn.

### 1.5 Simulation registry

Do not call `CollectionService.GetTagged()` and allocate a new array inside every simulation step.

- Build a cached motion registry from initial tagged instances.
- Update it through tag-added and tag-removed signals outside `BindToSimulation`.
- Assign stable IDs and iterate in stable order when ordering can affect results.
- Remove destroyed or unparented instances safely.
- Prevent duplicate registration and duplicate simulation startup.

## 2. Shared initialization

Create one idempotent shared initializer used by both entry points:

```text
server main
    initialize shared body motion in server mode
    initialize shared projectile simulation in server mode

client main
    initialize shared body motion in client mode
    initialize shared projectile simulation in client mode
```

The client must do more than call `SetPredictionMode`; it must register the actual `BindToSimulation` callbacks.

Startup order must ensure:

1. Required replicated templates and input contexts exist.
2. Registries are ready.
3. Simulation callbacks are bound exactly once.
4. Server ECS systems may then write intent and register authority metadata.

## 3. Ship occupant carrying

### 3.1 Initial global-occupant policy

For the current one-ship design, every simulation step for the carrying ship applies its full `deltaPivot` to:

- Every unseated player `HumanoidRootPart`.
- Every model tagged `MotionRider` (crew/NPC riders).

This runs on the server and every client. Airborne occupants continue receiving the ship delta by design.

Seated Humanoids must be skipped because the seat weld already carries them. A model must never receive the same carrier delta through both the player and rider paths.

### 3.2 Client treatment of remote occupants

The requirement is that clients also move crew and other players so they remain aligned with the predicted ship. This is an intentional exception to the simplest Roblox remote-Humanoid rendering model and must be tested carefully.

Implementation rules:

- Apply only the known ship delta; do not attempt to predict a remote player's private walking input.
- Do not introduce a second remote-character movement controller.
- Avoid forcing every descendant part to `PredictionMode.On` by default. Test the minimum prediction context required for platform-delta writes.
- Measure correction rate and mobile cost with multiple remote players walking and jumping.
- If direct remote-root simulation creates unacceptable rollback corrections, retain the requirement through a visual boat-relative offset/proxy rather than expanding gameplay prediction of remote input.

### 3.3 Avoiding physics conflicts

Before enabling the new carry path, verify whether the deck's physical movement already transfers any platform motion. The character must not receive both automatic physical carry and the complete manual delta.

Test and document:

- Anchored versus unanchored ship assembly behavior.
- Deck friction and collision geometry.
- Whether `PivotTo` produces useful assembly velocity for Humanoids.
- Root correction into railings, ceilings, seats, and deck seams.
- Interaction between manual root changes and Humanoid jump/floor detection.

The implementation should have one explicit owner for platform-relative displacement.

### 3.4 Future multiple-carrier membership

Do not encode a player-ID table in one attribute. Roblox attributes do not directly support tables, and serialized lists are unsuitable for rollback limits.

Future occupant state should be attached to the occupant:

```text
MotionCarrierId = matching MotionId
```

The initial global policy can be replaced with this filter without changing body integration. Server-side boarding detection would own the authoritative carrier assignment; clients would consume the synchronized value.

## 4. Projectile-specific simulation and instance stitching

### 4.1 Separation of responsibilities

The projectile layer is separate from generic body movement:

| Layer | Client | Server |
| --- | --- | --- |
| Shared projectile simulation | Predict creation, initialize model and motion, advance shared safe state | Perform identical creation and initialization |
| Generic body mover | Integrate projectile transform | Integrate identical projectile transform |
| Projectile authority ECS | None | Register components, validate shot, raycast, home, apply damage, destroy |
| Presentation | Render effects/sounds and tolerate rollback | No client presentation responsibility |

The client never creates authoritative ECS entities.

### 4.2 Replicated projectile templates

Prefer cloning a replicated projectile template inside shared simulation:

- Template has the expected root/primary part and deterministic hierarchy.
- Cosmetic/static properties are prepared on the template.
- Collision is disabled for predicted visual/projectile parts unless authoritative physics explicitly requires it.
- The template is usable by both client and server from the same shared module.
- Tag/registry setup must be deterministic. Prefer template state or direct registry registration over unpredictable discovery timing.

Cloning the same replicated source from the same shared code and simulation frame allows Roblox to stitch the predicted and authoritative copies.

### 4.3 Required firing-input migration

The current custom `MountTrigger` RemoteEvent is insufficient for true immediate stitching because it does not cause client and server to execute projectile creation in the same simulation frame.

Move gameplay-relevant firing input into the Input Action System/shared simulation:

- Fire edge/sequence.
- Validated aim direction or target identity.
- Shooter/mount identity.
- Any input needed to deterministically choose the projectile type.

Both sides evaluate the same shared fire state and call the same projectile factory in the same order. The server still validates range, ownership, aim limits, fire rate, and target eligibility. An invalid client prediction is corrected through rollback and the predicted projectile disappears or changes accordingly.

The existing custom remote may remain for communication that does not affect replayable projectile creation, but it must not be the authoritative timing source for a stitched player-fired projectile.

### 4.4 Clean server ECS registration

The shared factory should return a projectile model/specification. Its sequence should be:

1. Both sides detect the same accepted/predicted fire transition.
2. Both sides call the same clone/create function unconditionally.
3. Both sides initialize the same pivot and generic motion attributes.
4. Both sides parent/register the projectile consistently.
5. Only after the matching creation call, the server creates the authoritative ECS entity and attaches server components.

Server-only ECS registration must not:

- Wrap or replace the shared creation call.
- Create additional stitchable instances in a way that changes the shared per-frame call sequence.
- Move the projectile separately from the generic body mover.
- Cause a second projectile to be registered for the same stitched model.

Suggested server boundary:

```text
shared createProjectile(spec) -> Model

if server:
    projectileAuthority.register(model, authoritativeSpec)
```

The authority registration creates existing components such as `WorldModel`, `Velocity` if still needed as server metadata, `Projectile` or `HomingProjectile`, and hit/damage information. Components should reference the stitched model rather than create another model.

### 4.5 Player-fired versus AI-fired projectiles

True immediate prediction is available when the local client knows the firing input before the server round trip.

- Player-fired projectile: use synchronized input and stitching.
- AI-fired projectile from a server-only decision: the client cannot predict an unknown decision in advance. Keep creation authoritative unless AI fire state itself becomes shared/predictable.

AI projectiles can still use the generic body mover after replication. If their delayed appearance is objectionable, use render smoothing or another presentation technique; do not pretend a server-only decision was locally predicted.

### 4.6 Projectile state and lifecycle

- Initial direction, speed, rotation speed, shooter identity, and projectile type must be deterministic inputs to creation.
- Constant cannonballs need no further client gameplay logic beyond generic movement.
- Homing ECS writes desired direction; shared body motion performs limited turning.
- Server raycasts between previous and current authoritative positions and owns hits.
- Server hit/destruction can correct a client that predicted continued travel.
- Range/lifetime may be advanced in shared simulation if calculated identically; the server remains authoritative.
- Effects and sounds observe synchronized state from `RenderStepped` and must tolerate rollback or early destruction.

## 5. Prediction policy

Correct simulation first, then reduce prediction scope using measurements.

Initial required contexts:

- Carrying ship/body: predicted on relevant clients.
- Local character: predicted.
- Stitched local projectile: predicted as required by shared simulation.
- Tagged crew and remote characters: minimum mode that permits stable application of the common ship delta; do not automatically force every descendant part on.
- Non-critical and AI projectiles: `Automatic`, `Off`, or render interpolation unless testing proves rollback prediction is necessary.

Add diagnostics using `RunService.GetPredictionMode()` so tests record the actual mode of roots and assemblies rather than assuming requested mode equals effective mode.

## 6. ECS migration

### 6.1 Boat systems

Refactor `MoveToPointSystem` so it owns decisions but not transform integration:

- Compute desired course and speed.
- Set `MotionDirection`, `MotionSpeed`, and `MotionRotationSpeed` only when changed.
- Do not set the current look direction every heartbeat.
- Do not call `PivotTo`.

`PathFollowSystem` remains server-only and changes targets/course intent.

### 6.2 Homing system

`HomingProjectileSystem` remains server-only:

- Resolve the authoritative target.
- Set desired direction when meaningfully changed.
- Let the generic mover apply turn-rate limits and translation.
- Apply server-authoritative hit/damage when the authoritative collision rule succeeds.

### 6.3 Projectile collision system

`ProjectileSystem` continues to read authoritative projectile positions and raycast swept segments. Confirm system ordering so the raycast always observes the just-completed fixed movement step rather than a variable `Heartbeat` race.

Prefer moving authoritative projectile collision checks into a fixed simulation-safe phase or a clearly ordered post-simulation phase. Do not let `Heartbeat` ordering arbitrarily decide whether a segment is checked before or after movement.

### 6.4 ECS update clock

Not every ECS system needs to be shared, but movement-affecting timing must be deliberate:

- Server-only AI/path decisions can tick on a chosen server clock and emit intent.
- Transform integration must use fixed shared simulation.
- Authoritative collision should use a fixed or explicitly ordered position history.
- Cooldowns used for stitched creation need rollback-compatible shared state/frame semantics rather than only `os.clock()`.

## 7. Implementation phases

### Phase 0 — Baseline and runtime verification

- Capture required Workspace authority settings in Studio and a published session.
- Record server-authority visualizer metrics for current PC and mobile behavior.
- Capture prediction success, input acceptance, step delta, RCC heartbeat FPS, predicted-instance count, and drop reasons.
- Verify ship anchoring, welds, primary part, collision geometry, and every transform writer.
- Record baseline jump, turn, lag-spike, projectile-load, and correction traces.

Exit criterion: the current failure is reproducible with measurements, and the published configuration/model assumptions are documented.

### Phase 1 — Generic shared body mover

- Introduce the new motion attribute schema.
- Implement deterministic 3D rotate-then-translate integration.
- Add cached stable motion registry.
- Start the shared callback on both client and server.
- Migrate the boat and constant projectiles to the new attributes.
- Retain server-only decision logic.
- Add idempotent startup and validation warnings.

Exit criterion: a constant-direction test body and cannonball follow the same trajectory on client/server, and the boat moves without periodic backward correction on a straight course.

### Phase 2 — Ship carrying

- Apply the ship's full delta to all unseated player characters and tagged crew on server and clients.
- Preserve carrying while airborne.
- Prevent seat-weld and duplicate rider application.
- Test remote occupants without predicting their private walking input.
- Tune prediction scope and collision behavior based on mobile traces.

Exit criterion: local players, remote players, and crew remain aligned with the ship during walking, jumping, and turning, with no fling under the test network matrix.

### Phase 3 — Server intent cleanup

- Change boat movement ECS to write desired direction/speed/turn rate rather than current facing/velocity every heartbeat.
- Add epsilon-based attribute updates.
- Move projectile collision observation to a deterministic ordered phase.
- Convert homing updates to desired-heading intent plus generic rotation.

Exit criterion: continuous turns and homing do not create excessive attribute churn or visible correction steps.

### Phase 4 — Player-fired projectile stitching

- Add replicated projectile templates.
- Move player fire/aim state required for creation into Input Actions/shared simulation.
- Create the matching projectile on client/server inside the same shared callback.
- Register authoritative ECS components only on the server after creation.
- Preserve existing validation, cooldown, raycast, health, and damage rules.
- Handle rollback rejection and effect cleanup.
- Keep server-only AI firing authoritative unless separately synchronized.

Exit criterion: a valid local shot appears immediately, stitches without duplicate/pop, follows the shared trajectory, and never applies client-authoritative damage.

### Phase 5 — Optimization and presentation

- Remove blanket prediction from unnecessary descendant parts and remote contexts.
- Decide prediction/interpolation policy for AI and non-critical projectiles.
- Add optional non-collidable correction-smoothing render proxies only where raw simulation corrections remain unavoidable.
- Profile maximum crew/player/projectile load on representative low-end mobile hardware.

Exit criterion: visual quality remains acceptable at production load, predicted-instance count stays bounded, and RCC heartbeat remains at least 59 FPS.

## 8. Verification matrix

### Network and device conditions

- Approximate round-trip latency: 30, 80, 150, and 250 ms.
- Added jitter: 0, 20, and 50 ms.
- Packet loss: 0%, 1%, and 3% where supported.
- Client render rates: 30 and 60 FPS.
- Separate server/client Studio processes and published private-server mobile tests.

### Ship and occupant cases

- Straight travel, gradual turn, maximum-rate turn, stop/start, and direction reversal.
- Waypoint transition and server course correction.
- Local and remote players standing still, walking in every direction, jumping repeatedly, and landing during turns.
- Multiple airborne occupants while the ship rotates.
- Seated occupants and seat-weld verification.
- Tagged crew plus player characters; verify no duplicate delta application.
- Rails, deck seams, cannon mounts, edges, and low ceilings.
- Artificial lag spike during jump and landing.

### Projectile cases

- Constant player-fired projectile with immediate stitched creation.
- Valid and server-rejected predicted shot.
- Repeated fire at cooldown boundary.
- Targeted/homing shot with target moving vertically and horizontally.
- AI-fired authoritative projectile.
- Projectile destroyed early by hit versus predicted continued travel.
- Worst-case simultaneous projectile count.
- Verify exactly one model and one server ECS entity per accepted shot.

### Measurements

- Instance prediction success rate.
- Input accept rate and input-drop reasons.
- Client-server step delta and stability.
- RCC heartbeat FPS; reject runs below 59 FPS before interpreting movement quality.
- Predicted-instance count under player/crew/projectile load.
- Boat transform correction magnitude.
- Character transform error relative to boat.
- Correction count/magnitude during jumps and turns.
- Shared simulation callback duration on PC and mobile.

## 9. Acceptance criteria

- Shared movement initialization is present exactly once on server and client.
- Client and server integrate identical generic motion for the same attributes and fixed `dt`.
- Boat path and homing target logic remain server-only.
- The server no longer streams a freshly calculated current boat facing every heartbeat to produce basic turning.
- All intended occupants remain ship-relative while grounded and airborne.
- No seat-weld or rider receives the ship delta twice.
- No staged vertical jump motion or collision fling occurs in the verification matrix.
- Remote crew/player presentation remains aligned without requiring prediction of their private input.
- A player-fired stitched projectile produces one reconciled model and one server ECS entity.
- Projectile hits and damage can only be committed by server ECS authority.
- AI projectiles remain correct even when not locally predictable.
- Prediction scope and active projectile count remain within mobile performance limits.
- Published Workspace settings satisfy Roblox server-authority requirements.

## 10. Risks and safeguards

### Remote character correction risk

Applying ship delta to remote characters without their private movement input can still conflict with authoritative snapshots. Measure this explicitly. If it remains visible, use a presentation-layer boat-relative solution rather than forwarding all remote input by default.

### Double platform motion risk

Manual carry plus physical deck transfer can double movement. Establish actual platform physics behavior before finalizing carry.

### Stitch call-order risk

Instance stitching requires matching source, simulation frame, and per-frame creation call order. Keep shared projectile creation small, unconditional after the shared fire decision, and covered by duplicate-instance tests.

### Server rejection risk

Client prediction can create a shot the server rejects. Projectile effects must be reversible and must never apply damage locally.

### Attribute timing risk

Server-only course/homing changes are inherently learned later by clients. Generic rotation and epsilon-based updates reduce artifacts but cannot predict unknowable decisions. Corrections should be measured and visually smoothed only after simulation correctness.

### Multiple carriers

The initial global carry policy assumes one relevant ship. Before adding another carrying body, implement `MotionCarrierId`; otherwise every occupant would receive multiple body deltas.

## 11. Planned source areas

Expected areas of change when implementation is approved:

- `src/shared/serverAuthorityReplicatedMotion.ts` — replace with/refactor into the generic body mover and carrier logic.
- `src/shared/simulationPrediction.ts` — narrow prediction policy and add diagnostics.
- `src/client/main.client.ts` — start shared simulation and Input Action handling.
- `src/server/main.server.ts` — start shared simulation in server mode.
- `src/server/worldEcs/systems/MoveToPointSystem.ts` — emit desired motion intent.
- `src/server/worldEcs/systems/HomingProjectileSystem.ts` — emit desired heading and retain authority.
- `src/server/worldEcs/systems/ProjectileSystem.ts` — deterministic post-movement collision handling.
- `src/server/worldEcs/systems/FireRequestSystem.ts` — separate shared creation from server ECS registration.
- New shared projectile simulation/factory module.
- New replicated projectile templates and Input Action setup in the place/project mapping.

## 12. Non-goals

- Moving boat waypoint/path ECS to clients.
- Moving homing target selection to clients.
- Creating a general client-side ECS mirror.
- Trusting client projectile collisions, damage, cooldowns, or target validation.
- Solving multiple-ship membership before it is needed, beyond reserving stable IDs and a clean extension point.
- Using visual smoothing to conceal a divergent simulation.

## Recommended first implementation slice

Implement and test Phase 1 with one non-homing cannonball and the boat, but temporarily leave projectile stitching and the carrier rewrite out of that first code change. This isolates the foundational question: whether the same generic direction/speed/rotation integration produces stable client/server motion.

Once that trace is clean, add carrying in Phase 2. Instance stitching should follow only after shared movement and simulation input timing are proven, because stitching depends on both foundations being deterministic.
