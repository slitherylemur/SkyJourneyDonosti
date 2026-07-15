import { CollectionService, Players, RunService, Workspace } from "@rbxts/services";

export const REPLICATED_MOTION_TAG = "ReplicatedMotion";
export const MOTION_RIDER_TAG = "MotionRider";

export const MotionAttributes = {
	Speed: "MotionSpeed",
	Direction: "MotionDirection",
	RotationSpeed: "MotionRotationSpeed",
	Enabled: "MotionEnabled",
	CarriesCharacters: "MotionCarriesCharacters",
	Id: "MotionId",
} as const;

const DEFAULT_FACING = new Vector3(0, 0, -1);
const DIRECTION_EPSILON = 0.0001;
const OPPOSITE_DOT_EPSILON = 0.9999;

export interface ReplicatedMotionOptions {
	mode: "server" | "client";
}

interface MotionStepResult {
	currentPivot: CFrame;
	deltaPivot: CFrame;
}

let started = false;
const motionModels = new Set<Model>();
const riderModels = new Set<Model>();
const playerCharacters = new Set<Model>();
let orderedMotionModels = new Array<Model>();
let motionOrderDirty = true;

function getBooleanAttribute(instance: Instance, name: string, fallback: boolean): boolean {
	const value = instance.GetAttribute(name);
	return typeIs(value, "boolean") ? value : fallback;
}

function getNumberAttribute(instance: Instance, name: string, fallback: number): number {
	const value = instance.GetAttribute(name);
	return typeIs(value, "number") && value === value && math.abs(value) < math.huge ? value : fallback;
}

function getVectorAttribute(instance: Instance, name: string, fallback: Vector3): Vector3 {
	const value = instance.GetAttribute(name);
	return typeIs(value, "Vector3") ? value : fallback;
}

function unitOr(vector: Vector3, fallback: Vector3): Vector3 {
	return vector.Magnitude > DIRECTION_EPSILON ? vector.Unit : fallback;
}

function chooseOppositeAxis(facing: Vector3): Vector3 {
	let axis = facing.Cross(Vector3.yAxis);
	if (axis.Magnitude <= DIRECTION_EPSILON) {
		axis = facing.Cross(Vector3.xAxis);
	}
	return unitOr(axis, Vector3.zAxis);
}

function rotateTowards(current: Vector3, desired: Vector3, maxRadians: number): Vector3 {
	const from = unitOr(current, DEFAULT_FACING);
	const to = unitOr(desired, from);
	const dot = math.clamp(from.Dot(to), -1, 1);
	const angle = math.acos(dot);

	if (angle <= DIRECTION_EPSILON) {
		return to;
	}

	const step = math.min(math.max(maxRadians, 0), angle);
	if (step <= 0) {
		return from;
	}

	let axis = from.Cross(to);
	if (axis.Magnitude <= DIRECTION_EPSILON) {
		axis = dot <= -OPPOSITE_DOT_EPSILON ? chooseOppositeAxis(from) : Vector3.yAxis;
	}

	return unitOr(CFrame.fromAxisAngle(axis.Unit, step).VectorToWorldSpace(from), to);
}

function getStableUp(previousPivot: CFrame, facing: Vector3): Vector3 {
	let up = previousPivot.UpVector;
	if (math.abs(up.Dot(facing)) > OPPOSITE_DOT_EPSILON) {
		up = previousPivot.RightVector;
	}
	if (math.abs(up.Dot(facing)) > OPPOSITE_DOT_EPSILON) {
		up = Vector3.yAxis;
	}
	return up;
}

function stepMotionFromAttributes(model: Model, dt: number): MotionStepResult {
	const previousPivot = model.GetPivot();
	const currentFacing = unitOr(previousPivot.LookVector, DEFAULT_FACING);
	const desiredDirection = unitOr(
		getVectorAttribute(model, MotionAttributes.Direction, currentFacing),
		currentFacing,
	);
	const rotationSpeed = math.max(getNumberAttribute(model, MotionAttributes.RotationSpeed, 0), 0);
	const nextFacing = rotateTowards(currentFacing, desiredDirection, rotationSpeed * dt);
	const speed = math.max(getNumberAttribute(model, MotionAttributes.Speed, 0), 0);
	const nextPosition = previousPivot.Position.add(nextFacing.mul(speed * dt));
	const currentPivot = CFrame.lookAt(
		nextPosition,
		nextPosition.add(nextFacing),
		getStableUp(previousPivot, nextFacing),
	);

	return {
		currentPivot,
		deltaPivot: currentPivot.mul(previousPivot.Inverse()),
	};
}

