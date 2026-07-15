import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import { HomingProjectile, WorldModel } from "server/worldEcs/components";
import { applyHitPointDamage } from "server/worldEcs/hitPointRegistry";
import { MotionAttributes } from "shared/serverAuthorityReplicatedMotion";

export class HomingProjectileSystem implements System {
	public getQuery(): Query {
		return new Query().all(HomingProjectile, WorldModel);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, commands: CommandBuffer, dt: number): void {
		for (const chunk of chunks) {
			const projectiles = chunk.getComponentArray(HomingProjectile);
			const worldModels = chunk.getComponentArray(WorldModel);
			if (projectiles === undefined || worldModels === undefined) {
				continue;
			}

			for (let index = 0; index < chunk.size(); index++) {
				const projectile = projectiles[index];
				const model = worldModels[index].model;
				const entity = chunk.entities[index];

				if (!projectile.attachment.IsDescendantOf(game.Workspace)) {
					model.Destroy();
					commands.destroyEntity(entity);
					continue;
				}

				const toTarget = projectile.attachment.WorldPosition.sub(model.GetPivot().Position);
				if (toTarget.Magnitude <= projectile.speed * dt + 1) {
					applyHitPointDamage(projectile.hitPointId, projectile.damage, projectile.attackerPosition);
					model.Destroy();
					commands.destroyEntity(entity);
					continue;
				}

				model.SetAttribute(MotionAttributes.Speed, projectile.speed);
				model.SetAttribute(MotionAttributes.Direction, toTarget.Unit);
				model.SetAttribute(MotionAttributes.RotationSpeed, projectile.rotationSpeed);
			}
		}
	}
}
