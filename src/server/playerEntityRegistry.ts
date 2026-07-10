import type { EntityRef } from "@rbxts/ecs";

const playerEntities = new Map<Player, EntityRef>();

export function getPlayerEntity(player: Player): EntityRef | undefined {
	return playerEntities.get(player);
}

export function setPlayerEntity(player: Player, entity: EntityRef): void {
	playerEntities.set(player, entity);
}

export function removePlayerEntity(player: Player): void {
	playerEntities.delete(player);
}
