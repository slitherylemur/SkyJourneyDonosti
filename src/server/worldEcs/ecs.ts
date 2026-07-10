import { ECSSystem, type EntityRef } from "@rbxts/ecs";
import { ENTITY_ID_ATTRIBUTE } from "shared/mountShared";

let ecsSystem: ECSSystem | undefined;

export function getEcs(): ECSSystem {
	if (ecsSystem === undefined) {
		ecsSystem = new ECSSystem();
	}

	return ecsSystem;
}

export function attachEntityToModel(model: Model, entity: EntityRef): void {
	model.SetAttribute(ENTITY_ID_ATTRIBUTE, entity.id);

	for (const descendant of model.GetDescendants()) {
		if (descendant.IsA("BasePart")) {
			descendant.SetAttribute(ENTITY_ID_ATTRIBUTE, entity.id);
		}
	}
}

export function getEntityFromInstance(instance: Instance): EntityRef | undefined {
	const value = instance.GetAttribute(ENTITY_ID_ATTRIBUTE);
	if (!typeIs(value, "number")) {
		return undefined;
	}

	const entity: EntityRef = { id: value };
	if (!getEcs().isEntityValid(entity)) {
		return undefined;
	}

	return entity;
}

export function findBoatModel(model: Model): Model | undefined {
	let current: Instance | undefined = model;
	while (current !== undefined) {
		if (current.IsA("Model") && current.Name === "playerBoat") {
			return current;
		}

		current = current.Parent;
	}

	return undefined;
}
