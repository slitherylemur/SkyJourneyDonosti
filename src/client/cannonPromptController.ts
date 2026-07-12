import { Players, ProximityPromptService, RunService, TweenService, Workspace } from "@rbxts/services";
import {
	CANNON_BILLBOARD_DISTANCE,
	CUSTOM_CANNON_PROMPT_ATTRIBUTE,
	HEALTH_ATTRIBUTE,
	MAX_HEALTH_ATTRIBUTE,
} from "shared/mountShared";

const VIEW_DOT_THRESHOLD = math.cos(math.rad(24));
const BILLBOARD_SIZE = new UDim2(0, 300, 0, 330);
const WHITE = new Color3(1, 1, 1);
const DARK = new Color3(0.035, 0.04, 0.045);

interface PromptView {
	gui: BillboardGui;
	healthFill: Frame;
	model?: Model;
	healthConnection?: RBXScriptConnection;
	maxHealthConnection?: RBXScriptConnection;
	renderConnection: RBXScriptConnection;
	tweens: Tween[];
}

const activeViews = new Map<ProximityPrompt, PromptView>();

function findModel(instance: Instance): Model | undefined {
	let current: Instance | undefined = instance;
	while (current !== undefined) {
		if (current.IsA("Model")) {
			return current;
		}
		current = current.Parent;
	}
	return undefined;
}

function createText(parent: Instance, text: string, size: UDim2, position: UDim2): TextLabel {
	const label = new Instance("TextLabel");
	label.BackgroundTransparency = 1;
	label.Size = size;
	label.Position = position;
	label.Font = Enum.Font.GothamBold;
	label.Text = text;
	label.TextColor3 = WHITE;
	label.TextScaled = true;
	label.TextStrokeColor3 = new Color3(0, 0, 0);
	label.TextStrokeTransparency = 0.35;
	label.Parent = parent;
	return label;
}

