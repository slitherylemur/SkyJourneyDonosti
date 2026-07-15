# Server-authority movement review

Date: 2026-07-13

Implementation note: This document records the pre-fix review findings. The accompanying implementation plan was subsequently applied to the current working tree; consult `SERVER_AUTHORITY_MOVEMENT_IMPLEMENTATION_PLAN.md` and the current source for implementation status. Runtime Studio/mobile validation is still pending.

## Executive verdict

The current movement system is not yet a complete Roblox server-authority/rollback implementation. It enables prediction on instances, and it binds the final model integration to `BindToSimulation` on the server, but the client never starts that shared simulation. In addition, the logic that decides the boat's velocity and heading runs only on the server through variable-rate `Heartbeat` code. The client therefore cannot produce or replay the same authoritative frame.

This is the most likely primary cause of the observed boat corrections and staged character motion. The manual character-carry implementation is a second critical problem: every unseated player character is CFramed by every character-carrying motion model, whether or not that character is standing on the boat, and this happens only on the server. During a latency spike, the difference between the client's predicted Humanoid and the server's repeatedly repositioned Humanoid can become large enough to cause a visible snap, collision impulse, or fling.

Merely adding the missing client initializer would be necessary, but not sufficient. The movement decision state, platform contact/carry behavior, prediction scope, model physics setup, and published Workspace settings also need to be corrected and verified.

## Scope and evidence

This review covers the TypeScript source, generated Luau, Rojo project configuration, and the three supplied references:

