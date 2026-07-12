import { RunService, Workspace } from "@rbxts/services";
import { uiStore } from "client/ui/store";
import { HEALTH_ATTRIBUTE, MAX_HEALTH_ATTRIBUTE } from "shared/mountShared";

export function startShipHealthBridge(): void {
	let boundBoat: Model | undefined;
	let healthConnection: RBXScriptConnection | undefined;
	let maxHealthConnection: RBXScriptConnection | undefined;

	const disconnectBoat = () => {
		healthConnection?.Disconnect();
		maxHealthConnection?.Disconnect();
		healthConnection = undefined;
		maxHealthConnection = undefined;
		boundBoat = undefined;
	};

	const bindBoat = (boat: Model) => {
		if (boundBoat === boat) {
			return;
		}
		disconnectBoat();
		boundBoat = boat;
		const update = () => {
			if (boundBoat !== boat || !boat.IsDescendantOf(Workspace)) {
				return;
			}
			const current = boat.GetAttribute(HEALTH_ATTRIBUTE);
			const max = boat.GetAttribute(MAX_HEALTH_ATTRIBUTE);
			if (typeIs(current, "number") && typeIs(max, "number")) {
				uiStore.set({ shipHealth: { current, max } });
			}
		};

		healthConnection = boat.GetAttributeChangedSignal(HEALTH_ATTRIBUTE).Connect(update);
		maxHealthConnection = boat.GetAttributeChangedSignal(MAX_HEALTH_ATTRIBUTE).Connect(update);
		update();
	};

	const tryBindCurrentBoat = () => {
		const candidate = Workspace.FindFirstChild("playerBoat");
		if (candidate !== undefined && candidate.IsA("Model")) {
			bindBoat(candidate);
		}
	};

	// Polling fallback: guarantees the UI tracks the attribute even if a signal
	// is missed (e.g. the boat model gets swapped between bind checks).
	let elapsed = 0;
	RunService.Heartbeat.Connect((dt) => {
		elapsed += dt;
		if (elapsed < 0.25) {
			return;
		}
		elapsed = 0;

		if (boundBoat === undefined || !boundBoat.IsDescendantOf(Workspace)) {
			tryBindCurrentBoat();
			return;
		}
		const current = boundBoat.GetAttribute(HEALTH_ATTRIBUTE);
		const max = boundBoat.GetAttribute(MAX_HEALTH_ATTRIBUTE);
		if (typeIs(current, "number") && typeIs(max, "number")) {
			const state = uiStore.get().shipHealth;
			if (state.current !== current || state.max !== max) {
				uiStore.set({ shipHealth: { current, max } });
			}
		}
	});

	Workspace.ChildAdded.Connect((child) => {
		if (child.IsA("Model") && child.Name === "playerBoat") {
			bindBoat(child);
		}
	});
	Workspace.ChildRemoved.Connect((child) => {
		if (child === boundBoat) {
			disconnectBoat();
			task.defer(tryBindCurrentBoat);
		}
	});

	tryBindCurrentBoat();
}
