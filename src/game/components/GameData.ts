// BackendEvent import removed - no longer needed in this file

import { DROP_REEL_START_INTERVAL_RATIO, TIMING_CONFIG, ANIMATION_CONFIG } from '../../config/GameConfig';
import { Logger } from '../../utils/Logger';

/**
 * GameData - Holds runtime game state and timing configuration
 * 
 * Note: Most game state should use GameStateManager instead.
 * This class is primarily for animation timing and legacy compatibility.
 */
export class GameData {
	/** Default height for win-up animation (symbol hop before drop) */
	static WIN_UP_HEIGHT: number = 50;

	// Legacy state flags (prefer GameStateManager for new code)
	public isAutoPlaying: boolean = false;
	public isTurbo: boolean = false;
	public isReelSpinning: boolean = false;
	public isEnhancedBet: boolean = false;
	
	// Animation timing properties
	public winUpHeight: number = GameData.WIN_UP_HEIGHT;
	public winUpDuration: number = 0;
	public dropDuration: number = 0;
	public dropReelsDelay: number = 0;
	public dropReelsDuration: number = 0;
	public compressionDelayMultiplier: number = 1;
	
	// Tumble-specific timing controls
	public tumbleStaggerMs: number = TIMING_CONFIG.SYMBOL_STAGGER_MS * 2;
	public tumbleDropStaggerMs: number | null = null;
	public tumbleDropStartDelayMs: number = 0;
	public tumbleSkipPreHop: boolean = true;
	public tumbleOverlapDropsDuringCompression: boolean = true;
	/** Delay in ms before playing win animations on cluster win (then win anim → destroy → tumble). From GameConfig ANIMATION_CONFIG. */
	public clusterWinPreAnimDelayMs: number = ANIMATION_CONFIG.CLUSTER_WIN_PRE_ANIM_DELAY_MS;
	/** Time scale for symbol win animations (1 = normal, 0.5 = half speed). From GameConfig ANIMATION_CONFIG. */
	public symbolWinAnimTimeScale: number = ANIMATION_CONFIG.SYMBOL_WIN_ANIM_TIME_SCALE;
	/** Offset in ms to shift box_close SFX relative to the end of the cluster win animation (negative = earlier, positive = later). */
	public boxCloseOffsetMs: number = -600;

	public constructor() {
		setSpeed(this, 1.0);
	}
}

/** Global time multiplier for symbol drop and reset animations (< 1.0 = faster) */
export const DROP_RESET_TIME_MULTIPLIER: number = 0.8;

export function setSpeed(data: GameData, DELAY_BETWEEN_SPINS: number) {
	// Apply global multiplier to win-up (reset) and drop durations
	data.winUpDuration = DELAY_BETWEEN_SPINS * 0.1 * DROP_RESET_TIME_MULTIPLIER;
	data.dropDuration = DELAY_BETWEEN_SPINS * 0.4 * DROP_RESET_TIME_MULTIPLIER;
	data.dropReelsDelay = DELAY_BETWEEN_SPINS * DROP_REEL_START_INTERVAL_RATIO;
	data.dropReelsDuration = DELAY_BETWEEN_SPINS * 0.4 * DROP_RESET_TIME_MULTIPLIER;
}

/**
 * @deprecated Use GameStateManager.isReelSpinning instead
 */
export function gameSpin(data: GameData) {
	Logger.create('GameData').warn('gameSpin function is deprecated - use GameStateManager.isReelSpinning instead');
}