import {
	Health,
	MoveToPoint,
	PathFollower,
	PlayerBoat,
	RespawnOnDeath,
	Velocity,
	WorldModel,
} from "server/worldEcs/components";
import { attachEntityToModel, getEcs } from "server/worldEcs/ecs";
import type { EntityRef } from "@rbxts/ecs";
import { createPlayerCannonEntity } from "server/worldEcs/factories/cannonFactory";
import { registerModelHitPoints } from "server/worldEcs/hitPointRegistry";
import { BOAT_MAX_HEALTH } from "shared/hitPointShared";
import { HEALTH_ATTRIBUTE, MAX_HEALTH_ATTRIBUTE } from "shared/mountShared";
import {
	PLAYER_ARRIVE_DISTANCE,
	PLAYER_BOAT_ROTATION_SPEED,
	PLAYER_BOAT_SPEED,
} from "server/worldEcs/utils/constants";
import { getModelRadius } from "server/worldEcs/utils/modelUtils";

export function createPlayerBoatEntities(playerBoat: Model, waypoints: Vector3[]): EntityRef {
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
		{
			type: Health,
			data: {
				current: BOAT_MAX_HEALTH,
				max: BOAT_MAX_HEALTH,
			},
		},
		{
			type: RespawnOnDeath,
			data: {
				enabled: true,
			},
		},
	]);

	attachEntityToModel(playerBoat, boatEntity);
	playerBoat.SetAttribute(HEALTH_ATTRIBUTE, BOAT_MAX_HEALTH);
	playerBoat.SetAttribute(MAX_HEALTH_ATTRIBUTE, BOAT_MAX_HEALTH);

	registerModelHitPoints(playerBoat, "player", [{ entity: boatEntity, multiplier: 1 }], (attachment) => {
		let ancestor = attachment.Parent;
		while (ancestor !== undefined && ancestor !== playerBoat) {
			if (ancestor.IsA("Model") && ancestor.Name === "Cannon") {
				return false;
			}
			ancestor = ancestor.Parent;
		}
		return true;
	});

	for (const descendant of playerBoat.GetDescendants()) {
		if (descendant.IsA("Model") && descendant.Name === "Cannon") {
			createPlayerCannonEntity(descendant, boatEntity);
		}
	}

	return boatEntity;
}
