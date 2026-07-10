import { componentType } from "@rbxts/ecs";

export interface HealthData {
	current: number;
	max: number;
}

export const Health = componentType<HealthData>("Health");
