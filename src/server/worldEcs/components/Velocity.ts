import { componentType } from "@rbxts/ecs";

export interface VelocityData {
	value: Vector3;
}

export const Velocity = componentType<VelocityData>("Velocity");
