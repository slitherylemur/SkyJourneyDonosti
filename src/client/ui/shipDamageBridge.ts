import { Workspace } from "@rbxts/services";
import { uiStore } from "client/ui/store";
import { clientEvents } from "shared/network";

function getEdgePlacement(camera: Camera, hitPosition: Vector3, viewportPoint: Vector3) {
	const viewport = camera.ViewportSize;
	const center = viewport.mul(0.5);
	let offset: Vector2;
	if (viewportPoint.Z > 0) {
		offset = new Vector2(viewportPoint.X, viewportPoint.Y).sub(center);
	} else {
		// Behind-camera projection is mirrored. Camera-space X/Y preserves which
		// way the player should turn while still allowing continuous edge placement.
		const localPosition = camera.CFrame.PointToObjectSpace(hitPosition);
		offset = new Vector2(localPosition.X, -localPosition.Y);
	}
	if (offset.Magnitude < 0.001) {
		offset = new Vector2(0, 1);
	}

	const direction = offset.Unit;
	const halfWidth = math.max(center.X - 44, 1);
	const halfHeight = math.max(center.Y - 44, 1);
	const xDistance = math.abs(direction.X) > 0.0001 ? halfWidth / math.abs(direction.X) : math.huge;
	const yDistance = math.abs(direction.Y) > 0.0001 ? halfHeight / math.abs(direction.Y) : math.huge;
	const position = center.add(direction.mul(math.min(xDistance, yDistance)));
	return {
		position,
		rotation: math.deg(math.atan2(direction.Y, direction.X)),
	};
}

export function startShipDamageBridge(): void {
	let sequence = 0;
	clientEvents.on("ShipDamage", (attackerPosition) => {
		const camera = Workspace.CurrentCamera;
		if (camera === undefined) {
			return;
		}

		const [viewportPoint, onScreen] = camera.WorldToViewportPoint(attackerPosition);
		if (onScreen && viewportPoint.Z > 0) {
			return;
		}

		sequence += 1;
		const placement = getEdgePlacement(camera, attackerPosition, viewportPoint);
		uiStore.set({
			damageIndicator: {
				position: placement.position,
				rotation: placement.rotation,
				sequence,
			},
		});
	});
}
