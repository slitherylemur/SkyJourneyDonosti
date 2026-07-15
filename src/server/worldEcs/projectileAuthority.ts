import type { EntityRef } from "@rbxts/ecs";
import { HomingProjectile, Projectile, Velocity, WorldModel } from "server/worldEcs/components";
import { attachEntityToModel, getEcs } from "server/worldEcs/ecs";
import type { RegisteredHitPoint } from "server/worldEcs/hitPointRegistry";

export interface ProjectileAuthoritySpec {
	model: Model;
	direction: Vector3;
	position: Vector3;
	speed: number;
	rotationSpeed: number;
	damage: number;
	maxRange: number;
	ignoreInstances: Instance[];
	hitPointId?: string;
	hitPoint?: RegisteredHitPoint;
}

export function registerProjectileAuthority(spec: ProjectileAuthoritySpec): EntityRef {
	const ecs = getEcs();
	const sharedComponents = [
		{
			type: Velocity,
			data: { value: spec.direction.mul(spec.speed) },
		},
		{
			type: WorldModel,
			data: { model: spec.model, radius: 1 },
		},
	];

	const entity =
		spec.hitPoint !== undefined && spec.hitPointId !== undefined
			? ecs.createEntity([
					...sharedComponents,
					{
						type: HomingProjectile,
						data: {
							hitPointId: spec.hitPointId,
							attachment: spec.hitPoint.attachment,
							attackerPosition: spec.position,
							speed: spec.speed,
							rotationSpeed: spec.rotationSpeed,
							damage: spec.damage,
						},
					},
				])
			: ecs.createEntity([
					...sharedComponents,
					{
						type: Projectile,
						data: {
							distanceTraveled: 0,
							maxRange: spec.maxRange,
							lastPosition: spec.position,
							ignoreInstances: spec.ignoreInstances,
						},
					},
				]);

	attachEntityToModel(spec.model, entity);
	return entity;
}
