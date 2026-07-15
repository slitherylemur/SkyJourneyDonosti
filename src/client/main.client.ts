import { Players } from "@rbxts/services";
import { cannonMountController } from "client/cannonMountController";
import { registerMountController, startMountClient } from "client/mountClient";
import {
	REPLICATED_MOTION_TAG,
	MOTION_RIDER_TAG,
	startServerAuthorityReplicatedMotion,
} from "shared/serverAuthorityReplicatedMotion";
import { MOUNT_KIND_CANNON } from "shared/mountShared";
import { setModelPredictionMode, startTaggedPredictionMode } from "shared/simulationPrediction";
import { startTargeting } from "client/targeting";
import { initUi } from "client/ui/initUi";
import { startShipHealthBridge } from "client/ui/shipHealthBridge";
import { startShipDamageBridge } from "client/ui/shipDamageBridge";
import { startCannonPromptController } from "client/cannonPromptController";
import { startFirstPersonController } from "client/firstPersonController";
import { startProjectileSimulation } from "shared/projectileSimulation";

function bindCharacterPrediction(player: Player): void {
	if (player.Character !== undefined) {
		setModelPredictionMode(player.Character);
	}

	player.CharacterAdded.Connect((character) => {
		setModelPredictionMode(character);
	});
}

startTaggedPredictionMode(REPLICATED_MOTION_TAG);
startTaggedPredictionMode(MOTION_RIDER_TAG);
startServerAuthorityReplicatedMotion({ mode: "client" });
startProjectileSimulation({ mode: "client" });
startTargeting();
initUi();
startShipHealthBridge();
startShipDamageBridge();
startCannonPromptController();
startFirstPersonController();
startMountClient();
registerMountController(MOUNT_KIND_CANNON, cannonMountController);

for (const player of Players.GetPlayers()) {
	bindCharacterPrediction(player);
}

Players.PlayerAdded.Connect(bindCharacterPrediction);