function carryCharacter(character: Model, deltaPivot: CFrame): void {
	const root = character.FindFirstChild("HumanoidRootPart");
	if (root === undefined || !root.IsA("BasePart")) {
		return;
	}

	const humanoid = character.FindFirstChildOfClass("Humanoid");
	if (humanoid !== undefined && humanoid.Sit) {
		return;
	}

	root.CFrame = deltaPivot.mul(root.CFrame);
}

function carryOccupants(deltaPivot: CFrame): void {
	for (const character of playerCharacters) {
		if (character.IsDescendantOf(game)) {
			carryCharacter(character, deltaPivot);
		}
	}

	for (const rider of riderModels) {
		if (playerCharacters.has(rider) || !rider.IsDescendantOf(game)) {
			continue;
		}
		rider.PivotTo(deltaPivot.mul(rider.GetPivot()));
	}
}

function stepMotionModel(model: Model, dt: number): void {
	if (!model.IsDescendantOf(Workspace) || !getBooleanAttribute(model, MotionAttributes.Enabled, true)) {
		return;
	}

	const result = stepMotionFromAttributes(model, dt);
	model.PivotTo(result.currentPivot);

	if (getBooleanAttribute(model, MotionAttributes.CarriesCharacters, false)) {
		carryOccupants(result.deltaPivot);
	}
}

function getMotionSortKey(model: Model): string {
	const id = model.GetAttribute(MotionAttributes.Id);
	if (typeIs(id, "string")) {
		return `s:${id}`;
	}
	if (typeIs(id, "number")) {
		return `n:${id}`;
	}
	return `p:${model.GetFullName()}`;
}

function getOrderedMotionModels(): Model[] {
	if (!motionOrderDirty) {
		return orderedMotionModels;
	}

	orderedMotionModels = new Array<Model>();
	for (const model of motionModels) {
		orderedMotionModels.push(model);
	}
	orderedMotionModels.sort((a, b) => getMotionSortKey(a) < getMotionSortKey(b));
	motionOrderDirty = false;
	return orderedMotionModels;
}

function addMotionInstance(instance: Instance): void {
	if (instance.IsA("Model")) {
		motionModels.add(instance);
		motionOrderDirty = true;
	}
}

function removeMotionInstance(instance: Instance): void {
	if (instance.IsA("Model")) {
		motionModels.delete(instance);
		motionOrderDirty = true;
	}
}

function addRiderInstance(instance: Instance): void {
	if (instance.IsA("Model")) {
		riderModels.add(instance);
	}
}

function removeRiderInstance(instance: Instance): void {
	if (instance.IsA("Model")) {
		riderModels.delete(instance);
	}
}

function bindPlayer(player: Player): void {
	if (player.Character !== undefined) {
		playerCharacters.add(player.Character);
	}
	player.CharacterAdded.Connect((character) => playerCharacters.add(character));
	player.CharacterRemoving.Connect((character) => playerCharacters.delete(character));
}

function initializeRegistries(): void {
	for (const instance of CollectionService.GetTagged(REPLICATED_MOTION_TAG)) {
		addMotionInstance(instance);
	}
	CollectionService.GetInstanceAddedSignal(REPLICATED_MOTION_TAG).Connect(addMotionInstance);
	CollectionService.GetInstanceRemovedSignal(REPLICATED_MOTION_TAG).Connect(removeMotionInstance);

	for (const instance of CollectionService.GetTagged(MOTION_RIDER_TAG)) {
		addRiderInstance(instance);
	}
	CollectionService.GetInstanceAddedSignal(MOTION_RIDER_TAG).Connect(addRiderInstance);
	CollectionService.GetInstanceRemovedSignal(MOTION_RIDER_TAG).Connect(removeRiderInstance);

	for (const player of Players.GetPlayers()) {
		bindPlayer(player);
	}
	Players.PlayerAdded.Connect(bindPlayer);
	Players.PlayerRemoving.Connect((player) => {
		if (player.Character !== undefined) {
			playerCharacters.delete(player.Character);
		}
	});
}

export function startServerAuthorityReplicatedMotion(options: ReplicatedMotionOptions): void {
	if (started) {
		warn(`[serverAuthorityReplicatedMotion.ts] Ignored duplicate start in ${options.mode} mode`);
		return;
	}
	started = true;

	initializeRegistries();
	RunService.BindToSimulation((dt) => {
		for (const model of getOrderedMotionModels()) {
			stepMotionModel(model, dt);
		}
	});

	print(`[serverAuthorityReplicatedMotion.ts] Started replicated motion in ${options.mode} mode`);
}
