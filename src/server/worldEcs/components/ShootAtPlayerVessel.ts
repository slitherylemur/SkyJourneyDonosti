import { componentType } from "@rbxts/ecs";

export interface ShootAtPlayerVesselData {
	maxRange: number;
}

export const ShootAtPlayerVessel = componentType<ShootAtPlayerVesselData>("ShootAtPlayerVessel");
