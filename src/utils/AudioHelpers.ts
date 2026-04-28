import type { Scene } from 'phaser';
import type { AudioManager, SoundEffectType } from '../managers/AudioManager';

/**
 * Resolve the active AudioManager for a scene.
 *
 * Prefers the per-scene instance attached as `scene.audioManager` (set up in
 * the Game scene during boot), and falls back to the global `window.audioManager`
 * for UI components that may run before the scene is fully wired (e.g. modal
 * popups created from outside the active scene).
 *
 * Returns `undefined` when no manager is available so callers can skip SFX
 * silently rather than throwing.
 */
export function getAudioManager(scene: Scene | null | undefined): AudioManager | undefined {
	if (scene) {
		const sceneAudio = (scene as any).audioManager as AudioManager | undefined;
		if (sceneAudio) return sceneAudio;
	}
	return (window as any).audioManager as AudioManager | undefined;
}

/**
 * Resolve the global AudioManager attached to `window`.
 *
 * Use this for hot paths and top-level callers where the per-scene instance
 * is not relevant — for example win-dialog SFX (the dialog is a long-lived
 * UI surface) and tween `onComplete` handlers that may outlive the original
 * scene. Prefer `getAudioManager(scene)` for UI components that have a
 * scene reference and want the per-scene instance when one is attached.
 */
export function getGlobalAudioManager(): AudioManager | undefined {
	return (window as any).audioManager as AudioManager | undefined;
}

/**
 * Play a one-shot sound effect through the resolved AudioManager.
 *
 * Safe to call without checking the manager or its method existence; this is
 * the right helper for UI button clicks and other "fire-and-forget" SFX.
 * For richer audio operations (`duckBackground`, music switches, etc.) use
 * `getAudioManager(scene)` directly so you can guard each method individually.
 */
export function playSoundEffectSafe(
	scene: Scene | null | undefined,
	effect: SoundEffectType
): void {
	const audioManager = getAudioManager(scene);
	if (audioManager && typeof audioManager.playSoundEffect === 'function') {
		audioManager.playSoundEffect(effect);
	}
}
