import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import { Players, Workspace } from "@rbxts/services";
import { Projectile, WorldModel } from "server/worldEcs/components";

function buildRaycastFilter(ignoreInstances: Instance[]): Instance[] {
	const filter = [...ignoreInstances];

	for (const player of Players.GetPlayers()) {
		const character = player.Character;
		if (character !== undefined) {
			filter.push(character);
		}
	}

	return filter;
}

export class ProjectileSystem implements System {
	public getQuery(): Query {
		return new Query().all(Projectile, WorldModel);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, commands: CommandBuffer, _dt: number): void {
		for (const chunk of chunks) {
			const projectiles = chunk.getComponentArray(Projectile);
			const worldModels = chunk.getComponentArray(WorldModel);
			if (projectiles === undefined || worldModels === undefined) {
				continue;
			}

			for (let index = 0; index < chunk.size(); index++) {
				const projectile = projectiles[index];
				const worldModel = worldModels[index];
				const entity = chunk.entities[index];
				const model = worldModel.model;
				const currentPos = model.GetPivot().Position;
				const delta = currentPos.sub(projectile.lastPosition);
				const segmentLength = delta.Magnitude;

				if (segmentLength > 0.001) {
					const raycastParams = new RaycastParams();
					raycastParams.FilterType = Enum.RaycastFilterType.Exclude;
					raycastParams.FilterDescendantsInstances = buildRaycastFilter(projectile.ignoreInstances);

					const hit = Workspace.Raycast(projectile.lastPosition, delta, raycastParams);
					if (hit !== undefined) {
						model.Destroy();
						commands.destroyEntity(entity);
						continue;
					}
				}

				projectile.distanceTraveled += segmentLength;
				projectile.lastPosition = currentPos;

				if (projectile.distanceTraveled > projectile.maxRange) {
					model.Destroy();
					commands.destroyEntity(entity);
				}
			}
		}
	}
}
