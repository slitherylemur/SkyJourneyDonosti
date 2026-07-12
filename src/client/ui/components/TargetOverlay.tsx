import React, { useCallback } from "@rbxts/react";
import { HitPointTarget } from "client/ui/components/HitPointTarget";
import { uiStore, type UiState } from "client/ui/store";
import { useStoreSelector } from "client/ui/useStoreSelector";

export function TargetOverlay(): React.Element {
	const selectTargets = useCallback((state: UiState) => state.targets, []);
	const targets = useStoreSelector(uiStore, selectTargets);

	return (
		<folder>
			{targets.map((target) => (
				<HitPointTarget key={target.id} attachment={target.attachment} />
			))}
		</folder>
	);
}
