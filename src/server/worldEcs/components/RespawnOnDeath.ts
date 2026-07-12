import { componentType } from "@rbxts/ecs";

export interface RespawnOnDeathData {
	enabled: true;
}

export const RespawnOnDeath = componentType<RespawnOnDeathData>("RespawnOnDeath");
