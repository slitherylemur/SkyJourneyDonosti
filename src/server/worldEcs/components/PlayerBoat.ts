import { componentType } from "@rbxts/ecs";

export interface PlayerBoatData {
	isPlayerBoat: boolean;
}

export const PlayerBoat = componentType<PlayerBoatData>("PlayerBoat");
