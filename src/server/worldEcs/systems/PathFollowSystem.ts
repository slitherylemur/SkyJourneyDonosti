import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import { MoveToPoint, PathFollower } from "server/worldEcs/components";

export class PathFollowSystem implements System {
	public getQuery(): Query {
		return new Query().all(MoveToPoint, PathFollower);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, _commands: CommandBuffer, _dt: number): void {
		for (const chunk of chunks) {
			const movers = chunk.getComponentArray(MoveToPoint);
			const paths = chunk.getComponentArray(PathFollower);
			if (movers === undefined || paths === undefined) {
				continue;
			}

			for (let index = 0; index < chunk.size(); index++) {
				const mover = movers[index];
				const path = paths[index];

				if (path.finished || !mover.reached) {
					continue;
				}

				if (path.targetIndex >= path.waypoints.size() - 1) {
					path.finished = true;
					mover.target = undefined;
					continue;
				}

				path.targetIndex += 1;
				mover.target = path.waypoints[path.targetIndex];
				mover.pointVelocity = undefined;
				mover.reached = false;
			}
		}
	}
}
