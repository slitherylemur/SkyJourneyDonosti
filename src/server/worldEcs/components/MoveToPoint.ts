import { componentType } from "@rbxts/ecs";

export interface MoveToPointData {
	target: Vector3 | undefined;
	speed: number;
	rotationSpeed: number;
	arriveDistance: number;
	reached: boolean;
	pointVelocity?: Vector3;
}

export const MoveToPoint = componentType<MoveToPointData>("MoveToPoint");
