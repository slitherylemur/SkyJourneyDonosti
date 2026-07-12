import { Players } from "@rbxts/services";
import { cannonMountController } from "client/cannonMountController";
import { registerMountController, startMountClient } from "client/mountClient";
import { REPLICATED_MOTION_TAG } from "shared/serverAuthorityReplicatedMotion";
import { MOUNT_KIND_CANNON } from "shared/mountShared";
import { setModelPredictionMode, startTaggedPredictionMode } from "shared/simulationPrediction";
import { startTargeting } from "client/targeting";
import { initUi } from "client/ui/initUi";
import { startShipHealthBridge } from "client/ui/shipHealthBridge";

function bindCharacterPrediction(player: Player): void {
	if (player.Character !== undefined) {
		setModelPredictionMode(player.Character);
	}

	player.CharacterAdded.Connect((character) => {
		setModelPredictionMode(character);
	});
}

startTaggedPredictionMode(REPLICATED_MOTION_TAG);
startTargeting();
initUi();
startShipHealthBridge();
startMountClient();
registerMountController(MOUNT_KIND_CANNON, cannonMountController);

for (const player of Players.GetPlayers()) {
	bindCharacterPrediction(player);
}

Players.PlayerAdded.Connect(bindCharacterPrediction);
