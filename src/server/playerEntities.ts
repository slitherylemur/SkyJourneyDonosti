import { Players } from "@rbxts/services";
import {
	getPlayerEntity,
	removePlayerEntity,
	setPlayerEntity,
} from "server/playerEntityRegistry";
import { PlayerRef } from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import { unmountPlayer } from "server/mounting/mountServer";

export { getPlayerEntity } from "server/playerEntityRegistry";

function createPlayerEntity(player: Player, character: Model): void {
	const ecs = getEcs();
	const existing = getPlayerEntity(player);
	if (existing !== undefined) {
		if (ecs.isEntityValid(existing)) {
			ecs.destroyEntity(existing);
		}

		removePlayerEntity(player);
	}

	const entity = ecs.createEntity([
		{
			type: PlayerRef,
			data: {
				player,
				character,
			},
		},
	]);

	setPlayerEntity(player, entity);
}

function destroyPlayerEntity(player: Player): void {
	unmountPlayer(player);

	const ecs = getEcs();
	const entity = getPlayerEntity(player);
	if (entity === undefined) {
		return;
	}

	if (ecs.isEntityValid(entity)) {
		ecs.destroyEntity(entity);
	}

	removePlayerEntity(player);
}

function bindCharacter(player: Player, character: Model): void {
	createPlayerEntity(player, character);

	const humanoid = character.FindFirstChildOfClass("Humanoid");
	if (humanoid !== undefined) {
		humanoid.Died.Connect(() => {
			destroyPlayerEntity(player);
		});
	}
}

function bindPlayer(player: Player): void {
	if (player.Character !== undefined) {
		bindCharacter(player, player.Character);
	}

	player.CharacterAdded.Connect((character) => {
		bindCharacter(player, character);
	});

	player.CharacterRemoving.Connect(() => {
		destroyPlayerEntity(player);
	});
}

export function startPlayerEntities(): void {
	for (const player of Players.GetPlayers()) {
		bindPlayer(player);
	}

	Players.PlayerAdded.Connect(bindPlayer);
	Players.PlayerRemoving.Connect((player) => {
		destroyPlayerEntity(player);
	});

	print("[playerEntities.ts] Started player entities");
}