function addCornerArrow(parent: Instance, position: UDim2, targetPosition: UDim2, rotation: number): Tween {
	const arrow = createText(parent, "\u{25B6}", UDim2.fromOffset(28, 28), position);
	arrow.AnchorPoint = new Vector2(0.5, 0.5);
	arrow.Rotation = rotation;
	const tween = TweenService.Create(
		arrow,
		new TweenInfo(0.65, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
		{ Position: targetPosition },
	);
	tween.Play();
	return tween;
}

function updateHealth(view: PromptView): void {
	const current = view.model?.GetAttribute(HEALTH_ATTRIBUTE);
	const max = view.model?.GetAttribute(MAX_HEALTH_ATTRIBUTE);
	const fraction = typeIs(current, "number") && typeIs(max, "number") ? math.clamp(current / math.max(max, 1), 0, 1) : 1;
	view.healthFill.Size = UDim2.fromScale(fraction, 1);
	view.healthFill.BackgroundColor3 = Color3.fromHSV(0.33 * fraction, 0.85, 1);
}

function destroyView(prompt: ProximityPrompt): void {
	const view = activeViews.get(prompt);
	if (view === undefined) {
		return;
	}
	activeViews.delete(prompt);
	view.healthConnection?.Disconnect();
	view.maxHealthConnection?.Disconnect();
	view.renderConnection.Disconnect();
	for (const tween of view.tweens) {
		tween.Cancel();
	}
	view.gui.Destroy();
}

function ensureView(prompt: ProximityPrompt): PromptView | undefined {
	const existing = activeViews.get(prompt);
	if (existing !== undefined) {
		return existing;
	}
	if (prompt.GetAttribute(CUSTOM_CANNON_PROMPT_ATTRIBUTE) !== true) {
		return undefined;
	}
	const adornee = prompt.Parent;
	if (adornee === undefined || (!adornee.IsA("BasePart") && !adornee.IsA("Attachment"))) {
		return undefined;
	}

	const gui = new Instance("BillboardGui");
	gui.Name = "CannonPromptUi";
	gui.Adornee = adornee;
	gui.Size = BILLBOARD_SIZE;
	gui.StudsOffsetWorldSpace = new Vector3(0, 2.5, 0);
	gui.AlwaysOnTop = true;
	gui.LightInfluence = 0;
	gui.MaxDistance = CANNON_BILLBOARD_DISTANCE + 2;
	gui.Parent = Workspace.CurrentCamera;

	const healthBack = new Instance("Frame");
	healthBack.AnchorPoint = new Vector2(0.5, 0);
	healthBack.Position = new UDim2(0.5, 0, 0, 4);
	healthBack.Size = new UDim2(0, 230, 0, 14);
	healthBack.BackgroundColor3 = DARK;
	healthBack.BorderColor3 = WHITE;
	healthBack.BorderSizePixel = 2;
	healthBack.ClipsDescendants = true;
	healthBack.Parent = gui;

	const healthFill = new Instance("Frame");
	healthFill.Size = UDim2.fromScale(1, 1);
	healthFill.BorderSizePixel = 0;
	healthFill.BackgroundColor3 = new Color3(0.1, 1, 0.2);
	healthFill.Parent = healthBack;

	const tweens = [
		addCornerArrow(gui, new UDim2(0, 24, 0, 42), new UDim2(0, 46, 0, 66), 45),
		addCornerArrow(gui, new UDim2(1, -24, 0, 42), new UDim2(1, -46, 0, 66), 135),
		addCornerArrow(gui, new UDim2(1, -24, 1, -48), new UDim2(1, -46, 1, -72), -135),
		addCornerArrow(gui, new UDim2(0, 24, 1, -48), new UDim2(0, 46, 1, -72), -45),
	];

	const model = findModel(adornee);
	const view: PromptView = {
		gui,
		healthFill,
		model,
		renderConnection: RunService.RenderStepped.Connect(() => {
			const camera = Workspace.CurrentCamera;
			const root = Players.LocalPlayer.Character?.FindFirstChild("HumanoidRootPart");
			if (
				camera === undefined ||
				root === undefined ||
				!root.IsA("BasePart") ||
				!adornee.IsDescendantOf(game) ||
				!prompt.Enabled
			) {
				gui.Enabled = false;
				return;
			}
			const worldPosition = adornee.IsA("Attachment") ? adornee.WorldPosition : adornee.Position;
			const cameraOffset = worldPosition.sub(camera.CFrame.Position);
			const inIndicatorRange = worldPosition.sub(root.Position).Magnitude <= CANNON_BILLBOARD_DISTANCE;
			gui.Enabled =
				inIndicatorRange &&
				cameraOffset.Magnitude > 0.001 &&
				camera.CFrame.LookVector.Dot(cameraOffset.Unit) >= VIEW_DOT_THRESHOLD;
		}),
		tweens,
	};
	view.healthConnection = model?.GetAttributeChangedSignal(HEALTH_ATTRIBUTE).Connect(() => updateHealth(view));
	view.maxHealthConnection = model?.GetAttributeChangedSignal(MAX_HEALTH_ATTRIBUTE).Connect(() => updateHealth(view));
	activeViews.set(prompt, view);
	updateHealth(view);
	return view;
}

export function startCannonPromptController(): void {
	ProximityPromptService.MaxIndicatorsVisible = 12;
	const registerPrompt = (instance: Instance) => {
		if (instance.IsA("ProximityPrompt") && instance.GetAttribute(CUSTOM_CANNON_PROMPT_ATTRIBUTE) === true) {
			ensureView(instance);
		}
	};
	for (const descendant of Workspace.GetDescendants()) {
		registerPrompt(descendant);
	}
	Workspace.DescendantAdded.Connect(registerPrompt);
	Workspace.DescendantRemoving.Connect((instance) => {
		if (instance.IsA("ProximityPrompt")) {
			destroyView(instance);
		}
	});
}
