import { CollectionService, Workspace } from "@rbxts/services";
import { MotionAttributes, REPLICATED_MOTION_TAG } from "shared/serverAuthorityReplicatedMotion";

export interface ProjectileMotionSpec {
	position: Vector3;
	direction: Vector3;
	speed: number;
	rotationSpeed: number;
}

const DEFAULT_DIRECTION = new Vector3(0, 0, -1);

export function createProjectileMotionModel(spec: ProjectileMotionSpec): Model {
	const direction = spec.direction.Magnitude > 0.0001 ? spec.direction.Unit : DEFAULT_DIRECTION;

	const part = new Instance("Part");
	part.Name = "ProjectilePart";
	part.Size = new Vector3(3, 3, 3);
	part.Shape = Enum.PartType.Ball;
	part.Material = Enum.Material.Metal;
	part.Color = new Color3(0.02, 0.02, 0.02);
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;

	const model = new Instance("Model");
	model.Name = "projectile";
	part.Parent = model;
	model.PrimaryPart = part;
	model.PivotTo(CFrame.lookAt(spec.position, spec.position.add(direction)));
	model.SetAttribute(MotionAttributes.Speed, math.max(spec.speed, 0));
	model.SetAttribute(MotionAttributes.Direction, direction);
	model.SetAttribute(MotionAttributes.RotationSpeed, math.max(spec.rotationSpeed, 0));
	model.SetAttribute(MotionAttributes.Enabled, true);
	CollectionService.AddTag(model, REPLICATED_MOTION_TAG);
	model.Parent = Workspace;

	return model;
}
