import { CollectionService, RunService } from "@rbxts/services";

export function setModelPredictionMode(model: Model): void {
	if (!RunService.IsClient()) {
		return;
	}

	RunService.SetPredictionMode(model, Enum.PredictionMode.On);
	for (const descendant of model.GetDescendants()) {
		if (descendant.IsA("BasePart")) {
			RunService.SetPredictionMode(descendant, Enum.PredictionMode.On);
		}
	}
}

function preparePrimaryPart(model: Model): void {
	if (model.PrimaryPart !== undefined) {
		return;
	}

	task.spawn(() => {
		const primary = model.WaitForChild("primary");
		if (primary.IsA("BasePart")) {
			model.PrimaryPart = primary;
			setModelPredictionMode(model);
		} else {
			warn(`[simulationPrediction.ts] ${model.Name}.primary is not a BasePart`);
		}
	});
}

function setTaggedInstancePredictionMode(instance: Instance): void {
	if (instance.IsA("Model")) {
		preparePrimaryPart(instance);
		setModelPredictionMode(instance);
	}
}

export function startTaggedPredictionMode(tag: string): void {
	for (const instance of CollectionService.GetTagged(tag)) {
		setTaggedInstancePredictionMode(instance);
	}

	CollectionService.GetInstanceAddedSignal(tag).Connect(setTaggedInstancePredictionMode);
}
