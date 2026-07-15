import { CollectionService, ReplicatedStorage, Workspace } from "@rbxts/services";
import { MotionAttributes, REPLICATED_MOTION_TAG } from "shared/serverAuthorityReplicatedMotion";
import {
	HOMING_PROJECTILE_TAG,
	HOMING_SPEED_ATTRIBUTE,
	HOMING_TARGET_VALUE_NAME,
} from "shared/homingProjectileSimulation";

export interface ProjectileMotionSpec {
	position: Vector3;
	direction: Vector3;
	speed: number;
	rotationSpeed: number;
	homing?: boolean;
}

const DEFAULT_DIRECTION = new Vector3(0, 0, -1);
const PROJECTILE_TEMPLATE_NAME = "ProjectileMotionTemplate";
const HOMING_PROJECTILE_TEMPLATE_NAME = "HomingProjectileMotionTemplate";

function buildProjectileTemplate(name: string, tag: string): Model {
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
	model.Name = name;
	part.Parent = model;
	if (tag === HOMING_PROJECTILE_TAG) {
		const target = new Instance("ObjectValue");
		target.Name = HOMING_TARGET_VALUE_NAME;
		target.Parent = model;
	}
	model.PrimaryPart = part;
	CollectionService.AddTag(model, tag);
	return model;
}

export function initializeProjectileMotionTemplateServer(): void {
	for (const [name, tag] of [
		[PROJECTILE_TEMPLATE_NAME, REPLICATED_MOTION_TAG],
		[HOMING_PROJECTILE_TEMPLATE_NAME, HOMING_PROJECTILE_TAG],
	] as const) {
		const existing = ReplicatedStorage.FindFirstChild(name);
		if (existing !== undefined) {
			if (!existing.IsA("Model")) {
				error(`[projectileMotion.ts] ReplicatedStorage.${name} must be a Model`);
			}
			continue;
		}

		const template = buildProjectileTemplate(name, tag);
		template.Parent = ReplicatedStorage;
	}
}

function getProjectileTemplate(homing: boolean): Model | undefined {
	const templateName = homing ? HOMING_PROJECTILE_TEMPLATE_NAME : PROJECTILE_TEMPLATE_NAME;
	const template = ReplicatedStorage.FindFirstChild(templateName);
	return template !== undefined && template.IsA("Model") ? template : undefined;
}

export function createProjectileMotionModel(spec: ProjectileMotionSpec): Model | undefined {
	const homing = spec.homing === true;
	const template = getProjectileTemplate(homing);
	if (template === undefined) {
		warn(`[projectileMotion.ts] Missing projectile motion template`);
		return undefined;
	}

	const direction = spec.direction.Magnitude > 0.0001 ? spec.direction.Unit : DEFAULT_DIRECTION;
	const model = template.Clone();
	model.Name = "projectile";
	model.PivotTo(CFrame.lookAt(spec.position, spec.position.add(direction)));
	if (homing) {
		model.SetAttribute(HOMING_SPEED_ATTRIBUTE, math.max(spec.speed, 0));
	} else {
		model.SetAttribute(MotionAttributes.Speed, math.max(spec.speed, 0));
		model.SetAttribute(MotionAttributes.Direction, direction);
		model.SetAttribute(MotionAttributes.RotationSpeed, math.max(spec.rotationSpeed, 0));
		model.SetAttribute(MotionAttributes.Enabled, true);
	}
	model.Parent = Workspace;
	return model;
}
