import React from "@rbxts/react";
import { createRoot, type Root } from "@rbxts/react-roblox";
import { Players } from "@rbxts/services";
import { App } from "client/ui/App";

/**
 * Mounts the HUD and remounts it after character respawn: Roblox clears
 * PlayerGui on respawn (our root container is a Folder, which ResetOnSpawn
 * does not protect), so rebuilding the React root is the reliable option.
 */
export function initUi(): void {
	const player = Players.LocalPlayer;
	let root: Root | undefined;
	let container: Folder | undefined;

	const mountHud = () => {
		const playerGui = player.WaitForChild("PlayerGui") as PlayerGui;
		if (container !== undefined && container.IsDescendantOf(playerGui)) {
			return;
		}

		root?.unmount();
		container = new Instance("Folder");
		container.Name = "CombatUi";
		container.Parent = playerGui;
		root = createRoot(container);
		root.render(<App />);
	};

	player.CharacterAdded.Connect(() => {
		// Defer so the respawn PlayerGui reset has finished before we remount.
		task.defer(mountHud);
	});

	mountHud();
}
