import { Query, type ArchetypeChunk, type CommandBuffer, type System } from "@rbxts/ecs";
import { Interactable, Mountable, MountedBy, WorldModel } from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import { tryMount } from "server/mounting/mountServer";

function findPromptParent(model: Model): BasePart | undefined {
	const namedPart = model.FindFirstChild("Part");
	if (namedPart !== undefined && namedPart.IsA("BasePart")) {
		return namedPart;
	}

	for (const child of model.GetChildren()) {
		if (child.IsA("BasePart")) {
			return child;
		}
	}

	return undefined;
}

export class InteractableSystem implements System {
	public getQuery(): Query {
		return new Query().all(Interactable, Mountable, WorldModel);
	}

	public tick(chunks: ReadonlyArray<ArchetypeChunk>, _commands: CommandBuffer, _dt: number): void {
		const ecs = getEcs();

		for (const chunk of chunks) {
			const interactables = chunk.getComponentArray(Interactable);
			const worldModels = chunk.getComponentArray(WorldModel);
			if (interactables === undefined || worldModels === undefined) {
				continue;
			}

			for (let index = 0; index < chunk.size(); index++) {
				const interactable = interactables[index];
				const worldModel = worldModels[index];
				const entity = chunk.entities[index];

				if (interactable.prompt === undefined) {
					const parent = findPromptParent(worldModel.model);
					if (parent === undefined) {
						warn(`[InteractableSystem.ts] No BasePart found for ${worldModel.model.GetFullName()}`);
						continue;
					}

					const prompt = new Instance("ProximityPrompt");
					prompt.ActionText = interactable.promptText;
					prompt.RequiresLineOfSight = false;
					prompt.MaxActivationDistance = 12;
					prompt.HoldDuration = 0;
					prompt.Parent = parent;

					prompt.Triggered.Connect((triggeringPlayer) => {
						tryMount(triggeringPlayer, entity);
					});

					interactable.prompt = prompt;
				}

				interactable.prompt.Enabled = ecs.getComponent(entity, MountedBy) === undefined;
			}
		}
	}
}
