/**
 * Turbo Configuration - Centralized turbo settings
 *
 * Change values here to affect all turbo-affected functions across the codebase.
 *
 * USAGE EXAMPLES:
 * - To make turbo 2x faster: change TURBO_SPEED_MULTIPLIER to 0.5
 * - To disable turbo: change TURBO_SPEED_MULTIPLIER to 1.0
 *
 * AFFECTED: SlotController, Backend, Symbols, win animation timing, etc.
 */

export class TurboConfig {
    public static readonly TURBO_SPEED_MULTIPLIER: number = 0.7;
    public static readonly TURBO_DELAY_MULTIPLIER: number = 0.7;
    public static readonly TURBO_DURATION_MULTIPLIER: number = 0.7;
    public static readonly WINLINE_ANIMATION_SPEED_MULTIPLIER: number = 4.0;

    public static getMultiplier(isTurbo: boolean): number {
        return isTurbo ? this.TURBO_SPEED_MULTIPLIER : 1.0;
    }

    public static getDelayMultiplier(isTurbo: boolean): number {
        return isTurbo ? this.TURBO_DELAY_MULTIPLIER : 1.0;
    }

    public static getDurationMultiplier(isTurbo: boolean): number {
        return isTurbo ? this.TURBO_DURATION_MULTIPLIER : 1.0;
    }

    public static applyTurboSpeed(value: number, isTurbo: boolean): number {
        return value * this.getMultiplier(isTurbo);
    }

    public static applyTurboDelay(value: number, isTurbo: boolean): number {
        return value * this.getDelayMultiplier(isTurbo);
    }

    public static applyTurboDuration(value: number, isTurbo: boolean): number {
        return value * this.getDurationMultiplier(isTurbo);
    }
}
