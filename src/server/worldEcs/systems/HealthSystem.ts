import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import { Health, MountedBy, WorldModel } from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import { unmountPlayer } from "server/mounting/mountServer";
import { HEALTH_ATTRIBUTE } from "shared/mountShared";

export class HealthSystem implements System {
	public getQuery(): Query {
		return new Query().all(Health, WorldModel);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, commands: CommandBuffer, _dt: number): void {
		const ecs = getEcs();

		for (const chunk of chunks) {
			const healths = chunk.getComponentArray(Health);
			const worldModels = chunk.getComponentArray(WorldModel);
			if (healths === undefined || worldModels === undefined) {
				continue;
			}

			for (let index = 0; index < chunk.size(); index++) {
				const health = healths[index];
				const worldModel = worldModels[index];
				const entity = chunk.entities[index];
				const model = worldModel.model;

				const attributeValue = model.GetAttribute(HEALTH_ATTRIBUTE);
				if (!typeIs(attributeValue, "number") || attributeValue !== health.current) {
					model.SetAttribute(HEALTH_ATTRIBUTE, health.current);
				}

				if (health.current > 0) {
					continue;
				}

				const mountedBy = ecs.getComponent(entity, MountedBy);
				if (mountedBy !== undefined) {
					unmountPlayer(mountedBy.player);
				}

				model.Destroy();
				commands.destroyEntity(entity);
			}
		}
	}
}
