import { CollectionService, RunService } from "@rbxts/services";
import { MotionAttributes, REPLICATED_MOTION_TAG } from "shared/serverAuthorityReplicatedMotion";
import { createPlayerBoatEntities } from "server/worldEcs/factories/playerBoatFactory";
import { getEcs } from "server/worldEcs/ecs";
import { MoveToPointSystem } from "server/worldEcs/systems/MoveToPointSystem";
import { PathFollowSystem } from "server/worldEcs/systems/PathFollowSystem";
import { InteractableSystem } from "server/worldEcs/systems/InteractableSystem";
import { FireRequestSystem } from "server/worldEcs/systems/FireRequestSystem";
import { ProjectileSystem } from "server/worldEcs/systems/ProjectileSystem";
import { HealthSystem } from "server/worldEcs/systems/HealthSystem";
import {
	MAP_MODEL_NAME,
	PLAYER_BOAT_MODEL_NAME,
	WAYPOINT_NAMES,
} from "server/worldEcs/utils/constants";
import {
	anchorModel,
	cloneTemplateModel,
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

	playerBoat.PivotTo(startPivot);
	playerBoat.SetAttribute(MotionAttributes.Velocity, new Vector3(0, 0, 0));
	playerBoat.SetAttribute(MotionAttributes.LookDirection, facing);
	playerBoat.SetAttribute(MotionAttributes.LockLookDirection, true);
	playerBoat.SetAttribute(MotionAttributes.CarriesCharacters, true);
	CollectionService.AddTag(playerBoat, REPLICATED_MOTION_TAG);

	createPlayerBoatEntities(playerBoat, waypoints);

	const ecsSystem = getEcs();
	ecsSystem.registerSystem(new PathFollowSystem());
	ecsSystem.registerSystem(new MoveToPointSystem());
	ecsSystem.registerSystem(new InteractableSystem());
	ecsSystem.registerSystem(new FireRequestSystem());
	ecsSystem.registerSystem(new ProjectileSystem());
	ecsSystem.registerSystem(new HealthSystem());

	RunService.Heartbeat.Connect((dt) => {
		ecsSystem.tick(dt);
	});

	print("[worldEntityStore.ts] Started world ECS");
}
