/**
 * Controller Module - Barrel Export
 *
 * This module contains refactored controller components extracted from SlotController.ts.
 * Import from this file to access controller functionality.
 *
 * Controller ownership hierarchy:
 *   SlotController            ← main orchestrator; owns all controllers below
 *   ├── AutoplayController    ← base-game autoplay counter, timer, UI (stop icon, spins text)
 *   ├── BetController         ← bet level cycling, bet display (+/- buttons, bet text)
 *   ├── SpinButtonController  ← spin button creation and spin icon animation
 *   ├── BuyFeatureController  ← buy feature purchase flow and HUD locking during it
 *   ├── AmplifyBetController  ← amplify/enhanced bet toggle button
 *   ├── TurboButtonController ← turbo toggle button
 *   ├── MenuButtonController  ← settings menu button (opens Menu drawer)
 *   └── BalanceController     ← balance display and balance API call after each spin
 *
 * Bonus autoplay (free spins) is handled by FreeSpinController inside Symbols.ts,
 * NOT by AutoplayController. FreeSpinController emits FREE_SPIN_AUTOPLAY which
 * SlotController.startFreeRoundAutoplay() listens to.
 *
 * @example
 * import { BetController, AutoplayController, SpinButtonController } from './controller';
 */

// Controllers
export { BetController } from './BetController';
export type { BetDisplayConfig, BetControllerCallbacks } from './BetController';
export { BET_LEVELS, DEFAULT_BASE_BET, DEFAULT_BET_LEVEL_INDEX, cloneBetLevels, getClosestNumberIndex } from './BetController';

export { AutoplayController } from './AutoplayController';
export type { AutoplayCallbacks } from './AutoplayController';

export { HudController } from './HudController';
export type { HudControllerCallbacks } from './HudController';

export { SpinButtonController } from './SpinButtonController';
export type { SpinButtonCallbacks } from './SpinButtonController';

export { AmplifyBetController } from './AmplifyBetController';
export { TurboButtonController } from './TurboButtonController';
export { MenuButtonController } from './MenuButtonController';
export { BuyFeatureController } from './BuyFeatureController';
export type { BuyFeatureCallbacks } from './BuyFeatureController';
export { BalanceController } from './BalanceController';
export type { BalanceControllerCallbacks } from './BalanceController';
export { BALANCE_EPSILON, canAffordAmount, canAffordSpin, getRequiredSpinBet, shouldDisableAmplifyForBalance } from './BalanceRules';
