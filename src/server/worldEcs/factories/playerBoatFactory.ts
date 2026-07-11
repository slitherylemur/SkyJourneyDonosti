import { MoveToPoint, PathFollower, PlayerBoat, Velocity, WorldModel } from "server/worldEcs/components";
import { attachEntityToModel, getEcs } from "server/worldEcs/ecs";
import type { EntityRef } from "@rbxts/ecs";
import { createPlayerCannonEntity } from "server/worldEcs/factories/cannonFactory";
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
	]);

	attachEntityToModel(playerBoat, boatEntity);

	for (const descendant of playerBoat.GetDescendants()) {
		if (descendant.IsA("Model") && descendant.Name === "Cannon") {
			createPlayerCannonEntity(descendant);
		}
	}

	return boatEntity;
}
