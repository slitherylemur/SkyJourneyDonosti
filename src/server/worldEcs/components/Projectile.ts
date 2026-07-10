import { componentType } from "@rbxts/ecs";

export interface ProjectileData {
	baseDamage: number;
	power: number;
	distanceTraveled: number;
	maxRange: number;
	lastPosition: Vector3;
	ignoreInstances: Instance[];
}

export const Projectile = componentType<ProjectileData>("Projectile");
