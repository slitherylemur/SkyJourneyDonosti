import React from "@rbxts/react";
import { ShipHealthBar } from "client/ui/components/ShipHealthBar";
import { TargetOverlay } from "client/ui/components/TargetOverlay";
import { ShipDamageIndicator } from "client/ui/components/ShipDamageIndicator";

export function App(): React.Element {
	return (
		<folder>
			<ShipHealthBar />
			<TargetOverlay />
			<ShipDamageIndicator />
		</folder>
	);
}
