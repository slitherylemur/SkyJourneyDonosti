import { CollectionService, RunService } from "@rbxts/services";
import { MotionAttributes, REPLICATED_MOTION_TAG } from "shared/serverAuthorityReplicatedMotion";
import { createPlayerBoatEntities } from "server/worldEcs/factories/playerBoatFactory";
import { createMapCannonEntities } from "server/worldEcs/factories/cannonFactory";
import { getEcs } from "server/worldEcs/ecs";
import { MoveToPointSystem } from "server/worldEcs/systems/MoveToPointSystem";
import { PathFollowSystem } from "server/worldEcs/systems/PathFollowSystem";
import { InteractableSystem } from "server/worldEcs/systems/InteractableSystem";
import { FireRequestSystem } from "server/worldEcs/systems/FireRequestSystem";
import { ProjectileSystem } from "server/worldEcs/systems/ProjectileSystem";
import { HealthSystem } from "server/worldEcs/systems/HealthSystem";
import { ShootAtPlayerVesselSystem } from "server/worldEcs/systems/ShootAtPlayerVesselSystem";
import { HomingProjectileSystem } from "server/worldEcs/systems/HomingProjectileSystem";
import {
	MAP_MODEL_NAME,
	PLAYER_BOAT_MODEL_NAME,
	PLAYER_BOAT_ROTATION_SPEED,
	WAYPOINT_NAMES,
} from "server/worldEcs/utils/constants";
import { anchorModel, cloneTemplateModel, getWaypoints, replaceWorkspaceModel } from "server/worldEcs/utils/modelUtils";
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
	playerBoat.SetAttribute(MotionAttributes.Speed, 0);
	playerBoat.SetAttribute(MotionAttributes.Direction, facing);
	playerBoat.SetAttribute(MotionAttributes.RotationSpeed, PLAYER_BOAT_ROTATION_SPEED);
	playerBoat.SetAttribute(MotionAttributes.Enabled, true);
	playerBoat.SetAttribute(MotionAttributes.CarriesCharacters, true);
	playerBoat.SetAttribute(MotionAttributes.Id, "playerBoat");
	CollectionService.AddTag(playerBoat, REPLICATED_MOTION_TAG);

	const boatEntity = createPlayerBoatEntities(playerBoat, waypoints);
	createMapCannonEntities(map);

	const ecsSystem = getEcs();
	ecsSystem.registerSystem(new PathFollowSystem());
	ecsSystem.registerSystem(new MoveToPointSystem());
	ecsSystem.registerSystem(new InteractableSystem());
	ecsSystem.registerSystem(
		new ShootAtPlayerVesselSystem({
			model: playerBoat,
			entity: boatEntity,
		}),
	);
	ecsSystem.registerSystem(new FireRequestSystem());
	ecsSystem.registerSystem(new HomingProjectileSystem());
	ecsSystem.registerSystem(new ProjectileSystem());
	ecsSystem.registerSystem(new HealthSystem());

	RunService.Heartbeat.Connect((dt) => {
		ecsSystem.tick(dt);
	});

	print("[worldEntityStore.ts] Started world ECS");
}
