import type { EntityRef } from "@rbxts/ecs";
import { getPlayerEntity } from "server/playerEntityRegistry";
import { Mountable, MountedBy, Mounting, WorldModel } from "server/worldEcs/components";
import { getEcs, getEntityFromInstance } from "server/worldEcs/ecs";
import { onEntityDied } from "server/worldEcs/deathSignal";
import { serverEvents } from "shared/network";
import { setProjectileSimulationMount } from "shared/projectileSimulation";

export type MountTriggerHandler = (
	player: Player,
	mountEntity: EntityRef,
	targetPos: Vector3,
	hitPointId?: string,
) => boolean;

const mountTriggerHandlers = new Array<MountTriggerHandler>();

export function registerMountTriggerHandler(handler: MountTriggerHandler): void {
	mountTriggerHandlers.push(handler);
}

export function tryMount(player: Player, mountEntity: EntityRef): boolean {
	const ecs = getEcs();
	const mountable = ecs.getComponent(mountEntity, Mountable);
	if (mountable === undefined) {
		return false;
	}

	if (ecs.getComponent(mountEntity, MountedBy) !== undefined) {
		return false;
	}

	const playerEntity = getPlayerEntity(player);
	if (playerEntity === undefined) {
		return false;
	}

	if (ecs.getComponent(playerEntity, Mounting) !== undefined) {
		return false;
	}

	const worldModel = ecs.getComponent(mountEntity, WorldModel);
	if (worldModel === undefined) {
		return false;
	}

	ecs.addComponent(mountEntity, MountedBy, { player });
	ecs.addComponent(playerEntity, Mounting, {
		mountEntity,
		mountModel: worldModel.model,
	});
	setProjectileSimulationMount(player, worldModel.model);

	serverEvents.fire(player, "Mount", worldModel.model, mountable.kind);
	return true;
}

export function unmountPlayer(player: Player): void {
	setProjectileSimulationMount(player, undefined);
	const ecs = getEcs();
	const playerEntity = getPlayerEntity(player);
	if (playerEntity === undefined) {
		return;
	}

	const mounting = ecs.getComponent(playerEntity, Mounting);
	if (mounting !== undefined) {
		if (ecs.isEntityValid(mounting.mountEntity)) {
			const mountedBy = ecs.getComponent(mounting.mountEntity, MountedBy);
			if (mountedBy !== undefined && mountedBy.player === player) {
				ecs.removeComponent(mounting.mountEntity, MountedBy);
			}
		}

		ecs.removeComponent(playerEntity, Mounting);
	}

	serverEvents.fire(player, "Unmount");
}

function handleMountTrigger(player: Player, targetPos: unknown, hitPointId: unknown): void {
	if (!typeIs(targetPos, "Vector3") || (hitPointId !== undefined && !typeIs(hitPointId, "string"))) {
		return;
	}

	const ecs = getEcs();
	const playerEntity = getPlayerEntity(player);
	if (playerEntity === undefined) {
		return;
	}

	const mounting = ecs.getComponent(playerEntity, Mounting);
	if (mounting === undefined || !ecs.isEntityValid(mounting.mountEntity)) {
		return;
	}

	for (const handler of mountTriggerHandlers) {
		if (handler(player, mounting.mountEntity, targetPos, hitPointId)) {
			return;
		}
	}
}

/** When an entity dies, kick riders off it and off any mount inside its model (e.g. boat cannons). */
function unmountRidersOnDeath(entity: EntityRef, model: Model): void {
	const ecs = getEcs();

	const mountedBy = ecs.isEntityValid(entity) ? ecs.getComponent(entity, MountedBy) : undefined;
	if (mountedBy !== undefined) {
		unmountPlayer(mountedBy.player);
	}

	for (const descendant of model.GetDescendants()) {
		if (!descendant.IsA("Model")) {
			continue;
		}
		const descendantEntity = getEntityFromInstance(descendant);
		if (descendantEntity === undefined || descendantEntity.id === entity.id) {
			continue;
		}
		const descendantMountedBy = ecs.getComponent(descendantEntity, MountedBy);
		if (descendantMountedBy !== undefined) {
			unmountPlayer(descendantMountedBy.player);
		}
	}
}

export function startMountServer(): void {
	onEntityDied(unmountRidersOnDeath);

	serverEvents.on("MountExit", (player) => {
		unmountPlayer(player);
	});

	serverEvents.on("MountTrigger", (player, targetPos, hitPointId) => {
		handleMountTrigger(player, targetPos, hitPointId);
	});

	print("[mountServer.ts] Started mount server");
}
