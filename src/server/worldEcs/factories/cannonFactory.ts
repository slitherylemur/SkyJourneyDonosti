import {
	AimLimits,
	Health,
	Interactable,
	Mountable,
	ShootAtPlayerVessel,
	Shooter,
	WorldModel,
} from "server/worldEcs/components";
import { attachEntityToModel, getEcs } from "server/worldEcs/ecs";
import {
	AIM_PITCH_MAX_ATTRIBUTE,
	AIM_PITCH_MIN_ATTRIBUTE,
	AIM_YAW_LIMIT_ATTRIBUTE,
	CANNON_AI_MAX_RANGE,
	CANNON_COOLDOWN,
	CANNON_MAX_HEALTH,
	CANNON_PITCH_MAX,
	CANNON_PITCH_MIN,
	CANNON_POWER,
	CANNON_YAW_LIMIT,
	HEALTH_ATTRIBUTE,
	MAP_CANNON_MAX_HEALTH,
	MAX_HEALTH_ATTRIBUTE,
	MOUNT_KIND_ATTRIBUTE,
	MOUNT_KIND_CANNON,
} from "shared/mountShared";

interface CannonOptions {
	health: number;
	mountable: boolean;
	shootAtPlayerVessel: boolean;
}

function validateCannonModel(cannonModel: Model, requiresCamera: boolean): boolean {
	const basePart = cannonModel.FindFirstChild("Part");
	const barrelPart = cannonModel.FindFirstChild("canonBarrel");

	if (basePart === undefined || !basePart.IsA("BasePart")) {
		warn(`[cannonFactory.ts] Cannon ${cannonModel.GetFullName()} is missing base Part`);
		return false;
	}

	if (barrelPart === undefined || !barrelPart.IsA("BasePart")) {
		warn(`[cannonFactory.ts] Cannon ${cannonModel.GetFullName()} is missing canonBarrel`);
		return false;
	}

	if (barrelPart.FindFirstChildOfClass("Weld") === undefined) {
		warn(`[cannonFactory.ts] Cannon ${cannonModel.GetFullName()} canonBarrel is missing a Weld`);
		return false;
	}

	if (requiresCamera) {
		const cameraPart = cannonModel.FindFirstChild("cameraPart");
		if (cameraPart === undefined || !cameraPart.IsA("BasePart")) {
			warn(`[cannonFactory.ts] Cannon ${cannonModel.GetFullName()} is missing cameraPart`);
			return false;
		}
	}

	return true;
}

function stampCannonAttributes(cannonModel: Model, health: number, mountable: boolean): void {
	if (mountable) {
		cannonModel.SetAttribute(MOUNT_KIND_ATTRIBUTE, MOUNT_KIND_CANNON);
	}
	cannonModel.SetAttribute(AIM_YAW_LIMIT_ATTRIBUTE, CANNON_YAW_LIMIT);
	cannonModel.SetAttribute(AIM_PITCH_MIN_ATTRIBUTE, CANNON_PITCH_MIN);
	cannonModel.SetAttribute(AIM_PITCH_MAX_ATTRIBUTE, CANNON_PITCH_MAX);
	cannonModel.SetAttribute(HEALTH_ATTRIBUTE, health);
	cannonModel.SetAttribute(MAX_HEALTH_ATTRIBUTE, health);
}

function createCannonEntity(cannonModel: Model, options: CannonOptions): void {
	if (!validateCannonModel(cannonModel, options.mountable)) {
		return;
	}

	const ecs = getEcs();
	const entity = ecs.createEntity([
		{
			type: WorldModel,
			data: {
				model: cannonModel,
				radius: 3,
			},
		},
		{
			type: Shooter,
			data: {
				power: CANNON_POWER,
				cooldownSeconds: CANNON_COOLDOWN,
				lastFiredAt: 0,
			},
		},
		{
			type: AimLimits,
			data: {
				yawLimit: CANNON_YAW_LIMIT,
				pitchMin: CANNON_PITCH_MIN,
				pitchMax: CANNON_PITCH_MAX,
			},
		},
		{
			type: Health,
			data: {
				current: options.health,
				max: options.health,
			},
		},
	]);

	if (options.mountable) {
		ecs.addComponent(entity, Interactable, { promptText: "Man cannon" });
		ecs.addComponent(entity, Mountable, { kind: MOUNT_KIND_CANNON });
	}

	if (options.shootAtPlayerVessel) {
		ecs.addComponent(entity, ShootAtPlayerVessel, { maxRange: CANNON_AI_MAX_RANGE });
	}

	attachEntityToModel(cannonModel, entity);
	stampCannonAttributes(cannonModel, options.health, options.mountable);
}

export function createPlayerCannonEntity(cannonModel: Model): void {
	createCannonEntity(cannonModel, {
		health: CANNON_MAX_HEALTH,
		mountable: true,
		shootAtPlayerVessel: false,
	});
}

export function createMapCannonEntities(map: Model): void {
	for (const descendant of map.GetDescendants()) {
		if (descendant.IsA("Model") && descendant.Name === "Cannon") {
			createCannonEntity(descendant, {
				health: MAP_CANNON_MAX_HEALTH,
				mountable: false,
				shootAtPlayerVessel: true,
			});
		}
	}
}
