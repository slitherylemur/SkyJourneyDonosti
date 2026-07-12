import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import { MotionAttributes } from "shared/serverAuthorityReplicatedMotion";
import { MoveToPoint, Velocity, WorldModel } from "server/worldEcs/components";
import { MovementLock } from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import type { MoveToPointData } from "server/worldEcs/components/MoveToPoint";
import type { VelocityData } from "server/worldEcs/components/Velocity";
import { DEFAULT_FACING, horizontalMagnitude, horizontalUnitOr } from "server/worldEcs/utils/vectorUtils";

function getMotionLookDirection(model: Model): Vector3 {
	const value = model.GetAttribute(MotionAttributes.LookDirection);
	if (typeIs(value, "Vector3")) {
		return horizontalUnitOr(value, DEFAULT_FACING);
	}

	return horizontalUnitOr(model.GetPivot().LookVector, DEFAULT_FACING);
}

function rotateTowards(current: Vector3, desired: Vector3, maxRadians: number): Vector3 {
	const currentAngle = math.atan2(current.X, current.Z);
	const desiredAngle = math.atan2(desired.X, desired.Z);
	const delta = math.atan2(math.sin(desiredAngle - currentAngle), math.cos(desiredAngle - currentAngle));
	const clampedDelta = math.clamp(delta, -maxRadians, maxRadians);
	const nextAngle = currentAngle + clampedDelta;

	return new Vector3(math.sin(nextAngle), 0, math.cos(nextAngle));
}

export class MoveToPointSystem implements System {
	public getQuery(): Query {
		return new Query().all(MoveToPoint, Velocity, WorldModel);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, commands: CommandBuffer, dt: number): void {
		const ecs = getEcs();
		for (const chunk of chunks) {
			const movers = chunk.getComponentArray(MoveToPoint);
			const velocities = chunk.getComponentArray(Velocity);
			const models = chunk.getComponentArray(WorldModel);
			if (movers === undefined || velocities === undefined || models === undefined) {
				continue;
			}

			for (let index = 0; index < chunk.size(); index++) {
				const entity = chunk.entities[index];
				const lock = ecs.getComponent(entity, MovementLock);
				if (lock !== undefined) {
					if (os.clock() < lock.until) {
						velocities[index].value = Vector3.zero;
						models[index].model.SetAttribute(MotionAttributes.Velocity, Vector3.zero);
						continue;
					}
					commands.removeComponent(entity, MovementLock);
				}
				this.tickMover(movers[index], velocities[index], models[index].model, dt);
			}
		}
	}

	private tickMover(mover: MoveToPointData, velocity: VelocityData, model: Model, dt: number): void {
		const target = mover.target;
		const pointVelocity = mover.pointVelocity ?? new Vector3(0, 0, 0);

		if (target === undefined) {
			mover.reached = true;
			velocity.value = pointVelocity;
			this.setMotion(model, velocity.value, getMotionLookDirection(model));
			return;
		}

		const position = model.GetPivot().Position;
		const toTarget = target.sub(position);
		const distance = horizontalMagnitude(toTarget);
		const currentFacing = getMotionLookDirection(model);
		const desiredFacing = horizontalUnitOr(toTarget, currentFacing);
		const nextFacing = rotateTowards(currentFacing, desiredFacing, mover.rotationSpeed * dt);

		mover.reached = distance <= mover.arriveDistance;
		velocity.value = mover.reached ? pointVelocity : pointVelocity.add(nextFacing.mul(mover.speed));
		this.setMotion(model, velocity.value, nextFacing);
	}

	private setMotion(model: Model, velocity: Vector3, lookDirection: Vector3): void {
		model.SetAttribute(MotionAttributes.Velocity, velocity);
		model.SetAttribute(MotionAttributes.LookDirection, lookDirection);
		model.SetAttribute(MotionAttributes.LockLookDirection, true);
	}
}
