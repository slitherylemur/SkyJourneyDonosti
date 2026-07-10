import { componentType } from "@rbxts/ecs";

export interface PathFollowerData {
	waypoints: Vector3[];
	targetIndex: number;
	finished: boolean;
}

export const PathFollower = componentType<PathFollowerData>("PathFollower");
