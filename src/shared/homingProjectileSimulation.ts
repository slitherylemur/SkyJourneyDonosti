import { CollectionService, RunService, Workspace } from "@rbxts/services";
import { PROJECTILE_ROTATION_SPEED } from "shared/mountShared";

export const HOMING_PROJECTILE_TAG = "HomingProjectileMotion";
export const HOMING_TARGET_VALUE_NAME = "Target";
export const HOMING_SPEED_ATTRIBUTE = "Speed";

const EPSILON = 0.0001;
const DEFAULT_DIRECTION = new Vector3(0, 0, -1);
const models = new Set<Model>();
let started = false;

function getTargetPosition(target: Instance): Vector3 | undefined {
	if (target.IsA("Attachment")) {
		return target.WorldPosition;
	}
	if (target.IsA("BasePart")) {
		return target.Position;
	}
	if (target.IsA("Model")) {
		return target.GetPivot().Position;
	}
	return undefined;
}

function rotateTowards(current: Vector3, desired: Vector3, maxRadians: number): Vector3 {
	const from = current.Magnitude > EPSILON ? current.Unit : DEFAULT_DIRECTION;
	const to = desired.Magnitude > EPSILON ? desired.Unit : from;
	const angle = math.acos(math.clamp(from.Dot(to), -1, 1));
	if (angle <= EPSILON) {
		return to;
	}

	let axis = from.Cross(to);
	if (axis.Magnitude <= EPSILON) {
		axis = from.Cross(math.abs(from.Y) < 0.99 ? Vector3.yAxis : Vector3.xAxis);
	}
	const step = math.min(math.max(maxRadians, 0), angle);
	return CFrame.fromAxisAngle(axis.Unit, step).VectorToWorldSpace(from).Unit;
}

function stepModel(model: Model, dt: number): void {
	if (!model.IsDescendantOf(Workspace)) {
		return;
	}

	const speedValue = model.GetAttribute(HOMING_SPEED_ATTRIBUTE);
	const speed = typeIs(speedValue, "number") ? math.max(speedValue, 0) : 0;
	const previous = model.GetPivot();
	let direction = previous.LookVector;
	const targetValue = model.FindFirstChild(HOMING_TARGET_VALUE_NAME);
	const target = targetValue?.IsA("ObjectValue") ? targetValue.Value : undefined;
	if (target !== undefined) {
		const targetPosition = getTargetPosition(target);
		if (targetPosition !== undefined) {
			direction = rotateTowards(direction, targetPosition.sub(previous.Position), PROJECTILE_ROTATION_SPEED * dt);
		}
	}

	const position = previous.Position.add(direction.mul(speed * dt));
	model.PivotTo(CFrame.lookAt(position, position.add(direction), previous.UpVector));
}

function addInstance(instance: Instance): void {
	if (instance.IsA("Model")) {
		models.add(instance);
	}
}

function removeInstance(instance: Instance): void {
	if (instance.IsA("Model")) {
		models.delete(instance);
	}
}

export function startHomingProjectileSimulation(): void {
	if (started) {
		return;
	}
	started = true;

	for (const instance of CollectionService.GetTagged(HOMING_PROJECTILE_TAG)) {
		addInstance(instance);
	}
	CollectionService.GetInstanceAddedSignal(HOMING_PROJECTILE_TAG).Connect(addInstance);
	CollectionService.GetInstanceRemovedSignal(HOMING_PROJECTILE_TAG).Connect(removeInstance);

	RunService.BindToSimulation((dt) => {
		for (const model of models) {
			stepModel(model, dt);
		}
	});
}
