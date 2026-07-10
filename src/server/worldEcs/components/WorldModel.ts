import { componentType } from "@rbxts/ecs";

export interface WorldModelData {
	model: Model;
	radius: number;
}

export const WorldModel = componentType<WorldModelData>("WorldModel");
