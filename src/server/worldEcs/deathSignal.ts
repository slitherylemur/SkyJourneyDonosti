import type { EntityRef } from "@rbxts/ecs";

type EntityDiedCallback = (entity: EntityRef, model: Model) => void;
const callbacks = new Array<EntityDiedCallback>();

export function onEntityDied(callback: EntityDiedCallback): () => void {
	callbacks.push(callback);
	return () => {
		const index = callbacks.indexOf(callback);
		if (index >= 0) {
			callbacks.remove(index);
		}
	};
}

export function fireEntityDied(entity: EntityRef, model: Model): void {
	for (const callback of callbacks) {
		callback(entity, model);
	}
}
