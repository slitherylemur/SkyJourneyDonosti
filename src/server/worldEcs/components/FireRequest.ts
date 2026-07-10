import { componentType } from "@rbxts/ecs";

export interface FireRequestData {
	targetPos: Vector3;
}

export const FireRequest = componentType<FireRequestData>("FireRequest");
