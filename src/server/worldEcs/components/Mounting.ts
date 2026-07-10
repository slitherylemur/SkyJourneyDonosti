import { componentType, type EntityRef } from "@rbxts/ecs";

export interface MountingData {
	mountEntity: EntityRef;
	mountModel: Model;
}

export const Mounting = componentType<MountingData>("Mounting");
