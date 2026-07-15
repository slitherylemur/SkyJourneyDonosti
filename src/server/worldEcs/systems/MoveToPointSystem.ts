import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import { MotionAttributes } from "shared/serverAuthorityReplicatedMotion";
import { MoveToPoint, MovementLock, Velocity, WorldModel } from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import type { MoveToPointData } from "server/worldEcs/components/MoveToPoint";
import type { VelocityData } from "server/worldEcs/components/Velocity";
import { DEFAULT_FACING, horizontalMagnitude, horizontalUnitOr } from "server/worldEcs/utils/vectorUtils";

const ATTRIBUTE_EPSILON = 0.0001;

function getMotionDirection(model: Model): Vector3 {
	const value = model.GetAttribute(MotionAttributes.Direction);
	if (typeIs(value, "Vector3")) {
		return horizontalUnitOr(value, DEFAULT_FACING);
	}
	return horizontalUnitOr(model.GetPivot().LookVector, DEFAULT_FACING);
}

function setNumberIfChanged(model: Model, name: string, value: number): void {
	const current = model.GetAttribute(name);
	if (!typeIs(current, "number") || math.abs(current - value) > ATTRIBUTE_EPSILON) {
		model.SetAttribute(name, value);
	}
}

function setVectorIfChanged(model: Model, name: string, value: Vector3): void {
	const current = model.GetAttribute(name);
	if (!typeIs(current, "Vector3") || current.sub(value).Magnitude > ATTRIBUTE_EPSILON) {
		model.SetAttribute(name, value);
	}
}

export class MoveToPointSystem implements System {
	public getQuery(): Query {
		return new Query().all(MoveToPoint, Velocity, WorldModel);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, commands: CommandBuffer, _dt: number): void {
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
				const model = models[index].model;
				const lock = ecs.getComponent(entity, MovementLock);
				if (lock !== undefined) {
					if (os.clock() < lock.until) {
						velocities[index].value = Vector3.zero;
						this.setMotion(model, Vector3.zero, getMotionDirection(model), movers[index].rotationSpeed);
						continue;
					}
					commands.removeComponent(entity, MovementLock);
				}
				this.tickMover(movers[index], velocities[index], model);
			}
		}
	}

	private tickMover(mover: MoveToPointData, velocity: VelocityData, model: Model): void {
		const pointVelocity = mover.pointVelocity ?? Vector3.zero;
		let desiredDirection = getMotionDirection(model);
		let desiredVelocity = pointVelocity;

		if (mover.target === undefined) {
			mover.reached = true;
		} else {
			const toTarget = mover.target.sub(model.GetPivot().Position);
			const distance = horizontalMagnitude(toTarget);
			desiredDirection = horizontalUnitOr(toTarget, desiredDirection);
			mover.reached = distance <= mover.arriveDistance;
			if (!mover.reached) {
				desiredVelocity = pointVelocity.add(desiredDirection.mul(mover.speed));
			}
		}

		if (desiredVelocity.Magnitude > ATTRIBUTE_EPSILON) {
			desiredDirection = horizontalUnitOr(desiredVelocity, desiredDirection);
		}
		velocity.value = desiredVelocity;
		this.setMotion(model, desiredVelocity, desiredDirection, mover.rotationSpeed);
	}

	private setMotion(model: Model, velocity: Vector3, direction: Vector3, rotationSpeed: number): void {
		setNumberIfChanged(model, MotionAttributes.Speed, velocity.Magnitude);
		setVectorIfChanged(model, MotionAttributes.Direction, direction);
		setNumberIfChanged(model, MotionAttributes.RotationSpeed, math.max(rotationSpeed, 0));
	}
}
