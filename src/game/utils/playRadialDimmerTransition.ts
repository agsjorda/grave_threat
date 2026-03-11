import { Scene } from 'phaser';
import { RadialDimmerTransition } from '../components/RadialDimmerTransition';

/**
 * Play a radial dimmer transition (black overlay with shrinking circular hole), then call onComplete.
 * Used e.g. from Preloader to transition into the Game scene.
 * Plays whistle_BB.ogg at the start of the transition when available.
 */
export function playRadialDimmerTransition(scene: Scene, onComplete: () => void): void {
	// Play whistle SFX at transition start (asset key 'whistle' – e.g. whistle_BB.ogg)
	try {
		if (scene.cache.audio.exists('whistle')) {
			scene.sound.play('whistle', { volume: 0.55 });
		}
	} catch (_) {}

	const dimmer = new RadialDimmerTransition(scene);
	const centerX = scene.scale.width * 0.5;
	const centerY = scene.scale.height * 0.5;
	const startRadius = Math.ceil(Math.hypot(scene.scale.width, scene.scale.height));
	const endRadius = 0;
	const durationMs = 1200;
	dimmer.setCenter(centerX, centerY);
	dimmer.setRadiusImmediate(startRadius);
	dimmer.show();
	dimmer.zoomInToRadius(endRadius, durationMs);
	scene.time.delayedCall(durationMs, () => {
		dimmer.hide();
		onComplete();
	});
}
