import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import { AimLimits, FireRequest, Shooter, WorldModel } from "server/worldEcs/components";
import { findBoatModel, getEcs } from "server/worldEcs/ecs";
import { getHitPoint } from "server/worldEcs/hitPointRegistry";
import { registerProjectileAuthority } from "server/worldEcs/projectileAuthority";
import { clampDirectionWithAimLimits, getMuzzlePosition } from "server/worldEcs/utils/aimUtils";
import { createProjectileMotionModel } from "shared/projectileMotion";
import {
	BARREL_FORWARD_SIGN,
	PROJECTILE_BASE_DAMAGE,
	PROJECTILE_MAX_RANGE,
	PROJECTILE_ROTATION_SPEED,
	PROJECTILE_SPEED,
} from "shared/mountShared";

interface CannonRig {
	basePart: BasePart;
	barrelPart: BasePart;
	barrelWeld: Weld;
}

function resolveCannonRig(model: Model): CannonRig | undefined {
	const basePart = model.FindFirstChild("Part");
	const barrelPart = model.FindFirstChild("canonBarrel");
	if (basePart === undefined || !basePart.IsA("BasePart")) {
		return undefined;
	}

	if (barrelPart === undefined || !barrelPart.IsA("BasePart")) {
		return undefined;
	}

	const barrelWeld = barrelPart.FindFirstChildOfClass("Weld");
	if (barrelWeld === undefined) {
		return undefined;
	}

	return {
		basePart,
		barrelPart,
		barrelWeld,
	};
}

export class FireRequestSystem implements System {
	public getQuery(): Query {
		return new Query().all(Shooter, FireRequest, WorldModel);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, commands: CommandBuffer, _dt: number): void {
		const ecs = getEcs();

		for (const chunk of chunks) {
			const shooters = chunk.getComponentArray(Shooter);
			const fireRequests = chunk.getComponentArray(FireRequest);
			const worldModels = chunk.getComponentArray(WorldModel);
			if (shooters === undefined || fireRequests === undefined || worldModels === undefined) {
				continue;
			}

			for (let index = 0; index < chunk.size(); index++) {
				const shooter = shooters[index];
				const fireRequest = fireRequests[index];
				const worldModel = worldModels[index];
				const entity = chunk.entities[index];
				const model = worldModel.model;
				const hitPoint = fireRequest.hitPointId !== undefined ? getHitPoint(fireRequest.hitPointId) : undefined;
				const targetPos = hitPoint?.attachment.WorldPosition ?? fireRequest.targetPos;
				if (targetPos === undefined) {
					commands.removeComponent(entity, FireRequest);
					continue;
				}

				let direction: Vector3;
				let muzzlePos: Vector3;

				const rig = resolveCannonRig(model);
				if (rig === undefined) {
					const pivot = model.GetPivot().Position;
					direction = targetPos.sub(pivot).Unit;
					muzzlePos = pivot;
				} else {
					const pivot = rig.basePart.CFrame.mul(rig.barrelWeld.C1).Position;
					direction = targetPos.sub(pivot).Unit;

					const aimLimits = ecs.getComponent(entity, AimLimits);
					if (aimLimits !== undefined) {
						direction = clampDirectionWithAimLimits(rig.basePart, direction, aimLimits);
					}

					// CFrame.lookAt aligns local -Z, while this barrel's muzzle is local +Z.
					const desired = CFrame.lookAt(pivot, pivot.sub(direction));
					rig.barrelWeld.C0 = desired.Inverse().mul(rig.basePart.CFrame).mul(rig.barrelWeld.C1);
					muzzlePos = getMuzzlePosition(rig.barrelPart, BARREL_FORWARD_SIGN);
				}

				const projectileModel = createProjectileMotionModel({
					position: muzzlePos,
					direction,
					speed: PROJECTILE_SPEED,
					rotationSpeed: PROJECTILE_ROTATION_SPEED,
				});

				const boatModel = findBoatModel(model);
				const ignoreInstances = [projectileModel];
				if (boatModel !== undefined) {
					ignoreInstances.push(boatModel);
				}

				registerProjectileAuthority({
					model: projectileModel,
					direction,
					position: muzzlePos,
					speed: PROJECTILE_SPEED,
					rotationSpeed: PROJECTILE_ROTATION_SPEED,
					damage: PROJECTILE_BASE_DAMAGE * shooter.power,
					maxRange: PROJECTILE_MAX_RANGE,
					ignoreInstances,
					hitPointId: fireRequest.hitPointId,
					hitPoint,
				});
				shooter.lastFiredAt = os.clock();
				commands.removeComponent(entity, FireRequest);
			}
		}
	}
}
