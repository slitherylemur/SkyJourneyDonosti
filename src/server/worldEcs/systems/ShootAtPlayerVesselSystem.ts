import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import {
	FireRequest,
	ShootAtPlayerVessel,
	Shooter,
	WorldModel,
} from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import type { ShooterData } from "server/worldEcs/components/Shooter";
import type { EntityRef } from "@rbxts/ecs";
import { HIT_POINT_FACE_ATTR } from "shared/hitPointShared";
import { getEntityHitPoints, type RegisteredHitPoint } from "server/worldEcs/hitPointRegistry";

interface VesselTarget {
	model: Model;
	entity: EntityRef;
}

function chooseHitPoint(target: VesselTarget, shooterPosition: Vector3): RegisteredHitPoint | undefined {
	const localPosition = target.model.GetPivot().PointToObjectSpace(shooterPosition);
	const face =
		math.abs(localPosition.X) > math.abs(localPosition.Z)
			? localPosition.X > 0
				? "starboard"
				: "port"
			: localPosition.Z < 0
				? "bow"
				: "stern";
	const all = getEntityHitPoints(target.entity).filter((hitPoint) =>
		hitPoint.attachment.IsDescendantOf(game.Workspace),
	);
	const matching = all.filter((hitPoint) => hitPoint.attachment.GetAttribute(HIT_POINT_FACE_ATTR) === face);
	const candidates = matching.isEmpty() ? all : matching;
	return candidates.isEmpty() ? undefined : candidates[math.random(0, candidates.size() - 1)];
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

				const hitPoint = chooseHitPoint(this.target, worldModel.model.GetPivot().Position);
				const hitPointId = hitPoint?.attachment.GetAttribute("hitPointId");
				if (typeIs(hitPointId, "string")) {
					commands.addComponent(entity, FireRequest, { hitPointId });
				}
			}
		}
	}

	private isReady(shooter: ShooterData): boolean {
		return os.clock() - shooter.lastFiredAt >= shooter.cooldownSeconds;
	}
}
