import { componentType } from "@rbxts/ecs";

export interface ShooterData {
	power: number;
	cooldownSeconds: number;
	lastFiredAt: number;
}

export const Shooter = componentType<ShooterData>("Shooter");
