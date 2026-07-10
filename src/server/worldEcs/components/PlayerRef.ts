import { componentType } from "@rbxts/ecs";

export interface PlayerRefData {
	player: Player;
	character: Model;
}

export const PlayerRef = componentType<PlayerRefData>("PlayerRef");
