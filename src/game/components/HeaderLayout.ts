import { Scene } from "phaser";
import { HEADER_CONFIG } from "../../config/GameConfig";

/** Shared helpers for header layout (normal + bonus). */

export function getHeaderLayoutWidth(scene: Scene): number {
	return Math.max(1, scene.scale.width * HEADER_CONFIG.HEADER_WIDTH_SCALE);
}

export function getHeaderLayoutHeight(scene: Scene): number {
	return Math.max(1, getHeaderLayoutWidth(scene) * HEADER_CONFIG.HEADER_LAYOUT_ASPECT_RATIO);
}

export function createScaledHeaderImage(
	scene: Scene,
	key: string,
	x: number,
	y: number
): Phaser.GameObjects.Image {
	const img = scene.add.image(x, y, key).setOrigin(0.5, 0);
	const scale = scene.scale.width / img.width;
	img.setScale(scale);
	return img;
}

