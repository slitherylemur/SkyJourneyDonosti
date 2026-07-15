import type { MountController } from "client/mountController";
import { Players, RunService, UserInputService, Workspace } from "@rbxts/services";
import { TweenService } from "@rbxts/services";
import { getAimLimits } from "shared/aimLimits";
import { setLocalProjectileFire } from "shared/projectileInput";
import { setProjectileSimulationMount } from "shared/projectileSimulation";
import { getTargetAttachment, resolveClickTarget, setTargetingMount } from "client/targeting";
import { uiStore } from "client/ui/store";

const AIM_SENSITIVITY = 0.005;
const FIRE_RAY_DISTANCE = 1000;
/** Maximum camera drift away from the player's aim toward the selected target. */
const CAMERA_ASSIST_YAW_LIMIT = math.rad(12);
const CAMERA_ASSIST_PITCH_LIMIT = math.rad(4);
/** Exponential move speed; approximately three times slower than the previous value of 5. */
const CAMERA_ASSIST_SPEED = 5 / 3;
const MOUNTED_FOV_INCREASE = 15;
const FOV_TWEEN_INFO = new TweenInfo(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out);

function directionFromAngles(basePart: BasePart, yaw: number, pitch: number): Vector3 {
	const localDirection = new Vector3(
		math.sin(yaw) * math.cos(pitch),
		math.sin(pitch),
		math.cos(yaw) * math.cos(pitch),
	);
	return basePart.CFrame.VectorToWorldSpace(localDirection).Unit;
}