- Roblox Creator Hub, [**Server authority model**](https://create.roblox.com/docs/projects/server-authority) (saved 2026-07-13).
- Roblox Creator Hub, [**Server authority techniques**](https://create.roblox.com/docs/projects/server-authority/techniques) (saved 2026-07-13). This is treated as the primary implementation-techniques reference.
- DevForum, **Server Authority: How to Begin** (saved 2026-07-13).

The references require the core simulation to run through `RunService:BindToSimulation()` on both client and server so that predicted frames can be rolled back and resimulated. They also warn that forcing `PredictionMode.On` broadly has a meaningful low-end-device cost. The techniques guide additionally establishes the intended patterns for visual-only position smoothing, predictive instance creation, remote-player input prediction, and server-authority diagnostics.

The live Studio place and the `playerBoat` template are not serialized in this repository. Consequently, the actual Workspace authority settings, part anchoring, weld topology, collision groups, and assembly properties remain runtime verification items rather than confirmed defects.

## Findings, in priority order

### P0 — The client does not run the shared movement simulation (verified)

The server calls `startServerAuthorityReplicatedMotion({ mode: "server" })` in `src/server/main.server.ts`. The client only calls `startTaggedPredictionMode(...)` in `src/client/main.client.ts`; it never calls `startServerAuthorityReplicatedMotion({ mode: "client" })`. The generated client Luau confirms that there is no client `BindToSimulation` initializer.

`PredictionMode.On` tells Roblox which state is eligible for prediction/rollback. It does not create the predicted simulation. At present, the client has predicted instances but no matching code to integrate their motion from `MotionVelocity` and `MotionLookDirection`. It must wait for authoritative transforms and then correct toward them.

Likely symptoms:

- Boat movement or rotation occasionally stepping backward.
- Corrections becoming more visible as latency/jitter increases.
- The locally predicted Humanoid interacting with a platform whose motion was not predicted by the same client frame.

Theory-level correction:

- Initialize one shared simulation module from both client and server.
- Keep the fixed-step movement integration in that module.
- Ensure every state transition needed to reproduce a frame is available and deterministic on both peers.
- Do not treat enabling prediction as a replacement for running client simulation.

### P0 — Boat intent/state is generated only on server `Heartbeat` (verified)

`startWorldEntityStore()` ticks the ECS from `RunService.Heartbeat`. `MoveToPointSystem` reads the current server pivot and writes velocity and look-direction attributes there. Only afterward/elsewhere does the fixed simulation callback read those attributes and call `PivotTo`.

This splits one movement system across two clocks:

1. Variable-rate, server-only `Heartbeat` chooses heading, waypoint state, locks, and velocity.
2. Fixed rollback simulation integrates the most recently observed attributes.

Rollback can re-run the second step, but it cannot re-run the first step on the client because the ECS/path state does not exist there and is not bound to simulation. Turns, waypoint arrival, velocity changes, and locks therefore create unavoidable prediction divergence. Writing changing attributes from the server does synchronize authority, but it also creates corrections when the client did not independently predict those same values for that frame.

Theory-level correction:

- Move all movement-affecting state transitions into the shared `BindToSimulation` path, not just the final `PivotTo`.
- Represent the boat path as deterministic synchronized state, for example segment ID, segment start frame/time, start transform, target, speed, and turn rate.
- Run the same path/steering update on client and server from the same fixed `dt`.
- Use attributes for the minimum rollback state needed to recover a frame, not as a 60 Hz server-only output stream.
- Avoid `Heartbeat`, `os.clock()`, and server-only ECS data in any calculation that must be replayable during resimulation.

### P0 — Character carrying is server-only, unconditional, and conflicts with Humanoid simulation (verified)

For every carrying model, every simulation step calls `carryServerPlayers()`. That iterates every player and applies the boat's full translation/rotation delta directly to each unseated `HumanoidRootPart.CFrame`. There is no check that the character is aboard, grounded, touching the deck, or even near the boat.

Consequences:

- Server and client simulate different character transforms because the client does not run this callback.
- A normal Humanoid jump is repeatedly combined with server-side root CFrame writes, producing visible correction stages.
- A turning boat rotates characters around the boat pivot even when they should not be carried.
- Characters in the air continue receiving boat deltas merely because they are not seated.
- A delayed batch of corrections can place a root into deck/rail geometry, allowing the physics solver to generate a large separating impulse (a plausible explanation for the mobile fling).
- If more than one model has `MotionCarriesCharacters`, every character receives every model's delta.

Theory-level correction:

- Prefer engine-predicted physical platform interaction if a stable, single rigid ship assembly can provide it.
- If explicit carrying is required, maintain an explicit platform-contact/passenger state. Carry only a character confirmed to be grounded on that specific platform.
- Run the same contact/carry rule in shared fixed simulation and make its state rollback-safe.
- Stop applying platform delta after takeoff; preserve the appropriate platform velocity at the jump transition instead.
- Never iterate and reposition all players as a proxy for detecting passengers.
- Avoid fighting the Humanoid controller with unconditional per-frame `HumanoidRootPart.CFrame` writes.

### P1 — Prediction is forced far too broadly, especially for mobile (verified)

The client forces `PredictionMode.On` on a model and every descendant `BasePart`. It also does this for every player's character, not only the local character. Every tagged projectile is likewise picked up by the same prediction system.

The supplied DevForum guide explicitly warns that `PredictionMode.On` has significant low-end-device cost and should not be overused. Here, cost grows with all character parts, all ship parts, and every active projectile. The simulation callback also scans all tagged instances and allocates a new model array every fixed step. Cannon fire therefore increases both prediction work and per-step discovery work, which can make the mobile behavior degrade under load.

The official techniques guide makes the remote-character issue more concrete: by default, other players' basic Humanoids are not extrapolated from their private inputs. They render slightly in the past and do not mispredict. This project overrides that safe default by forcing every remote character hierarchy to `On` without forwarding those players' inputs to each client. Those clients therefore pay prediction cost without possessing the input stream required to reproduce remote character motion.

Theory-level correction:

- Use `On` only for gameplay-critical rollback contexts that the local client truly needs to predict.
- Leave ordinary remote Humanoids on Roblox's default behavior unless there is a demonstrated gameplay requirement to predict them.
- If remote-player input prediction is genuinely required, forward validated inputs through rollback-synchronized attributes and consume them in the shared simulation as Roblox's racing example does. Do not force prediction without supplying the inputs.
- Review whether projectiles need rollback prediction at all. Cosmetic/interpolated projectile visuals with authoritative server hit logic are often cheaper.
- Predict the relevant rigid assembly/context, not reflexively every descendant part.
- Cache registered motion objects outside the simulation callback through tag add/remove signals; do not call `GetTagged` and build an array every fixed frame.
- Use `GetPredictionMode()` during diagnostics to verify what is actually predicted on each device.

### P1 — Required Workspace settings are not reproducible from the repository (verified gap)

The Creator Hub reference requires:

1. `Workspace.AuthorityMode = Server`.
2. Next-generation replication enabled.
3. Input Action System enabled for player scripts.
4. Deferred signal behavior.
5. Fixed simulation enabled.
6. Streaming enabled.

`default.project.json` only serializes `Workspace.FilteringEnabled`. The live place may already have the six required values, but this repository cannot prove that Studio tests and the published mobile place use the same configuration. A publish/config mismatch could make outside-Studio behavior materially different.

Theory-level correction:

- Add a server startup assertion/report that logs and fails clearly when any required setting is incorrect, where Roblox permits reading the property.
- Document the required place settings beside the project and include them in release checks.
- Verify the published place, not only the Studio edit session.
- Test with Studio's separate **Server & Clients** mode; the supplied DevForum discussion notes that combined single-process testing can itself appear unusually jittery.

### P1 — The boat's physical invariants are not enforced in code (runtime risk)

The source clones `playerBoat`, assigns a pivot, and starts moving it, but it does not validate or normalize:

- A stable `PrimaryPart` named `primary`.
- Whether the assembly is consistently anchored or unanchored.
- Welds/constraints and accidental multiple assemblies.
- Massless and collision behavior of decorative parts.
- Collision groups between deck, characters, rails, and projectiles.
- Whether any scripts/constraints also write the boat transform or velocity.

`PivotTo`-teleporting a mixed or unanchored collidable assembly can fight the physics solver and inject impulses into characters. Conversely, a kinematic anchored platform needs correctly predicted motion on the client or the local Humanoid will collide against delayed geometry.

Theory-level correction:

- Choose and enforce one ship model: a validated kinematic rigid model driven deterministically by shared simulation, or a physical assembly driven by rollback-safe forces/constraints.
- Reject mixed anchoring and disconnected collidable assemblies at startup.
- Ensure there is exactly one transform authority; no animation, constraint, Heartbeat system, or legacy script should also move the root.
- Audit high-friction/snagging rail and deck collision geometry, because correction into thin geometry greatly increases fling risk.

### P1 — Simulation membership and ordering are dynamic (verified design risk)

The fixed callback discovers models through `CollectionService.GetTagged()` every time it runs. Tag membership and instance enumeration are external to the actual movement state, and enumeration order is not explicitly stable. The callback also discovers players, characters, Humanoids, and roots during the rollback step.

Rollback code should be small and deterministic. Dynamic world queries make it harder to guarantee that a replay visits the same objects in the same order and add avoidable work at 60 Hz.

Theory-level correction:

- Maintain explicit registries updated outside simulation callbacks.
- Give simulation objects stable IDs and deterministic ordering when object interactions make order observable.
- Keep lookup, visual effects, networking, and object lifecycle work outside the replayable core; pass only compact synchronized state into it.

### P2 — High-frequency attribute churn and unrelated predicted state need auditing (verified/risk)

Boat look direction and velocity are set on every server ECS tick, even when values change only slightly. Homing projectiles rewrite the same attributes continuously. On predicted instances, authoritative attribute mismatch participates in rollback. This can turn tiny steering changes into frequent resimulation and adds replication pressure.

The reference also limits rollback-synchronized attributes to the first 64 attributes on an instance, with length limits. The current boat appears below that threshold, but continuing to add gameplay/UI attributes to the same predicted model creates a fragile hidden limit.

Theory-level correction:

- Separate rollback-critical state from health/UI/cosmetic metadata where possible.
- Do not rewrite unchanged attributes.
- Synchronize compact intent/segment state and derive transforms locally instead of streaming derived heading every tick.
- Add an automated assertion for attribute count and supported types on predicted roots.

### P2 — There is no correction telemetry or production acceptance gate (verified)

The code prints startup messages but records no prediction mode, correction magnitude, simulation cost, frame time, or network conditions. Without telemetry it is difficult to distinguish network jitter from deterministic divergence or low-end simulation overload. The official techniques guide provides a purpose-built server-authority visualizer (`Ctrl+Shift+F6` on Windows) that is not represented in the current testing process.

Theory-level correction:

- In a development build, record client/server frame identifiers, boat transform error, local root error relative to the boat, correction count/magnitude, ping, packet loss if exposed, and simulation callback duration.
- Log prediction status for the local character, boat root, remote characters, and projectiles.
- Mark jump start, grounded-platform transitions, boat turns, and respawn/teleport transitions in the trace.
- Use MicroProfiler on a real mobile device with projectile load and multiple players.
- Capture all visualizer fields during each test: instance prediction success rate, input accept rate, client-server step delta and its stability, RCC heartbeat FPS, predicted instance count, and input-drop reasons.
- Treat RCC heartbeat below 59 FPS as a failed server simulation run, per the official guide, rather than diagnosing the resulting degradation as network lag.

### P2 — Projectile creation does not use predictive instance stitching (verified opportunity)

Firing is sent through a custom remote, processed by server-only mount/ECS code, and the projectile `Instance` is then created only on the server. It is tagged for forced prediction after it replicates. This cannot make the projectile appear at fire time; the client must first wait for the input/server/replication trip, after which it receives an object that still lacks client-side shared movement simulation.

The official techniques guide provides instance stitching specifically for cases such as rockets: client and server run the same creation call inside the same shared `BindToSimulation` module and frame, producing matching deterministic instance identities that Roblox merges.

This is not the cause of the character jump defect, but cannon load increases predicted-instance count and the current projectile path can add popping/jitter and mobile cost.

Theory-level correction:

- First decide whether projectiles need gameplay prediction or only immediate visual feedback.
- For true predicted projectiles, move validated fire input, projectile state transition, and deterministic instance creation into the shared simulation so `Instance.new`, `Clone`, or `fromExisting` can stitch. Both sides must execute matching creation calls in matching order/frame.
- For server-authoritative hit logic with cosmetic client responsiveness, create a non-authoritative local visual immediately and reconcile/remove it when the server projectile arrives.
- Do not assume tagging a server-created projectile with `PredictionMode.On` retroactively provides predictive creation.

### P2 — There is no simulation/render separation for correcting boat visuals (verified opportunity)

The boat model is both the simulated/collidable object and the rendered object. Any authoritative correction is therefore shown directly. The official techniques guide recommends an invisible simulated object plus a massless, anchored, non-collidable renderer that follows it with `TweenService:SmoothDamp`, optionally enabling smoothing only when an unexpected positional jump exceeds a threshold.

This technique is appropriate only after the client/server simulation is deterministic. It does not repair divergent physics. For a walkable ship, smoothing only the visible boat while characters collide with an invisible authoritative deck can also create foot sliding or visible deck/character separation, so the renderer and character presentation must be designed together.

Theory-level correction:

- Keep collision and authoritative simulation on the hidden simulation rig.
- Make the render clone strictly massless/non-collidable and update it from `RenderStepped`; never feed the smoothed pose back into physics.
- Apply correction-triggered smoothing rather than permanent latency where possible.
- Evaluate smoothing in boat-relative character presentation so the visible player does not drift against the visible deck.
- Treat this as a final presentation layer after P0/P1 simulation fixes, not as the primary jitter fix.

## Techniques-document coverage

| Official technique | Current project assessment | Required action |
| --- | --- | --- |
| Predictive instance creation/stitching | Not used; projectiles are created server-only after a custom remote trip | Use stitching only if projectiles become true shared-simulation objects, otherwise use reconciled cosmetic client visuals |
| Position smoothing | Not used; the collidable simulation boat is rendered directly | Add a non-collidable render proxy only after deterministic movement is fixed |
| Mirrored animation logic | No custom `AnimationTrack`/`LoadAnimation` code exists in this repository | Audit the live/default `Animate` setup and any Studio-only scripts; do not cache rollback-invalid tracks in future custom code |
| Predicted effects and sounds | UI/camera presentation is largely kept in client render code, which is directionally correct | Drive future effects from synchronized state and make one-shot effects tolerant of rollback/undo |
| Designing around latency | Boat acceleration is simple, but waypoint/turn state and jumping create abrupt observable divergence | Make transitions deterministic; avoid adding instantaneous movement/state changes that amplify corrections |
| Predicting other-player inputs | Remote characters are forced predicted, but their inputs are not forwarded | Restore default remote-Humanoid behavior or explicitly synchronize validated inputs if prediction is required |
| Server-authority visualizer | No evidence of metrics being captured | Make visualizer screenshots/data part of every network and mobile test pass |

## Symptom-to-cause assessment

| Observed symptom | Most plausible code causes | Confidence |
| --- | --- | --- |
| Jump rises in stages | Client does not simulate boat motion; server-only root CFrame carry fights predicted Humanoid jump; movement logic is split across clocks | High |
| Boat occasionally jitters backward | No client shared integration, followed by authoritative correction; server-only heading changes are not replayable | High |
| Mobile player flung after lag spike | Accumulated character/platform divergence followed by root correction into collidable geometry; broad prediction and tag scans worsen low-end timing | Medium-high |
| Mobile worse than PC | Every local and remote character part, ship part, and projectile is forced to `PredictionMode.On`; remote inputs are not forwarded; fixed-step tag scans and projectile growth increase device load | High |
| Outside Studio differs from Studio | Published Workspace settings may differ; real latency/jitter and mobile frame cost expose divergence hidden locally | Medium until runtime settings are captured |

## Recommended target architecture

For a walkable ship, the best long-term fit is a genuinely shared deterministic platform simulation:

1. A shared module is initialized once on both client and server.
2. One `BindToSimulation` callback advances boat path state and boat transform at a fixed frequency.
3. The authoritative server owns compact synchronized boat state; the client predicts the same next frame.
4. Platform contact/passenger state is explicit and reproducible. The local character and platform are predicted in the same simulation context.
5. Rendering, camera, sounds, UI, and cosmetic projectile presentation read simulation state from `RenderStepped` and do not alter authoritative motion. Any correction smoothing is applied only to non-collidable render proxies.
6. Prediction is narrowly enabled only for the local gameplay-critical context.
7. Objects requiring immediate predicted creation are created deterministically in shared simulation and stitched; other objects use authoritative simulation plus disposable cosmetic visuals.

An alternative is server-only boat simulation plus buffered client interpolation. That is simpler for a decorative/non-collidable boat, but it is a poor fit for a platform players walk and jump on unless character movement is converted to a carefully designed boat-relative controller. Interpolating only the visible boat while the authoritative collision deck remains delayed will not solve the core interaction.

## Suggested remediation sequence

### Phase 1 — Prove the diagnosis

- Capture the six Workspace properties in a published server/client session.
- Open the server-authority visualizer and capture prediction success, input acceptance, step delta, RCC heartbeat FPS, predicted instance count, and drop reasons.
- Add temporary correction/prediction telemetry for boat/root-relative errors not covered by the visualizer.
- Test once with boat character-carry disabled and once with projectile prediction disabled; compare jump and mobile traces.
- Confirm the ship's anchor/weld/collision structure and identify every writer of its transform.

### Phase 2 — Repair the simulation boundary

- Initialize shared movement on the client.
- Move steering, path transitions, locks, and integration into shared fixed simulation.
- Replace the per-frame `GetTagged` scan with a cached registry.
- Stop rewriting unchanged derived attributes.

This phase must be tested as a unit. Adding only the client initializer leaves server-only path changes and unsafe character carrying in place.

### Phase 3 — Replace character carrying

- Prefer stable predicted platform physics if practical.
- Otherwise implement explicit boat-relative grounded state, shared on client/server and rollback-safe.
- Transfer platform velocity once at jump takeoff and stop platform delta carry while airborne.
- Remove unconditional writes to every player's root.

### Phase 4 — Reduce prediction and production-load test

- Limit forced prediction to the local character and the minimum ship context.
- Move remote characters and projectiles to `Automatic`, `Off`, or interpolation according to gameplay needs.
- Decide explicitly between stitched predicted projectiles and authoritative projectiles with local cosmetic launch visuals.
- Add an optional non-collidable render proxy for correction smoothing only after raw simulation error is acceptably low.
- Profile on representative low-end mobile hardware under maximum cannon/projectile and player load.

## Acceptance test matrix

Run separate server/client processes and at least one published private-server test. Cover:

- Round-trip latency: approximately 30, 80, 150, and 250 ms.
- Added jitter: 0, 20, and 50 ms.
- Packet loss: 0%, 1%, and 3% where tooling permits.
- Client render rates: 30 and 60 FPS.
- One and multiple players, including players on and off the ship.
- Straight travel, maximum-rate turns, waypoint transitions, stop/start, respawn, and ship destruction.
- Standing still, walking with/against ship motion, repeated jumps, jumping at rails/edges, landing during a turn, seating, and unseating.
- No projectiles versus worst-case concurrent projectile count.
- Server-authority visualizer captures for each network tier; reject any run with RCC heartbeat below 59 FPS before interpreting its movement quality.

Suggested project-specific gates (not Roblox guarantees): routine corrections should be visually imperceptible; prediction success and input acceptance should remain high and stable; client-server step delta should not oscillate under a stable network profile; predicted-instance count should remain bounded under cannon load; no character should be moved by a ship it is not standing on; no jump should contain discrete vertical plateaus; and no test should produce a collision fling. Track numerical correction distributions and set final thresholds after a clean baseline, rather than accepting results by eye alone.

## Bottom line

The additional official techniques guide reinforces rather than overturns the original diagnosis. The issue is not simply insufficient smoothing. The system currently opts objects into rollback prediction without supplying the client with the same replayable movement simulation, while separately teleporting all Humanoid roots on the server. Roblox's visual smoothing and instance-stitching techniques become useful only after the corresponding simulation is shared and deterministic. Production readiness requires correcting that architecture first, narrowing prediction (especially remote characters and projectiles), then adding render-only smoothing/immediate visuals and validating the actual place/model configuration on real mobile networks.
