import { Players } from "@rbxts/services";

const localPlayer = Players.LocalPlayer;

function enforceFirstPerson(): void {
	if (localPlayer.CameraMode !== Enum.CameraMode.LockFirstPerson) {
		localPlayer.CameraMode = Enum.CameraMode.LockFirstPerson;
	}
}

export function startFirstPersonController(): void {
	enforceFirstPerson();
	localPlayer.GetPropertyChangedSignal("CameraMode").Connect(enforceFirstPerson);
}
