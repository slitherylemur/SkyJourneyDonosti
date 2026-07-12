import React, { useCallback, useEffect, useRef } from "@rbxts/react";
import { TweenService } from "@rbxts/services";
import { uiStore, type UiState } from "client/ui/store";
import { useStoreSelector } from "client/ui/useStoreSelector";

const RED = new Color3(1, 0.05, 0.05);
const WHITE = new Color3(1, 1, 1);

export function ShipDamageIndicator(): React.Element {
	const selectIndicator = useCallback((state: UiState) => state.damageIndicator, []);
	const indicator = useStoreSelector(uiStore, selectIndicator);
	const arrowRef = useRef<TextLabel>();
	const scaleRef = useRef<UIScale>();

	useEffect(() => {
		const arrow = arrowRef.current;
		const scale = scaleRef.current;
		if (indicator === undefined || arrow === undefined || scale === undefined) {
			return;
		}

		arrow.TextTransparency = 0;
		arrow.TextColor3 = RED;
		scale.Scale = 0.65;
		const impact = TweenService.Create(scale, new TweenInfo(0.1, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
			Scale: 1.25,
		});
		const settle = TweenService.Create(scale, new TweenInfo(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
			Scale: 1,
		});
		const whiteFlash = TweenService.Create(arrow, new TweenInfo(0.09), { TextColor3: WHITE });
		const redFlash = TweenService.Create(arrow, new TweenInfo(0.11), { TextColor3: RED });
		const fade = TweenService.Create(arrow, new TweenInfo(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
			TextTransparency: 1,
		});
		impact.Completed.Once(() => settle.Play());
		whiteFlash.Completed.Once(() => redFlash.Play());
		redFlash.Completed.Once(() =>
			task.delay(0.3, () => {
				if (uiStore.get().damageIndicator?.sequence === indicator.sequence) {
					fade.Play();
				}
			}),
		);
		impact.Play();
		whiteFlash.Play();

		return () => {
			impact.Cancel();
			settle.Cancel();
			whiteFlash.Cancel();
			redFlash.Cancel();
			fade.Cancel();
		};
	}, [indicator?.sequence]);

	const position = indicator?.position ?? Vector2.zero;
	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset={true} DisplayOrder={20}>
			<textlabel
				ref={arrowRef}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromOffset(position.X, position.Y)}
				Size={new UDim2(0, 76, 0, 76)}
				Rotation={indicator?.rotation ?? 0}
				BackgroundTransparency={1}
				Font={Enum.Font.GothamBold}
				Text={"\u{25B6}"}
				TextColor3={RED}
				TextScaled={true}
				TextTransparency={1}
				TextStrokeColor3={new Color3(0.1, 0, 0)}
				TextStrokeTransparency={0.25}
			>
				<uiscale ref={scaleRef} />
			</textlabel>
		</screengui>
	);
}
