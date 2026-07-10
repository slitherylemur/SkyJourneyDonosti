import type { MountController } from "client/mountController";
import { Players, RunService, UserInputService, Workspace } from "@rbxts/services";
import { clientEvents } from "shared/network";
import {
	AIM_PITCH_MAX_ATTRIBUTE,
	AIM_PITCH_MIN_ATTRIBUTE,
	AIM_YAW_LIMIT_ATTRIBUTE,
} from "shared/mountShared";

const AIM_SENSITIVITY = 0.005;
const FIRE_RAY_DISTANCE = 1000;

function getNumberAttribute(instance: Instance, name: string, fallback: number): number {
	const value = instance.GetAttribute(name);
	return typeIs(value, "number") ? value : fallback;
}

function clampDirection(basePart: BasePart, yaw: number, pitch: number, yawLimit: number, pitchMin: number, pitchMax: number): Vector3 {
	const clampedYaw = math.clamp(yaw, -yawLimit, yawLimit);
	const clampedPitch = math.clamp(pitch, pitchMin, pitchMax);
	const localDirection = new Vector3(
		math.sin(clampedYaw) * math.cos(clampedPitch),
		math.sin(clampedPitch),
		math.cos(clampedYaw) * math.cos(clampedPitch),
	);

	return basePart.CFrame.VectorToWorldSpace(localDirection).Unit;
}

function findBoatModel(model: Model): Model | undefined {
	let current: Instance | undefined = model;
	while (current !== undefined) {
		if (current.IsA("Model") && current.Name === "playerBoat") {
			return current;
		}

		current = current.Parent;
	}

	return undefined;
}

class CannonMountController implements MountController {
	private mountModel?: Model;
	private cameraPart?: BasePart;
	private basePart?: BasePart;
	private yaw = 0;
	private pitch = 0;
	private renderConnection?: RBXScriptConnection;
	private lookConnection?: RBXScriptConnection;
	private fireConnection?: RBXScriptConnection;

	public enter(mountModel: Model): void {
		const cameraPart = mountModel.FindFirstChild("cameraPart");
		const basePart = mountModel.FindFirstChild("Part");
		if (cameraPart === undefined || !cameraPart.IsA("BasePart")) {
			warn("[cannonMountController.ts] Missing cameraPart on cannon");
			return;
		}

		if (basePart === undefined || !basePart.IsA("BasePart")) {
			warn("[cannonMountController.ts] Missing base Part on cannon");
			return;
		}

		this.mountModel = mountModel;
		this.cameraPart = cameraPart;
		this.basePart = basePart;
		this.yaw = 0;
		this.pitch = 0;

		const camera = Workspace.CurrentCamera;
		if (camera !== undefined) {
			camera.CameraType = Enum.CameraType.Scriptable;
		}

		UserInputService.MouseBehavior = Enum.MouseBehavior.Default;

		this.renderConnection = RunService.RenderStepped.Connect(() => {
			this.updateCamera();
		});

		this.lookConnection = UserInputService.InputChanged.Connect((input) => {
			if (input.UserInputType === Enum.UserInputType.MouseMovement || input.UserInputType === Enum.UserInputType.Touch) {
				this.yaw -= input.Delta.X * AIM_SENSITIVITY;
				this.pitch -= input.Delta.Y * AIM_SENSITIVITY;
			}
		});

		this.fireConnection = UserInputService.InputBegan.Connect((input, gameProcessed) => {
			if (gameProcessed) {
				return;
			}

			if (input.UserInputType === Enum.UserInputType.MouseButton1) {
				this.fire(UserInputService.GetMouseLocation());
			} else if (input.UserInputType === Enum.UserInputType.Touch) {
				this.fire(new Vector2(input.Position.X, input.Position.Y));
			}
		});
	}

	public exit(): void {
		this.renderConnection?.Disconnect();
		this.lookConnection?.Disconnect();
		this.fireConnection?.Disconnect();
		this.renderConnection = undefined;
		this.lookConnection = undefined;
		this.fireConnection = undefined;

		const camera = Workspace.CurrentCamera;
		if (camera !== undefined) {
			camera.CameraType = Enum.CameraType.Custom;
		}

		UserInputService.MouseBehavior = Enum.MouseBehavior.Default;
		this.mountModel = undefined;
		this.cameraPart = undefined;
		this.basePart = undefined;
	}

	private updateCamera(): void {
		const cameraPart = this.cameraPart;
		const basePart = this.basePart;
		const mountModel = this.mountModel;
		const camera = Workspace.CurrentCamera;
		if (cameraPart === undefined || basePart === undefined || mountModel === undefined || camera === undefined) {
			return;
		}

		const yawLimit = getNumberAttribute(mountModel, AIM_YAW_LIMIT_ATTRIBUTE, math.rad(60));
		const pitchMin = getNumberAttribute(mountModel, AIM_PITCH_MIN_ATTRIBUTE, math.rad(-5));
		const pitchMax = getNumberAttribute(mountModel, AIM_PITCH_MAX_ATTRIBUTE, math.rad(45));
		const worldDirection = clampDirection(basePart, this.yaw, this.pitch, yawLimit, pitchMin, pitchMax);

		camera.CFrame = CFrame.lookAt(cameraPart.Position, cameraPart.Position.add(worldDirection));
	}

	private fire(screenPosition: Vector2): void {
		const mountModel = this.mountModel;
		const camera = Workspace.CurrentCamera;
		if (mountModel === undefined || camera === undefined) {
			return;
		}

		const screenRay = camera.ScreenPointToRay(screenPosition.X, screenPosition.Y);
		const origin = screenRay.Origin;
		const direction = screenRay.Direction.mul(FIRE_RAY_DISTANCE);
		const raycastParams = new RaycastParams();
		raycastParams.FilterType = Enum.RaycastFilterType.Exclude;

		const filter = [mountModel];
		const boatModel = findBoatModel(mountModel);
		if (boatModel !== undefined) {
			filter.push(boatModel);
		}

		const character = Players.LocalPlayer.Character;
		if (character !== undefined) {
			filter.push(character);
		}

		raycastParams.FilterDescendantsInstances = filter;

		const hit = Workspace.Raycast(origin, direction, raycastParams);
		const targetPos = hit !== undefined ? hit.Position : origin.add(direction);
		clientEvents.fire("MountTrigger", targetPos);
	}
}

export const cannonMountController = new CannonMountController();
