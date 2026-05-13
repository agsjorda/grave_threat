/**
 * Shared balance rules for SlotController button/state decisions.
 * Keep all affordability math in one place to avoid drift across call sites.
 */

export const BALANCE_EPSILON = 1e-9;

/**
 * Computes the bet that will actually be charged for one spin.
 */
export function getRequiredSpinBet(baseBet: number, isEnhancedBet: boolean): number {
	if (!Number.isFinite(baseBet) || baseBet <= 0) {
		return 0;
	}
	return isEnhancedBet ? baseBet * 1.25 : baseBet;
}

/**
 * Numeric-safe affordability check. Equality is considered affordable.
 */
export function canAffordAmount(
	balance: number,
	requiredAmount: number,
	epsilon: number = BALANCE_EPSILON,
): boolean {
	if (!(requiredAmount > 0)) {
		return true;
	}
	if (!Number.isFinite(balance)) {
		return false;
	}
	return balance + epsilon >= requiredAmount;
}

/**
 * Spin-specific affordability wrapper used by spin button and spin entry checks.
 */
export function canAffordSpin(balance: number, baseBet: number, isEnhancedBet: boolean): boolean {
	const requiredBet = getRequiredSpinBet(baseBet, isEnhancedBet);
	return canAffordAmount(balance, requiredBet);
}

/**
 * Amplify should stay disabled when current/enhanced spin cost is not affordable.
 */
export function shouldDisableAmplifyForBalance(input: {
	balance: number;
	baseBet: number;
	isEnhancedBet: boolean;
}): boolean {
	const requiredCurrent = getRequiredSpinBet(input.baseBet, input.isEnhancedBet);
	const requiredIfAmplified = getRequiredSpinBet(input.baseBet, true);

	return (
		!canAffordAmount(input.balance, requiredCurrent) ||
		(!input.isEnhancedBet && !canAffordAmount(input.balance, requiredIfAmplified))
	);
}
