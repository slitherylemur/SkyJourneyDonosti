import { componentType } from "@rbxts/ecs";

export interface HomingProjectileData {
	hitPointId: string;
	attachment: Attachment;
	/** Where the attacker fired from, used for directional damage feedback. */
	attackerPosition: Vector3;
	speed: number;
	damage: number;
}

export const HomingProjectile = componentType<HomingProjectileData>("HomingProjectile");
