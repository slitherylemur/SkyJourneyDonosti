import { Players } from "@rbxts/services";

const CONTEXT_NAME = "CannonInputContext";
const FIRE_ACTION_NAME = "CannonFire";
const AIM_ACTION_NAME = "CannonAimDirection";
const TARGETED_ACTION_NAME = "CannonTargeted";
const BINDING_NAME = "Scriptable";

interface ProjectileInputActions {
	fire: InputAction;
	aim: InputAction;
	targeted: InputAction;
}

interface ProjectileInputBindings {
	fire: InputBinding;
	aim: InputBinding;
	targeted: InputBinding;
}

function createAction(context: InputContext, name: string, actionType: Enum.InputActionType): void {
	const action = new Instance("InputAction");
	action.Name = name;
	action.Type = actionType;
	action.Enabled = true;

	const binding = new Instance("InputBinding");
	binding.Name = BINDING_NAME;
	binding.Type = Enum.InputBindingType.Scriptable;
	binding.Parent = action;
	action.Parent = context;
}

function createPlayerContext(player: Player): void {
	if (player.FindFirstChild(CONTEXT_NAME) !== undefined) {
		return;
	}

	const context = new Instance("InputContext");
	context.Name = CONTEXT_NAME;
	context.Enabled = true;
	createAction(context, FIRE_ACTION_NAME, Enum.InputActionType.Bool);
	createAction(context, AIM_ACTION_NAME, Enum.InputActionType.Direction3D);
	createAction(context, TARGETED_ACTION_NAME, Enum.InputActionType.Bool);
	context.Parent = player;
}

export function startProjectileInputServer(): void {
	for (const player of Players.GetPlayers()) {
		createPlayerContext(player);
	}
	Players.PlayerAdded.Connect(createPlayerContext);
}

export function getProjectileInputActions(player: Player): ProjectileInputActions | undefined {
	const context = player.FindFirstChild(CONTEXT_NAME);
	if (context === undefined || !context.IsA("InputContext")) {
		return undefined;
	}

	const fire = context.FindFirstChild(FIRE_ACTION_NAME);
	const aim = context.FindFirstChild(AIM_ACTION_NAME);
	const targeted = context.FindFirstChild(TARGETED_ACTION_NAME);
	if (
		fire === undefined ||
		!fire.IsA("InputAction") ||
		aim === undefined ||
		!aim.IsA("InputAction") ||
		targeted === undefined ||
		!targeted.IsA("InputAction")
	) {
		return undefined;
	}

	return { fire, aim, targeted };
}

function getLocalBindings(): ProjectileInputBindings | undefined {
	const actions = getProjectileInputActions(Players.LocalPlayer);
	if (actions === undefined) {
		return undefined;
	}

	const fire = actions.fire.FindFirstChild(BINDING_NAME);
	const aim = actions.aim.FindFirstChild(BINDING_NAME);
	const targeted = actions.targeted.FindFirstChild(BINDING_NAME);
	if (
		fire === undefined ||
		!fire.IsA("InputBinding") ||
		aim === undefined ||
		!aim.IsA("InputBinding") ||
		targeted === undefined ||
		!targeted.IsA("InputBinding")
	) {
		return undefined;
	}

	return { fire, aim, targeted };
}

export function setLocalProjectileFire(direction: Vector3, targeted: boolean, pressed: boolean): boolean {
	const bindings = getLocalBindings();
	if (bindings === undefined) {
		warn("[projectileInput.ts] Cannon InputActions are not available yet");
		return false;
	}

	if (pressed) {
		bindings.aim.Fire(direction);
		bindings.targeted.Fire(targeted);
	}
	bindings.fire.Fire(pressed);
	return true;
}