function anglesFromWorldPosition(
	basePart: BasePart,
	origin: Vector3,
	worldPosition: Vector3,
): [number, number] | undefined {
	const offset = worldPosition.sub(origin);
	if (offset.Magnitude < 0.001) {
		return undefined;
	}
	const localDirection = basePart.CFrame.VectorToObjectSpace(offset.Unit);
	return [math.atan2(localDirection.X, localDirection.Z), math.asin(math.clamp(localDirection.Y, -1, 1))];
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
	private cameraYaw = 0;
	private cameraPitch = 0;
	private originalFov?: number;
	private renderConnection?: RBXScriptConnection;
	private lookConnection?: RBXScriptConnection;
	private fireConnection?: RBXScriptConnection;
	private fireReleaseConnection?: RBXScriptConnection;

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
		setProjectileSimulationMount(Players.LocalPlayer, mountModel);
		this.cameraPart = cameraPart;
		this.basePart = basePart;
		this.yaw = 0;
		this.pitch = 0;
		this.cameraYaw = 0;
		this.cameraPitch = 0;
		setTargetingMount(mountModel);

		const camera = Workspace.CurrentCamera;
		if (camera !== undefined) {
			camera.CameraType = Enum.CameraType.Scriptable;
			this.originalFov = camera.FieldOfView;
			TweenService.Create(camera, FOV_TWEEN_INFO, {
				FieldOfView: camera.FieldOfView + MOUNTED_FOV_INCREASE,
			}).Play();
		}

		UserInputService.MouseBehavior = Enum.MouseBehavior.Default;

		this.renderConnection = RunService.RenderStepped.Connect((dt) => {
			this.updateCamera(dt);
		});

		this.lookConnection = UserInputService.InputChanged.Connect((input) => {
			if (
				input.UserInputType === Enum.UserInputType.MouseMovement ||
				input.UserInputType === Enum.UserInputType.Touch
			) {
				this.yaw -= input.Delta.X * AIM_SENSITIVITY;
				this.pitch -= input.Delta.Y * AIM_SENSITIVITY;
			}
		});

		this.fireConnection = UserInputService.InputBegan.Connect((input, gameProcessed) => {
			if (gameProcessed) {
				return;
			}

			if (input.UserInputType === Enum.UserInputType.MouseButton1) {
				this.fire(UserInputService.GetMouseLocation(), false);
			} else if (input.UserInputType === Enum.UserInputType.Touch) {
				this.fire(new Vector2(input.Position.X, input.Position.Y), true);
			}
		});

		this.fireReleaseConnection = UserInputService.InputEnded.Connect((input) => {
			if (
				input.UserInputType === Enum.UserInputType.MouseButton1 ||
				input.UserInputType === Enum.UserInputType.Touch
			) {
				setLocalProjectileFire(Vector3.zero, false, false);
			}
		});
	}

	public exit(): void {
		this.renderConnection?.Disconnect();
		this.lookConnection?.Disconnect();
		this.fireConnection?.Disconnect();
		this.fireReleaseConnection?.Disconnect();
		this.renderConnection = undefined;
		this.lookConnection = undefined;
		this.fireConnection = undefined;
		this.fireReleaseConnection = undefined;
		setLocalProjectileFire(Vector3.zero, false, false);
		setProjectileSimulationMount(Players.LocalPlayer, undefined);

		const camera = Workspace.CurrentCamera;
		if (camera !== undefined) {
			camera.CameraType = Enum.CameraType.Custom;
			if (this.originalFov !== undefined) {
				TweenService.Create(camera, FOV_TWEEN_INFO, { FieldOfView: this.originalFov }).Play();
			}
		}
		this.originalFov = undefined;

		UserInputService.MouseBehavior = Enum.MouseBehavior.Default;
		this.mountModel = undefined;
		this.cameraPart = undefined;
		this.basePart = undefined;
		setTargetingMount(undefined);
	}

	private updateCamera(dt: number): void {
		const cameraPart = this.cameraPart;
		const basePart = this.basePart;
		const mountModel = this.mountModel;
		const camera = Workspace.CurrentCamera;
		if (cameraPart === undefined || basePart === undefined || mountModel === undefined || camera === undefined) {
			return;
		}

		const limits = getAimLimits(mountModel);
		const aimYaw = math.clamp(this.yaw, -limits.yawLimit, limits.yawLimit);
		const aimPitch = math.clamp(this.pitch, limits.pitchMin, limits.pitchMax);

		const targetAngles = this.findNearestTargetAngles(basePart, cameraPart.Position);
		const assistedYaw = math.clamp(
			targetAngles?.[0] ?? aimYaw,
			aimYaw - CAMERA_ASSIST_YAW_LIMIT,
			aimYaw + CAMERA_ASSIST_YAW_LIMIT,
		);
		const assistedPitch = math.clamp(
			targetAngles?.[1] ?? aimPitch,
			aimPitch - CAMERA_ASSIST_PITCH_LIMIT,
			aimPitch + CAMERA_ASSIST_PITCH_LIMIT,
		);
		const desiredYaw = math.clamp(assistedYaw, -limits.yawLimit, limits.yawLimit);
		const desiredPitch = math.clamp(assistedPitch, limits.pitchMin, limits.pitchMax);

		const alpha = 1 - math.exp(-CAMERA_ASSIST_SPEED * dt);
		const yawDelta = math.atan2(math.sin(desiredYaw - this.cameraYaw), math.cos(desiredYaw - this.cameraYaw));
		this.cameraYaw += yawDelta * alpha;
		this.cameraPitch += (desiredPitch - this.cameraPitch) * alpha;

		const worldDirection = directionFromAngles(basePart, this.cameraYaw, this.cameraPitch);
		camera.CFrame = CFrame.lookAt(cameraPart.Position, cameraPart.Position.add(worldDirection));
	}

	/** Returns the cannon-local angles of the closest eligible hit marker. */
	private findNearestTargetAngles(basePart: BasePart, origin: Vector3): [number, number] | undefined {
		let bestAngles: [number, number] | undefined;
		let bestWorldDistance = math.huge;

		for (const target of uiStore.get().targets) {
			const angles = anglesFromWorldPosition(basePart, origin, target.attachment.WorldPosition);
			if (angles === undefined) {
				continue;
			}

			const worldDistance = target.attachment.WorldPosition.sub(origin).Magnitude;
			if (worldDistance < bestWorldDistance) {
				bestWorldDistance = worldDistance;
				bestAngles = angles;
			}
		}
		return bestAngles;
	}

	private fire(screenPosition: Vector2, includeGuiInset: boolean): void {
		const mountModel = this.mountModel;
		const camera = Workspace.CurrentCamera;
		if (mountModel === undefined || camera === undefined) {
			return;
		}

		let targeted = false;
		let targetPos: Vector3 | undefined;
		const hitPointId = resolveClickTarget(screenPosition, includeGuiInset);
		if (hitPointId !== undefined) {
			const attachment = getTargetAttachment(hitPointId);
			if (attachment !== undefined) {
				targetPos = attachment.WorldPosition;
				targeted = true;
			}
		}

		if (targetPos === undefined) {
			const screenRay = camera.ScreenPointToRay(screenPosition.X, screenPosition.Y);
			const origin = screenRay.Origin;
			const rayDirection = screenRay.Direction.mul(FIRE_RAY_DISTANCE);
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

			const hit = Workspace.Raycast(origin, rayDirection, raycastParams);
			targetPos = hit !== undefined ? hit.Position : origin.add(rayDirection);
		}

		const basePart = this.basePart;
		if (basePart === undefined) {
			return;
		}
		const direction = targetPos.sub(basePart.Position);
		if (direction.Magnitude > 0.001) {
			setLocalProjectileFire(direction.Unit, targeted, true);
		}
	}
}

export const cannonMountController = new CannonMountController();
