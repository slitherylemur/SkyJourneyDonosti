import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import {
	AimLimits,
	FireRequest,
	ShootAtPlayerVessel,
	Shooter,
	WorldModel,
} from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import type { ShooterData } from "server/worldEcs/components/Shooter";
import type { AimLimitsData } from "server/worldEcs/components/AimLimits";
import type { EntityRef } from "@rbxts/ecs";
import { HIT_POINT_FACE_ATTR } from "shared/hitPointShared";
import { getEntityHitPoints, type RegisteredHitPoint } from "server/worldEcs/hitPointRegistry";

interface VesselTarget {
	model: Model;
	entity: EntityRef;
}

function isWithinShooterAim(model: Model, position: Vector3, limits: AimLimitsData): boolean {
	const basePart = model.FindFirstChild("Part");
	if (basePart === undefined || !basePart.IsA("BasePart")) {
		return false;
	}
	const offset = position.sub(basePart.Position);
	if (offset.Magnitude < 0.001) {
		return true;
	}
	const localDirection = basePart.CFrame.VectorToObjectSpace(offset.Unit);
	const yaw = math.atan2(localDirection.X, localDirection.Z);
	const pitch = math.asin(math.clamp(localDirection.Y, -1, 1));
	return math.abs(yaw) <= limits.yawLimit && pitch >= limits.pitchMin && pitch <= limits.pitchMax;
}

function chooseHitPoint(
	target: VesselTarget,
	shooterModel: Model,
	aimLimits: AimLimitsData,
): RegisteredHitPoint | undefined {
	const shooterPosition = shooterModel.GetPivot().Position;
	const hullPoints = getEntityHitPoints(target.entity).filter(
		(hitPoint) =>
			hitPoint.attachment.IsDescendantOf(game.Workspace) &&
			typeIs(hitPoint.attachment.GetAttribute(HIT_POINT_FACE_ATTR), "string"),
	);
	let closest: RegisteredHitPoint | undefined;
	let closestDistance = math.huge;
	for (const hitPoint of hullPoints) {
		const distance = hitPoint.attachment.WorldPosition.sub(shooterPosition).Magnitude;
		if (distance < closestDistance) {
			closest = hitPoint;
			closestDistance = distance;
		}
	}
	if (closest === undefined) {
		return undefined;
	}

	const closestFace = closest.attachment.GetAttribute(HIT_POINT_FACE_ATTR);
	const candidates = hullPoints.filter(
		(hitPoint) =>
			hitPoint.attachment.GetAttribute(HIT_POINT_FACE_ATTR) === closestFace &&
			isWithinShooterAim(shooterModel, hitPoint.attachment.WorldPosition, aimLimits),
	);
	return candidates.isEmpty() ? undefined : candidates[math.random(0, candidates.size() - 1)];
}

export class ShootAtPlayerVesselSystem implements System {
	public constructor(private readonly target: VesselTarget) {}

	public getQuery(): Query {
		return new Query().all(ShootAtPlayerVessel, Shooter, AimLimits, WorldModel);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, commands: CommandBuffer, _dt: number): void {
		const ecs = getEcs();
		for (const chunk of chunks) {
			const aiComponents = chunk.getComponentArray(ShootAtPlayerVessel);
			const shooters = chunk.getComponentArray(Shooter);
			const aimLimits = chunk.getComponentArray(AimLimits);
			const worldModels = chunk.getComponentArray(WorldModel);
			if (aiComponents === undefined || shooters === undefined || aimLimits === undefined || worldModels === undefined) {
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

				const hitPoint = chooseHitPoint(this.target, worldModel.model, aimLimits[index]);
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
