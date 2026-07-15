import { Players, RunService } from "@rbxts/services";
import { getAimLimits } from "shared/aimLimits";
import { BARREL_FORWARD_SIGN, CANNON_COOLDOWN, PROJECTILE_ROTATION_SPEED, PROJECTILE_SPEED } from "shared/mountShared";
import { getProjectileInputActions } from "shared/projectileInput";
import { createProjectileMotionModel } from "shared/projectileMotion";

const FIRE_HELD_ATTRIBUTE = "ProjectileFireHeld";
const FIRE_COOLDOWN_ATTRIBUTE = "ProjectileFireCooldown";
const INPUT_EPSILON = 0.0001;

interface ProjectileRig {
	basePart: BasePart;
	barrelPart: BasePart;
	barrelWeld: Weld;
}

export interface ProjectileSpawnEvent {
	player: Player;
	mount: Model;
	model: Model;
	position: Vector3;
	direction: Vector3;
	targeted: boolean;
}

export interface ProjectileSimulationServerHooks {
	validate: (player: Player, mount: Model, direction: Vector3, targeted: boolean) => Vector3 | undefined;
	onCreated: (event: ProjectileSpawnEvent) => void;
}

export interface ProjectileSimulationOptions {
	mode: "server" | "client";
	serverHooks?: ProjectileSimulationServerHooks;
}

let started = false;
const playerMounts = new Map<Player, Model>();

export function setProjectileSimulationMount(player: Player, mount: Model | undefined): void {
	if (mount === undefined) {
		playerMounts.delete(player);
		return;
	}
	playerMounts.set(player, mount);
}

function resolveRig(model: Model): ProjectileRig | undefined {
	const basePart = model.FindFirstChild("Part");
	const barrelPart = model.FindFirstChild("canonBarrel");
	if (
		basePart === undefined ||
		!basePart.IsA("BasePart") ||
		barrelPart === undefined ||
		!barrelPart.IsA("BasePart")
	) {
		return undefined;
	}
	const barrelWeld = barrelPart.FindFirstChildOfClass("Weld");
	if (barrelWeld === undefined) {
		return undefined;
	}
	return { basePart, barrelPart, barrelWeld };
}

function clampDirection(mount: Model, rig: ProjectileRig, direction: Vector3): Vector3 {
	const fallback = rig.basePart.CFrame.LookVector;
	const worldDirection = direction.Magnitude > INPUT_EPSILON ? direction.Unit : fallback;
	const localDirection = rig.basePart.CFrame.VectorToObjectSpace(worldDirection);
	const limits = getAimLimits(mount);
	const yaw = math.clamp(math.atan2(localDirection.X, localDirection.Z), -limits.yawLimit, limits.yawLimit);
	const pitch = math.clamp(math.asin(math.clamp(localDirection.Y, -1, 1)), limits.pitchMin, limits.pitchMax);
	const localClamped = new Vector3(math.sin(yaw) * math.cos(pitch), math.sin(pitch), math.cos(yaw) * math.cos(pitch));
	return rig.basePart.CFrame.VectorToWorldSpace(localClamped).Unit;
}

function getMuzzlePosition(rig: ProjectileRig, direction: Vector3): Vector3 {
	const pivot = rig.basePart.CFrame.mul(rig.barrelWeld.C1).Position;
	return pivot.add(direction.mul(BARREL_FORWARD_SIGN * rig.barrelPart.Size.Z * 0.5));
}

function aimRig(rig: ProjectileRig, direction: Vector3): void {
	const pivot = rig.basePart.CFrame.mul(rig.barrelWeld.C1).Position;
	const desired = CFrame.lookAt(pivot, pivot.sub(direction));
	rig.barrelWeld.C0 = desired.Inverse().mul(rig.basePart.CFrame).mul(rig.barrelWeld.C1);
}

function getBooleanState(value: unknown): boolean {
	return typeIs(value, "boolean") && value;
}

function getCooldown(mount: Model): number {
	const value = mount.GetAttribute(FIRE_COOLDOWN_ATTRIBUTE);
	return typeIs(value, "number") ? math.max(value, 0) : 0;
}

function setCooldown(mount: Model, value: number): void {
	mount.SetAttribute(FIRE_COOLDOWN_ATTRIBUTE, math.max(value, 0));
}

function stepPlayer(options: ProjectileSimulationOptions, player: Player, dt: number): void {
	const mount = playerMounts.get(player);
	if (mount === undefined || !mount.IsDescendantOf(game)) {
		return;
	}

	const actions = getProjectileInputActions(player);
	const rig = resolveRig(mount);
	if (actions === undefined || rig === undefined) {
		return;
	}

	const cooldown = math.max(getCooldown(mount) - dt, 0);
	setCooldown(mount, cooldown);

	const pressed = getBooleanState(actions.fire.GetState());
	const wasPressed = mount.GetAttribute(FIRE_HELD_ATTRIBUTE) === true;
	mount.SetAttribute(FIRE_HELD_ATTRIBUTE, pressed);
	if (!pressed || wasPressed || cooldown > 0) {
		return;
	}

	const aimState = actions.aim.GetState();
	if (!typeIs(aimState, "Vector3") || aimState.Magnitude <= INPUT_EPSILON) {
		return;
	}

	const targeted = getBooleanState(actions.targeted.GetState());
	let direction = clampDirection(mount, rig, aimState);
	if (options.mode === "server") {
		direction = options.serverHooks?.validate(player, mount, direction, targeted) ?? Vector3.zero;
		if (direction.Magnitude <= INPUT_EPSILON) {
			return;
		}
		direction = direction.Unit;
	}

	aimRig(rig, direction);
	const position = getMuzzlePosition(rig, direction);
	const model = createProjectileMotionModel({
		position,
		direction,
		speed: PROJECTILE_SPEED,
		rotationSpeed: PROJECTILE_ROTATION_SPEED,
	});
	setCooldown(mount, CANNON_COOLDOWN);

	if (options.mode === "server") {
		options.serverHooks?.onCreated({ player, mount, model, position, direction, targeted });
	}
}

export function startProjectileSimulation(options: ProjectileSimulationOptions): void {
	if (started) {
		warn(`[projectileSimulation.ts] Ignored duplicate start in ${options.mode} mode`);
		return;
	}
	started = true;

	RunService.BindToSimulation(
		(dt) => {
			if (options.mode === "client") {
				stepPlayer(options, Players.LocalPlayer, dt);
				return;
			}
			for (const player of Players.GetPlayers()) {
				stepPlayer(options, player, dt);
			}
		},
		undefined,
		1000,
	);
}
