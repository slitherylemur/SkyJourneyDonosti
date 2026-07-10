import { Players } from "@rbxts/services";
import { REPLICATED_MOTION_TAG } from "shared/serverAuthorityReplicatedMotion";
import { setModelPredictionMode, startTaggedPredictionMode } from "shared/simulationPrediction";

function bindCharacterPrediction(player: Player): void {
	if (player.Character !== undefined) {
		setModelPredictionMode(player.Character);
	}

	player.CharacterAdded.Connect((character) => {
		setModelPredictionMode(character);
	});
}

startTaggedPredictionMode(REPLICATED_MOTION_TAG);

for (const player of Players.GetPlayers()) {
	bindCharacterPrediction(player);
}

Players.PlayerAdded.Connect(bindCharacterPrediction);
