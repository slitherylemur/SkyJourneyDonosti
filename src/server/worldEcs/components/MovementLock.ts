import { componentType } from "@rbxts/ecs";

export interface MovementLockData {
	until: number;
}

export const MovementLock = componentType<MovementLockData>("MovementLock");
