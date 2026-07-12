import { componentType } from "@rbxts/ecs";

export interface HomingProjectileData {
	hitPointId: string;
	attachment: Attachment;
	speed: number;
	damage: number;
}

export const HomingProjectile = componentType<HomingProjectileData>("HomingProjectile");
