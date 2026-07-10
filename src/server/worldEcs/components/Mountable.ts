import { componentType } from "@rbxts/ecs";

export interface MountableData {
	kind: string;
}

export const Mountable = componentType<MountableData>("Mountable");
