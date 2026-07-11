import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import {
	FireRequest,
	ShootAtPlayerVessel,
	Shooter,
	WorldModel,
} from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import type { ShooterData } from "server/worldEcs/components/Shooter";
import { PROJECTILE_SPEED } from "shared/mountShared";

interface VesselTarget {
	model: Model;
	getVelocity: () => Vector3;
}

function predictTargetPosition(shooterModel: Model, target: VesselTarget): Vector3 {
	const shooterPosition = shooterModel.GetPivot().Position;
	const targetPosition = target.model.GetPivot().Position;
	const travelTime = targetPosition.sub(shooterPosition).Magnitude / PROJECTILE_SPEED;
	return targetPosition.add(target.getVelocity().mul(travelTime));
}

export class ShootAtPlayerVesselSystem implements System {
	public constructor(private readonly target: VesselTarget) {}

	public getQuery(): Query {
		return new Query().all(ShootAtPlayerVessel, Shooter, WorldModel);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, commands: CommandBuffer, _dt: number): void {
		const ecs = getEcs();
		for (const chunk of chunks) {
			const aiComponents = chunk.getComponentArray(ShootAtPlayerVessel);
			const shooters = chunk.getComponentArray(Shooter);
			const worldModels = chunk.getComponentArray(WorldModel);
			if (aiComponents === undefined || shooters === undefined || worldModels === undefined) {
				continue;
			}

			for (let index = 0; index < chunk.size(); index++) {
				const entity = chunk.entities[index];
				if (ecs.getComponent(entity, FireRequest) !== undefined) {
					continue;
				}

				const shooter = shooters[index];
				const worldModel = worldModels[index];
				const distance = this.target.model
					.GetPivot()
					.Position.sub(worldModel.model.GetPivot().Position).Magnitude;

				if (distance > aiComponents[index].maxRange || !this.isReady(shooter)) {
					continue;
				}

				commands.addComponent(entity, FireRequest, {
					targetPos: predictTargetPosition(worldModel.model, this.target),
				});
			}
		}
	}

	private isReady(shooter: ShooterData): boolean {
		return os.clock() - shooter.lastFiredAt >= shooter.cooldownSeconds;
	}
}
