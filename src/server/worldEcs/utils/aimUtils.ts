import type { AimLimitsData } from "server/worldEcs/components/AimLimits";

export function clampDirectionWithAimLimits(
	basePart: BasePart,
	worldDirection: Vector3,
	aimLimits: AimLimitsData,
): Vector3 {
	const localDirection = basePart.CFrame.VectorToObjectSpace(worldDirection);
	const yaw = math.clamp(math.atan2(localDirection.X, localDirection.Z), -aimLimits.yawLimit, aimLimits.yawLimit);
	const pitch = math.clamp(math.asin(localDirection.Y), aimLimits.pitchMin, aimLimits.pitchMax);
	const clampedLocal = new Vector3(
		math.sin(yaw) * math.cos(pitch),
		math.sin(pitch),
		math.cos(yaw) * math.cos(pitch),
	);

	return basePart.CFrame.VectorToWorldSpace(clampedLocal).Unit;
}

export function getMuzzlePosition(barrelPart: BasePart, forwardSign: number): Vector3 {
	return barrelPart.CFrame.mul(new Vector3(0, 0, forwardSign * barrelPart.Size.Z * 0.5));
}
