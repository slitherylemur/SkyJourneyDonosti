import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import {
	Health,
	MoveToPoint,
	MovementLock,
	MountedBy,
	PathFollower,
	RespawnOnDeath,
	Velocity,
	WorldModel,
} from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import { unmountPlayer } from "server/mounting/mountServer";
import { HEALTH_ATTRIBUTE } from "shared/mountShared";
import { unregisterEntityHitPoints, registerModelHitPoints } from "server/worldEcs/hitPointRegistry";
import { fireEntityDied } from "server/worldEcs/deathSignal";
import { BOAT_RESPAWN_LOCK_SECONDS } from "shared/hitPointShared";
import { MotionAttributes } from "shared/serverAuthorityReplicatedMotion";

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

				unregisterEntityHitPoints(entity);
				fireEntityDied(entity, model);

				if (ecs.getComponent(entity, RespawnOnDeath) !== undefined) {
					const path = ecs.getComponent(entity, PathFollower);
					const mover = ecs.getComponent(entity, MoveToPoint);
					const velocity = ecs.getComponent(entity, Velocity);
					const start = path?.waypoints[0];
					if (start !== undefined) {
						model.PivotTo(new CFrame(start));
						if (path !== undefined) {
							path.targetIndex = math.min(1, path.waypoints.size() - 1);
							path.finished = false;
						}
						if (mover !== undefined) {
							mover.target = path?.waypoints[path.targetIndex];
							mover.reached = false;
							mover.pointVelocity = undefined;
						}
					}
					if (velocity !== undefined) {
						velocity.value = Vector3.zero;
					}
					model.SetAttribute(MotionAttributes.Velocity, Vector3.zero);
					health.current = health.max;
					model.SetAttribute(HEALTH_ATTRIBUTE, health.current);
					commands.addComponent(entity, MovementLock, {
						until: os.clock() + BOAT_RESPAWN_LOCK_SECONDS,
					});
					registerModelHitPoints(model, "player", [{ entity, multiplier: 1 }], (attachment) => {
						let ancestor = attachment.Parent;
						while (ancestor !== undefined && ancestor !== model) {
							if (ancestor.IsA("Model") && ancestor.Name === "Cannon") {
								return false;
							}
							ancestor = ancestor.Parent;
						}
						return true;
					});
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
