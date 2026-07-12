import { Workspace } from "@rbxts/services";
import { uiStore } from "client/ui/store";
import { HEALTH_ATTRIBUTE, MAX_HEALTH_ATTRIBUTE } from "shared/mountShared";

export function startShipHealthBridge(): void {
	task.spawn(() => {
		const boat = Workspace.WaitForChild("playerBoat") as Model;

		const update = () => {
			const current = boat.GetAttribute(HEALTH_ATTRIBUTE);
			const max = boat.GetAttribute(MAX_HEALTH_ATTRIBUTE);
			if (typeIs(current, "number") && typeIs(max, "number")) {
				uiStore.set({ shipHealth: { current, max } });
			}
		};

		boat.GetAttributeChangedSignal(HEALTH_ATTRIBUTE).Connect(update);
		boat.GetAttributeChangedSignal(MAX_HEALTH_ATTRIBUTE).Connect(update);
		update();
	});
}
