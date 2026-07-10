import {
	AimLimits,
	Health,
	Interactable,
	Mountable,
	MoveToPoint,
	PathFollower,
	PlayerBoat,
	Shooter,
	Velocity,
	WorldModel,
} from "server/worldEcs/components";
import { attachEntityToModel, getEcs } from "server/worldEcs/ecs";
import {
	PLAYER_ARRIVE_DISTANCE,
	PLAYER_BOAT_ROTATION_SPEED,
	PLAYER_BOAT_SPEED,
} from "server/worldEcs/utils/constants";
import { getModelRadius } from "server/worldEcs/utils/modelUtils";
import {
	AIM_PITCH_MAX_ATTRIBUTE,
	AIM_PITCH_MIN_ATTRIBUTE,
	AIM_YAW_LIMIT_ATTRIBUTE,
	CANNON_COOLDOWN,
	CANNON_MAX_HEALTH,
	CANNON_PITCH_MAX,
	CANNON_PITCH_MIN,
	CANNON_POWER,
	CANNON_YAW_LIMIT,
	HEALTH_ATTRIBUTE,
	MAX_HEALTH_ATTRIBUTE,
	MOUNT_KIND_ATTRIBUTE,
	MOUNT_KIND_CANNON,
} from "shared/mountShared";

function validateCannonModel(cannonModel: Model): boolean {
	const basePart = cannonModel.FindFirstChild("Part");
	const barrelPart = cannonModel.FindFirstChild("canonBarrel");
	const cameraPart = cannonModel.FindFirstChild("cameraPart");

	if (basePart === undefined || !basePart.IsA("BasePart")) {
		warn(`[playerBoatFactory.ts] Cannon ${cannonModel.GetFullName()} is missing base Part`);
		return false;
	}

	if (barrelPart === undefined || !barrelPart.IsA("BasePart")) {
		warn(`[playerBoatFactory.ts] Cannon ${cannonModel.GetFullName()} is missing canonBarrel`);
		return false;
	}

	if (cameraPart === undefined || !cameraPart.IsA("BasePart")) {
		warn(`[playerBoatFactory.ts] Cannon ${cannonModel.GetFullName()} is missing cameraPart`);
		return false;
	}

	return true;
}

function stampCannonAttributes(cannonModel: Model): void {
	cannonModel.SetAttribute(MOUNT_KIND_ATTRIBUTE, MOUNT_KIND_CANNON);
	cannonModel.SetAttribute(AIM_YAW_LIMIT_ATTRIBUTE, CANNON_YAW_LIMIT);
	cannonModel.SetAttribute(AIM_PITCH_MIN_ATTRIBUTE, CANNON_PITCH_MIN);
	cannonModel.SetAttribute(AIM_PITCH_MAX_ATTRIBUTE, CANNON_PITCH_MAX);
	cannonModel.SetAttribute(HEALTH_ATTRIBUTE, CANNON_MAX_HEALTH);
	cannonModel.SetAttribute(MAX_HEALTH_ATTRIBUTE, CANNON_MAX_HEALTH);
}

function createCannonEntity(cannonModel: Model): void {
	if (!validateCannonModel(cannonModel)) {
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
				current: CANNON_MAX_HEALTH,
				max: CANNON_MAX_HEALTH,
			},
		},
		{
			type: Interactable,
			data: {
				promptText: "Man cannon",
			},
		},
		{
			type: Mountable,
			data: {
				kind: MOUNT_KIND_CANNON,
			},
		},
	]);

	attachEntityToModel(cannonModel, entity);
	stampCannonAttributes(cannonModel);
}

export function createPlayerBoatEntities(playerBoat: Model, waypoints: Vector3[]): void {
	const ecs = getEcs();
	const playerRadius = getModelRadius(playerBoat);

	const boatEntity = ecs.createEntity([
		{
			type: Velocity,
			data: {
				value: new Vector3(0, 0, 0),
			},
		},
		{
			type: WorldModel,
			data: {
				model: playerBoat,
				radius: playerRadius,
			},
		},
		{
			type: MoveToPoint,
			data: {
				target: waypoints[1],
				speed: PLAYER_BOAT_SPEED,
				rotationSpeed: PLAYER_BOAT_ROTATION_SPEED,
				arriveDistance: PLAYER_ARRIVE_DISTANCE,
				reached: false,
			},
		},
		{
			type: PathFollower,
			data: {
				waypoints,
				targetIndex: 1,
				finished: false,
			},
		},
		{
			type: PlayerBoat,
			data: {
				isPlayerBoat: true,
			},
		},
	]);

	attachEntityToModel(playerBoat, boatEntity);

	for (const descendant of playerBoat.GetDescendants()) {
		if (descendant.IsA("Model") && descendant.Name === "Cannon") {
			createCannonEntity(descendant);
		}
	}
}
