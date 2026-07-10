import { componentType } from "@rbxts/ecs";

export interface MountedByData {
	player: Player;
}

export const MountedBy = componentType<MountedByData>("MountedBy");
