import { CollectionService, RunService } from "@rbxts/services";
import { ECSSystem } from "@rbxts/ecs";
import { MotionAttributes, REPLICATED_MOTION_TAG } from "shared/serverAuthorityReplicatedMotion";
import {
	MoveToPoint,
	PathFollower,
	PlayerBoat,
	Velocity,
	WorldModel,
} from "server/worldEcs/components";
import { MoveToPointSystem } from "server/worldEcs/systems/MoveToPointSystem";
import { PathFollowSystem } from "server/worldEcs/systems/PathFollowSystem";
import {
	MAP_MODEL_NAME,
	PLAYER_ARRIVE_DISTANCE,
	PLAYER_BOAT_MODEL_NAME,
	PLAYER_BOAT_ROTATION_SPEED,
	PLAYER_BOAT_SPEED,
	WAYPOINT_NAMES,
} from "server/worldEcs/utils/constants";
import {
	anchorModel,
	cloneTemplateModel,
	getModelRadius,
	getWaypoints,
	replaceWorkspaceModel,
} from "server/worldEcs/utils/modelUtils";
import { DEFAULT_FACING, horizontalUnitOr } from "server/worldEcs/utils/vectorUtils";

export function startWorldEntityStore(): void {
	const map = cloneTemplateModel(MAP_MODEL_NAME);
	const playerBoat = cloneTemplateModel(PLAYER_BOAT_MODEL_NAME);

	if (map === undefined || playerBoat === undefined) {
		warn("[worldEntityStore.ts] World ECS could not start because a required model is missing");
		return;
	}

	anchorModel(map);
	replaceWorkspaceModel(MAP_MODEL_NAME, map);
	replaceWorkspaceModel(PLAYER_BOAT_MODEL_NAME, playerBoat);

	const waypoints = getWaypoints(map, WAYPOINT_NAMES);
	if (waypoints === undefined) {
		warn("[worldEntityStore.ts] World ECS could not start because map waypoints are invalid");
		return;
	}

	const start = waypoints[0];
	const facing = horizontalUnitOr(waypoints[1].sub(start), DEFAULT_FACING);
	const startPivot = CFrame.lookAt(start, start.add(facing));
	const ecsSystem = new ECSSystem();
	const playerRadius = getModelRadius(playerBoat);

	playerBoat.PivotTo(startPivot);
	playerBoat.SetAttribute(MotionAttributes.Velocity, new Vector3(0, 0, 0));
	playerBoat.SetAttribute(MotionAttributes.LookDirection, facing);
	playerBoat.SetAttribute(MotionAttributes.LockLookDirection, true);
	playerBoat.SetAttribute(MotionAttributes.CarriesCharacters, true);
	CollectionService.AddTag(playerBoat, REPLICATED_MOTION_TAG);

	ecsSystem.createEntity([
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

	ecsSystem.registerSystem(new PathFollowSystem());
	ecsSystem.registerSystem(new MoveToPointSystem());

	RunService.Heartbeat.Connect((dt) => {
		ecsSystem.tick(dt);
	});

	print("[worldEntityStore.ts] Started world ECS");
}
