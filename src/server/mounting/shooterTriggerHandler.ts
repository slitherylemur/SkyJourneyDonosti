import type { EntityRef } from "@rbxts/ecs";
import { FireRequest, Shooter } from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import { registerMountTriggerHandler } from "server/mounting/mountServer";

function handleShooterTrigger(_player: Player, mountEntity: EntityRef, targetPos: Vector3): boolean {
	const ecs = getEcs();
	const shooter = ecs.getComponent(mountEntity, Shooter);
	if (shooter === undefined) {
		return false;
	}

	if (ecs.getComponent(mountEntity, FireRequest) !== undefined) {
		return true;
	}

	if (os.clock() - shooter.lastFiredAt < shooter.cooldownSeconds) {
		return true;
	}

	ecs.addComponent(mountEntity, FireRequest, { targetPos });
	return true;
}

export function registerShooterTriggerHandler(): void {
	registerMountTriggerHandler(handleShooterTrigger);
	print("[shooterTriggerHandler.ts] Registered shooter trigger handler");
}
