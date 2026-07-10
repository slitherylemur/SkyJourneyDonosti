import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import { CollectionService } from "@rbxts/services";
import { MotionAttributes, REPLICATED_MOTION_TAG } from "shared/serverAuthorityReplicatedMotion";
import {
	AimLimits,
	FireRequest,
	Projectile,
	Shooter,
	Velocity,
	WorldModel,
} from "server/worldEcs/components";
import { attachEntityToModel, findBoatModel, getEcs } from "server/worldEcs/ecs";
import { clampDirectionWithAimLimits, getMuzzlePosition } from "server/worldEcs/utils/aimUtils";
import {
	BARREL_FORWARD_SIGN,
	PROJECTILE_BASE_DAMAGE,
	PROJECTILE_MAX_RANGE,
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

function createProjectileModel(position: Vector3): Model {
	const part = new Instance("Part");
	part.Name = "ProjectilePart";
	part.Size = new Vector3(1.5, 1.5, 1.5);
	part.Shape = Enum.PartType.Ball;
	part.Material = Enum.Material.Neon;
	part.Color = new Color3(1, 0.8, 0.2);
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;

	const model = new Instance("Model");
	model.Name = "projectile";
	part.Parent = model;
	model.PrimaryPart = part;
	model.PivotTo(new CFrame(position));
	model.Parent = game.Workspace;

	return model;
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
				const targetPos = fireRequest.targetPos;

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

				const projectileModel = createProjectileModel(muzzlePos);
				projectileModel.SetAttribute(MotionAttributes.Velocity, direction.mul(PROJECTILE_SPEED));
				projectileModel.SetAttribute(MotionAttributes.LookDirection, direction);
				projectileModel.SetAttribute(MotionAttributes.LockLookDirection, true);
				CollectionService.AddTag(projectileModel, REPLICATED_MOTION_TAG);

				const boatModel = findBoatModel(model);
				const ignoreInstances = [projectileModel];
				if (boatModel !== undefined) {
					ignoreInstances.push(boatModel);
				}

				const projectileEntity = ecs.createEntity([
					{
						type: Projectile,
						data: {
							baseDamage: PROJECTILE_BASE_DAMAGE,
							power: shooter.power,
							distanceTraveled: 0,
							maxRange: PROJECTILE_MAX_RANGE,
							lastPosition: muzzlePos,
							ignoreInstances,
						},
					},
					{
						type: Velocity,
						data: {
							value: direction.mul(PROJECTILE_SPEED),
						},
					},
					{
						type: WorldModel,
						data: {
							model: projectileModel,
							radius: 1,
						},
					},
				]);

				attachEntityToModel(projectileModel, projectileEntity);
				shooter.lastFiredAt = os.clock();
				commands.removeComponent(entity, FireRequest);
			}
		}
	}
}
