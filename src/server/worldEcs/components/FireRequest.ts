import { componentType } from "@rbxts/ecs";

export interface FireRequestData {
	targetPos?: Vector3;
	hitPointId?: string;
}

export const FireRequest = componentType<FireRequestData>("FireRequest");
