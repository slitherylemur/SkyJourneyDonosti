import React from "@rbxts/react";
import { TARGET_UI_PIXEL_SIZE } from "shared/hitPointShared";

interface HitPointTargetProps {
	attachment: Attachment;
}

export function HitPointTarget({ attachment }: HitPointTargetProps): React.Element {
	return (
		<billboardgui
			Adornee={attachment}
			AlwaysOnTop={true}
			LightInfluence={0}
			Size={UDim2.fromOffset(TARGET_UI_PIXEL_SIZE, TARGET_UI_PIXEL_SIZE)}
		>
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)}>
				<uicorner CornerRadius={new UDim(1, 0)} />
				<uistroke Color={new Color3(1, 0.1, 0.1)} Thickness={2} />
			</frame>
		</billboardgui>
	);
}
