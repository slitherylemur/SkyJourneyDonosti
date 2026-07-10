import { Players, UserInputService } from "@rbxts/services";
import type { MountController } from "client/mountController";
import { clientEvents } from "shared/network";

const mountControllers = new Map<string, MountController>();

let activeController: MountController | undefined;
let exitButton: TextButton | undefined;
let exitGui: ScreenGui | undefined;
let exitInputConnection: RBXScriptConnection | undefined;

export function registerMountController(kind: string, controller: MountController): void {
	mountControllers.set(kind, controller);
}

function createExitGui(): void {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;

	exitGui = new Instance("ScreenGui");
	exitGui.Name = "MountExitGui";
	exitGui.ResetOnSpawn = false;
	exitGui.Parent = playerGui;

	exitButton = new Instance("TextButton");
	exitButton.Name = "ExitButton";
	exitButton.Size = new UDim2(0, 160, 0, 48);
	exitButton.Position = new UDim2(0.5, -80, 1, -80);
	exitButton.AnchorPoint = new Vector2(0.5, 0);
	exitButton.BackgroundColor3 = new Color3(0.15, 0.15, 0.15);
	exitButton.TextColor3 = new Color3(1, 1, 1);
	exitButton.Text = "Exit";
	exitButton.TextSize = 20;
	exitButton.Parent = exitGui;

	exitButton.Activated.Connect(() => {
		clientEvents.fire("MountExit");
	});
}

function destroyExitGui(): void {
	exitInputConnection?.Disconnect();
	exitInputConnection = undefined;
	exitGui?.Destroy();
	exitGui = undefined;
	exitButton = undefined;
}

function bindExitInput(): void {
	exitInputConnection = UserInputService.InputBegan.Connect((input, gameProcessed) => {
		if (gameProcessed) {
			return;
		}

		if (input.KeyCode === Enum.KeyCode.E) {
			clientEvents.fire("MountExit");
		}
	});
}

function handleMount(model: Model, kind: string): void {
	const controller = mountControllers.get(kind);
	if (controller === undefined) {
		warn(`[mountClient.ts] No mount controller registered for kind "${kind}"`);
		clientEvents.fire("MountExit");
		return;
	}

	activeController = controller;
	controller.enter(model);
	createExitGui();
	bindExitInput();
}

function handleUnmount(): void {
	activeController?.exit();
	activeController = undefined;
	destroyExitGui();
}

export function startMountClient(): void {
	clientEvents.on("Mount", (model, kind) => {
		handleMount(model, kind);
	});

	clientEvents.on("Unmount", () => {
		handleUnmount();
	});

	print("[mountClient.ts] Started mount client");
}
