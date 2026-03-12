import { Scene } from "phaser";

/**
 * Shared scaling helper for bottom cover overlays (normal_bg_cover, bonus_bg_cover).
 * Positions are handled by callers; this function only computes scale based on scene size.
 */
export function scaleBottomCoverImage(
	scene: Scene,
	image: Phaser.GameObjects.Image,
	coverHeightPercentOfScene: number,
	widthMultiplier: number,
	heightMultiplier: number,
): void {
	const width = scene.scale.width;
	const height = scene.scale.height;

	const pct = Phaser.Math.Clamp(coverHeightPercentOfScene, 0, 1);

	const baseScaleX = image.width ? width / image.width : 1;
	const baseScaleY = image.height ? (height * pct) / image.height : 1;

	const scaleX = baseScaleX * widthMultiplier;
	const scaleY = baseScaleY * heightMultiplier;

	image.setScale(scaleX, scaleY);
}

