import { CollectionService, Players, RunService } from "@rbxts/services";

export const REPLICATED_MOTION_TAG = "ReplicatedMotion";

/** Models tagged as riders (e.g. boarded NPCs) get carried by any character-carrying motion model. */
export const MOTION_RIDER_TAG = "MotionRider";

export const MotionAttributes = {
	Velocity: "MotionVelocity",
	LookDirection: "MotionLookDirection",
	LockLookDirection: "MotionLockLookDirection",
	CarriesCharacters: "MotionCarriesCharacters",
} as const;

const DEFAULT_FACING = new Vector3(0, 0, -1);

export interface ReplicatedMotionOptions {
	mode: "server" | "client";
}

interface MotionStepResult {
	currentPivot: CFrame;
	deltaPivot: CFrame;
}

function horizontalMagnitude(vector: Vector3): number {
	return math.sqrt(vector.X * vector.X + vector.Z * vector.Z);
}

function horizontalUnitOr(vector: Vector3, fallback: Vector3): Vector3 {
	const flat = new Vector3(vector.X, 0, vector.Z);
	const magnitude = horizontalMagnitude(flat);
	if (magnitude < 0.001) {
		return fallback;
	}
	return flat.div(magnitude);
}

function getBooleanAttribute(instance: Instance, name: string, fallback: boolean): boolean {
	const value = instance.GetAttribute(name);
	return typeIs(value, "boolean") ? value : fallback;
}

function getVectorAttribute(instance: Instance, name: string, fallback: Vector3): Vector3 {
	const value = instance.GetAttribute(name);
	return typeIs(value, "Vector3") ? value : fallback;
}

function carryCharacter(character: Model, deltaPivot: CFrame): void {
	const root = character.FindFirstChild("HumanoidRootPart");
	if (root === undefined || !root.IsA("BasePart")) {
		return;
	}

	// Seated characters are carried by their SeatWeld; writing CFrame here fights the weld.
	const humanoid = character.FindFirstChildOfClass("Humanoid");
	if (humanoid !== undefined && humanoid.Sit) {
		return;
	}

	root.CFrame = deltaPivot.mul(root.CFrame);
}

function carryServerPlayers(deltaPivot: CFrame): void {
	for (const player of Players.GetPlayers()) {
		const character = player.Character;
		if (character !== undefined) {
			carryCharacter(character, deltaPivot);
		}
	}
}

function carryRiderModels(deltaPivot: CFrame): void {
	for (const instance of CollectionService.GetTagged(MOTION_RIDER_TAG)) {
		if (instance.IsA("Model")) {
			instance.PivotTo(deltaPivot.mul(instance.GetPivot()));
		}
	}
}

function stepMotionFromAttributes(model: Model, dt: number): MotionStepResult {
	const previousPivot = model.GetPivot();
	const velocity = getVectorAttribute(model, MotionAttributes.Velocity, new Vector3(0, 0, 0));
	const lookDirection = horizontalUnitOr(
		getVectorAttribute(model, MotionAttributes.LookDirection, DEFAULT_FACING),
		DEFAULT_FACING,
	);
	const nextPosition = previousPivot.Position.add(
		new Vector3(velocity.X * dt, velocity.Y * dt, velocity.Z * dt),
	);
	const lockLookDirection = getBooleanAttribute(model, MotionAttributes.LockLookDirection, false);
	const nextLookDirection = lockLookDirection ? lookDirection : horizontalUnitOr(velocity, lookDirection);
	const currentPivot = CFrame.lookAt(nextPosition, nextPosition.add(nextLookDirection));

	return {
		currentPivot,
		deltaPivot: currentPivot.mul(previousPivot.Inverse()),
	};
}

function stepMotionModel(mode: ReplicatedMotionOptions["mode"], model: Model, dt: number): void {
	const result = stepMotionFromAttributes(model, dt);
	model.PivotTo(result.currentPivot);

	if (!getBooleanAttribute(model, MotionAttributes.CarriesCharacters, false)) {
		return;
	}

	carryServerPlayers(result.deltaPivot);

	if (mode === "server") {
		carryRiderModels(result.deltaPivot);
	}
}

function getAllMotionModels(): Model[] {
	const models = new Array<Model>();
	for (const instance of CollectionService.GetTagged(REPLICATED_MOTION_TAG)) {
		if (instance.IsA("Model")) {
			models.push(instance);
		}
	}
	return models;
}

export function startServerAuthorityReplicatedMotion(options: ReplicatedMotionOptions): void {
	RunService.BindToSimulation((dt) => {
		for (const model of getAllMotionModels()) {
			stepMotionModel(options.mode, model, dt);
		}
	});

	print(`[serverAuthorityReplicatedMotion.ts] Started replicated motion in ${options.mode} mode`);
}
