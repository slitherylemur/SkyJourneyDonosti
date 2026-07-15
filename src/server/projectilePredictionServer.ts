import { Mounting, Shooter } from "server/worldEcs/components";
import { findBoatModel, getEntityFromInstance, getEcs } from "server/worldEcs/ecs";
import { findEnemyHitPointAlongRay } from "server/worldEcs/hitPointRegistry";
import { getPlayerEntity } from "server/playerEntityRegistry";
import { registerProjectileAuthority } from "server/worldEcs/projectileAuthority";
import {
	CANNON_AI_MAX_RANGE,
	PROJECTILE_BASE_DAMAGE,
	PROJECTILE_MAX_RANGE,
	PROJECTILE_ROTATION_SPEED,
	PROJECTILE_SPEED,
} from "shared/mountShared";
import {
	startProjectileSimulation,
	type ProjectileSpawnEvent,
	type ProjectileSimulationServerHooks,
} from "shared/projectileSimulation";

const TARGET_RAY_TOLERANCE = 12;

function getValidatedShooter(player: Player, mount: Model) {
	const playerEntity = getPlayerEntity(player);
	const mountEntity = getEntityFromInstance(mount);
	if (playerEntity === undefined || mountEntity === undefined) {
		return undefined;
	}

	const ecs = getEcs();
	const mounting = ecs.getComponent(playerEntity, Mounting);
	if (mounting === undefined || mounting.mountEntity.id !== mountEntity.id || mounting.mountModel !== mount) {
		return undefined;
	}
	return ecs.getComponent(mountEntity, Shooter);
}

const hooks: ProjectileSimulationServerHooks = {
	validate: (player, mount, direction) => {
		if (getValidatedShooter(player, mount) === undefined || direction.Magnitude < 0.0001) {
			return undefined;
		}
		return direction.Unit;
	},
	onCreated: (event: ProjectileSpawnEvent) => {
		const shooter = getValidatedShooter(event.player, event.mount);
		if (shooter === undefined) {
			event.model.Destroy();
			return;
		}

		const target = event.targeted
			? findEnemyHitPointAlongRay(event.position, event.direction, CANNON_AI_MAX_RANGE, TARGET_RAY_TOLERANCE)
			: undefined;
		const ignoreInstances = [event.model];
		const boat = findBoatModel(event.mount);
		if (boat !== undefined) {
			ignoreInstances.push(boat);
		}

		registerProjectileAuthority({
			model: event.model,
			direction: event.direction,
			position: event.position,
			speed: PROJECTILE_SPEED,
			rotationSpeed: PROJECTILE_ROTATION_SPEED,
			damage: PROJECTILE_BASE_DAMAGE * shooter.power,
			maxRange: PROJECTILE_MAX_RANGE,
			ignoreInstances,
			hitPointId: target?.id,
			hitPoint: target?.hitPoint,
		});
		shooter.lastFiredAt = os.clock();
	},
};

export function startProjectilePredictionServer(): void {
	startProjectileSimulation({ mode: "server", serverHooks: hooks });
}
