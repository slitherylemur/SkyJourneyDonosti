import React from "@rbxts/react";
import { ShipHealthBar } from "client/ui/components/ShipHealthBar";
import { TargetOverlay } from "client/ui/components/TargetOverlay";

export function App(): React.Element {
	return (
		<folder>
			<ShipHealthBar />
			<TargetOverlay />
		</folder>
	);
}
