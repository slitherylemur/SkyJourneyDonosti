import { componentType } from "@rbxts/ecs";

export interface InteractableData {
	promptText: string;
	prompt?: ProximityPrompt;
}

export const Interactable = componentType<InteractableData>("Interactable");
