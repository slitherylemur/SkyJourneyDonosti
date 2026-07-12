import { CollectionService, RunService, Workspace } from "@rbxts/services";
import { uiStore } from "client/ui/store";
import { isWithinAimLimits } from "shared/aimLimits";
import {
	HIT_POINT_ID_ATTR,
	HIT_POINT_TAG,
	HIT_POINT_TEAM_ATTR,
	TARGET_UI_PIXEL_SIZE,
} from "shared/hitPointShared";
import { CANNON_AI_MAX_RANGE } from "shared/mountShared";

const taggedHitPoints = new Set<Attachment>();
let activeMount: Model | undefined;
let elapsed = 0;
let started = false;

function addTagged(instance: Instance): void {
	if (instance.IsA("Attachment")) {
		taggedHitPoints.add(instance);
	}
}

function refreshTargets(): void {
	const mount = activeMount;
	if (mount === undefined || !mount.IsDescendantOf(game)) {
		uiStore.set({ targets: [] });
		return;
	}

	const origin = mount.GetPivot().Position;
	const targets = new Array<{ id: string; attachment: Attachment }>();
	for (const attachment of taggedHitPoints) {
		if (
			!attachment.IsDescendantOf(Workspace) ||
			attachment.GetAttribute(HIT_POINT_TEAM_ATTR) !== "enemy" ||
			attachment.WorldPosition.sub(origin).Magnitude > CANNON_AI_MAX_RANGE ||
			!isWithinAimLimits(mount, attachment.WorldPosition)
		) {
			continue;
		}

		const id = attachment.GetAttribute(HIT_POINT_ID_ATTR);
		if (typeIs(id, "string")) {
			targets.push({ id, attachment });
		}
	}
	uiStore.set({ targets });
}

export function startTargeting(): void {
	if (started) {
		return;
	}
	started = true;

	for (const instance of CollectionService.GetTagged(HIT_POINT_TAG)) {
		addTagged(instance);
	}
	CollectionService.GetInstanceAddedSignal(HIT_POINT_TAG).Connect(addTagged);
	CollectionService.GetInstanceRemovedSignal(HIT_POINT_TAG).Connect((instance) => {
		if (instance.IsA("Attachment")) {
			taggedHitPoints.delete(instance);
			refreshTargets();
		}
	});
	RunService.Heartbeat.Connect((dt) => {
		elapsed += dt;
		if (elapsed >= 0.1) {
			elapsed = 0;
			refreshTargets();
		}
	});
}

export function setTargetingMount(mount: Model | undefined): void {
	activeMount = mount;
	refreshTargets();
}

export function resolveClickTarget(screenPosition: Vector2): string | undefined {
	const camera = Workspace.CurrentCamera;
	if (camera === undefined) {
		return undefined;
	}

	let nearestId: string | undefined;
	let nearestDistance = math.huge;
	for (const target of uiStore.get().targets) {
		const [point, onScreen] = camera.WorldToViewportPoint(target.attachment.WorldPosition);
		if (!onScreen) {
			continue;
		}
		const distance = screenPosition.sub(new Vector2(point.X, point.Y)).Magnitude;
		if (distance <= TARGET_UI_PIXEL_SIZE / 2 && distance < nearestDistance) {
			nearestDistance = distance;
			nearestId = target.id;
		}
	}
	return nearestId;
}

export function getTargetAttachment(id: string): Attachment | undefined {
	return uiStore.get().targets.find((target) => target.id === id)?.attachment;
}
