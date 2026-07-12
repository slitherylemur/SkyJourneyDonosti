import { componentType } from "@rbxts/ecs";

export interface ProjectileData {
	distanceTraveled: number;
	maxRange: number;
	lastPosition: Vector3;
	ignoreInstances: Instance[];
}

export const Projectile = componentType<ProjectileData>("Projectile");
