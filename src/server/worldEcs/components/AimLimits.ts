import { componentType } from "@rbxts/ecs";

export interface AimLimitsData {
	yawLimit: number;
	pitchMin: number;
	pitchMax: number;
}

export const AimLimits = componentType<AimLimitsData>("AimLimits");
