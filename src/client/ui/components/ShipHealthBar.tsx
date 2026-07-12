import React, { useCallback, useEffect, useRef } from "@rbxts/react";
import { TweenService } from "@rbxts/services";
import { uiStore, type UiState } from "client/ui/store";
import { useStoreSelector } from "client/ui/useStoreSelector";

const NORMAL_SIZE = new UDim2(0.25, 0, 0, 20);
const IMPACT_SIZE = new UDim2(0.27, 0, 0, 22);

export function ShipHealthBar(): React.Element {
	const selectHealth = useCallback((state: UiState) => state.shipHealth, []);
	const health = useStoreSelector(uiStore, selectHealth);
	const containerRef = useRef<Frame>();
	const fillRef = useRef<Frame>();
	const previousHealth = useRef(health.current);
	const fraction = math.clamp(health.current / math.max(health.max, 1), 0, 1);
	const steadyColor = Color3.fromHSV(0.33 * fraction, 0.9, 0.8);

	useEffect(() => {
		const previous = previousHealth.current;
		previousHealth.current = health.current;
		if (health.current >= previous) {
			return;
		}

		const fill = fillRef.current;
		if (fill !== undefined) {
			fill.BackgroundColor3 = new Color3(1, 0.1, 0.1);
			TweenService.Create(
				fill,
				new TweenInfo(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
				{ BackgroundColor3: steadyColor },
			).Play();
		}

		const container = containerRef.current;
		if (container !== undefined) {
			const outward = TweenService.Create(
				container,
				new TweenInfo(0.08, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
				{ Size: IMPACT_SIZE },
			);
			const inward = TweenService.Create(
				container,
				new TweenInfo(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
				{ Size: NORMAL_SIZE },
			);
			outward.Completed.Once(() => inward.Play());
			outward.Play();
		}
	}, [health.current]);

	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset={false}>
			<frame
				ref={containerRef}
				AnchorPoint={new Vector2(0.5, 0)}
				Position={new UDim2(0.5, 0, 0, 12)}
				Size={NORMAL_SIZE}
				BackgroundColor3={new Color3(0.08, 0.08, 0.08)}
				BorderSizePixel={0}
			>
				<uicorner CornerRadius={new UDim(0, 6)} />
				<frame
					ref={fillRef}
					Size={UDim2.fromScale(fraction, 1)}
					BackgroundColor3={steadyColor}
					BorderSizePixel={0}
				>
					<uicorner CornerRadius={new UDim(0, 6)} />
				</frame>
			</frame>
		</screengui>
	);
}
