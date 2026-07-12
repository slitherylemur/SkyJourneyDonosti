import {
	AIM_PITCH_MAX_ATTRIBUTE,
	AIM_PITCH_MIN_ATTRIBUTE,
	AIM_YAW_LIMIT_ATTRIBUTE,
} from "shared/mountShared";

export interface AimLimitValues {
	yawLimit: number;
	pitchMin: number;
	pitchMax: number;
}

function getNumberAttribute(instance: Instance, name: string, fallback: number): number {
	const value = instance.GetAttribute(name);
	return typeIs(value, "number") ? value : fallback;
}

export function getAimLimits(mountModel: Model): AimLimitValues {
	return {
		yawLimit: getNumberAttribute(mountModel, AIM_YAW_LIMIT_ATTRIBUTE, math.rad(60)),
		pitchMin: getNumberAttribute(mountModel, AIM_PITCH_MIN_ATTRIBUTE, math.rad(-5)),
		pitchMax: getNumberAttribute(mountModel, AIM_PITCH_MAX_ATTRIBUTE, math.rad(45)),
	};
}

export function clampAimDirection(
	basePart: BasePart,
	yaw: number,
	pitch: number,
	limits: AimLimitValues,
): Vector3 {
	const clampedYaw = math.clamp(yaw, -limits.yawLimit, limits.yawLimit);
	const clampedPitch = math.clamp(pitch, limits.pitchMin, limits.pitchMax);
	const localDirection = new Vector3(
		math.sin(clampedYaw) * math.cos(clampedPitch),
		math.sin(clampedPitch),
		math.cos(clampedYaw) * math.cos(clampedPitch),
	);
	return basePart.CFrame.VectorToWorldSpace(localDirection).Unit;
}

export function isWithinAimLimits(mountModel: Model, worldPosition: Vector3): boolean {
	const basePart = mountModel.FindFirstChild("Part");
	if (basePart === undefined || !basePart.IsA("BasePart")) {
		return false;
	}

	const offset = worldPosition.sub(basePart.Position);
	if (offset.Magnitude < 0.001) {
		return true;
	}
	const localDirection = basePart.CFrame.VectorToObjectSpace(offset.Unit);
	const yaw = math.atan2(localDirection.X, localDirection.Z);
	const pitch = math.asin(math.clamp(localDirection.Y, -1, 1));
	const limits = getAimLimits(mountModel);
	return math.abs(yaw) <= limits.yawLimit && pitch >= limits.pitchMin && pitch <= limits.pitchMax;
}
