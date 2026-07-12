import React from "@rbxts/react";
import { createRoot } from "@rbxts/react-roblox";
import { Players } from "@rbxts/services";
import { App } from "client/ui/App";

export function initUi(): void {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const container = new Instance("Folder");
	container.Name = "CombatUi";
	container.Parent = playerGui;

	createRoot(container).render(<App />);
}
