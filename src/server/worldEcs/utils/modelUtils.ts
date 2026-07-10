import { ReplicatedStorage, Workspace } from "@rbxts/services";

export function getTemplateModel(name: string): Model | undefined {
	const template = ReplicatedStorage.FindFirstChild(name);
	if (template === undefined) {
		warn(`[modelUtils.ts] Missing ReplicatedStorage.${name}`);
		return undefined;
	}

	if (!template.IsA("Model")) {
		warn(`[modelUtils.ts] ReplicatedStorage.${name} is not a Model`);
		return undefined;
	}

	return template;
}

export function cloneTemplateModel(name: string): Model | undefined {
	const template = getTemplateModel(name);
	return template?.Clone();
}

export function anchorModel(model: Model): void {
	for (const descendant of model.GetDescendants()) {
		if (descendant.IsA("BasePart")) {
			descendant.Anchored = true;
		}
	}
}

export function replaceWorkspaceModel(name: string, model: Model): void {
	const existing = Workspace.FindFirstChild(name);
	existing?.Destroy();

	model.Name = name;
	model.Parent = Workspace;
}

export function getModelRadius(model: Model): number {
	const size = model.GetExtentsSize();
	return math.max(size.X, size.Z) * 0.5;
}

export function getWaypoints(map: Model, waypointNames: ReadonlyArray<string>): Vector3[] | undefined {
	const waypoints = new Array<Vector3>();

	for (const waypointName of waypointNames) {
		const waypoint = map.FindFirstChild(waypointName, true);
		if (waypoint === undefined || !waypoint.IsA("BasePart")) {
			warn(`[modelUtils.ts] Missing map waypoint ${waypointName}`);
			return undefined;
		}

		waypoints.push(waypoint.Position);
	}

	return waypoints;
}
