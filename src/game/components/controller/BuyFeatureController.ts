/**
 * BuyFeatureController - Manages the Buy Feature button, purchase flow, and HUD locking.
 *
 * Owned by: SlotController (instantiated in constructor, held as `this.buyFeatureController`).
 * Called from: SlotController constructor wires callbacks; BuyFeature.ts triggers the purchase.
 *
 * Responsibilities:
 * - Creates the BuyFeature UI overlay via BuyFeature.create(scene).
 * - Tracks the buy-feature spin lock (buyFeatureSpinLock) that blocks normal spins during purchase.
 * - Locks/unlocks the full HUD during the buy-feature flow using coarse hooks
 *   (lockControlsForBuyFeatureFlow / unlockControlsAfterBuyFeatureFlow) provided by SlotController.
 *   Falls back to calling individual enable/disable callbacks if the coarse hooks are not provided.
 * - Exposes isSpinLocked() so SlotController.isBuyFeatureControlsLocked() can gate spin entry.
 *
 * Key flows:
 * - Buy Feature selected → lockControls() → GameAPI buys feature → result delivered as normal spin.
 * - Free spins from buy feature complete → unlockControls() is called when dialog closes.
 */
import type { Scene } from 'phaser';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { SpinDataUtils } from '../../../backend/SpinData';
import { BuyFeature } from '../BuyFeature';
import type { GameAPI } from '../../../backend/GameAPI';
import type { SlotController } from './SlotController';
import type { GameData } from '../GameData';
import { showBetFailurePopupFromError } from '../../../managers/PopupManager';

export interface BuyFeatureCallbacks {
  getGameData: () => GameData | null;
  getScene: () => Scene | null;
  getGameAPI: () => GameAPI | null;
  getBaseBetAmount: () => number;
  getBalanceAmount: () => number;
  startBalanceTween: (balance: number, durationMs?: number) => void;
  updateBetAmount: (bet: number) => void;
  setFeatureButtonAmountOverride: (amount: number | null) => void;
  enableSpinButton: () => void;
  enableAutoplayButton: () => void;
  enableFeatureButton: () => void;
  enableBetButtons: () => void;
  enableAmplifyButton: () => void;
  enableTurboButton: () => void;
  disableSpinButton: () => void;
  disableAutoplayButton: () => void;
  disableFeatureButton: () => void;
  disableBetButtons: () => void;
  disableAmplifyButton: () => void;
  disableTurboButton: () => void;
  enableBetBackgroundInteraction: (reason: string) => void;
  disableBetBackgroundInteraction: (reason: string) => void;
  showOutOfBalancePopup: () => void;
  restoreControlsAfterBuyFeatureFailure: (reason: string) => void;
  lockControlsForBuyFeatureFlow?: (reason: string) => void;
  unlockControlsAfterBuyFeatureFlow?: (reason: string) => void;
}

export class BuyFeatureController {
  private buyFeature: BuyFeature | null = null;
  private buyFeatureSpinLock: boolean = false;
  /** Prevents overlapping handleBuyFeature / doSpin calls from double-confirm. */
  private buyFeatureApiCallActive: boolean = false;
  private callbacks: BuyFeatureCallbacks;

  constructor(callbacks: BuyFeatureCallbacks) {
    this.callbacks = callbacks;
    this.buyFeature = new BuyFeature();
  }

  public setSlotController(slotController: SlotController): void {
    if (!this.buyFeature) return;
    this.buyFeature.setSlotController(slotController);
  }

  public create(scene: Scene): void {
    if (!this.buyFeature) return;
    this.buyFeature.create(scene);
  }

  public isSpinLocked(): boolean {
    return this.buyFeatureSpinLock;
  }

  public isDrawerVisible(): boolean {
    return !!this.buyFeature?.isDrawerVisible();
  }

  public setSpinLock(locked: boolean): void {
    this.buyFeatureSpinLock = locked;
  }

  public resetBetFromExternal(baseBet: number): void {
    if (!this.buyFeature) return;
    this.buyFeature.resetBetFromExternal(baseBet);
  }

  private lockControls(reason: string): void {
    if (this.callbacks.lockControlsForBuyFeatureFlow) {
      this.callbacks.lockControlsForBuyFeatureFlow(reason);
      return;
    }
    this.callbacks.disableSpinButton();
    this.callbacks.disableAutoplayButton();
    this.callbacks.disableFeatureButton();
    this.callbacks.disableBetButtons();
    this.callbacks.disableAmplifyButton();
    this.callbacks.disableTurboButton();
    this.callbacks.disableBetBackgroundInteraction(reason);
  }

  private unlockControls(reason: string): void {
    if (this.callbacks.unlockControlsAfterBuyFeatureFlow) {
      this.callbacks.unlockControlsAfterBuyFeatureFlow(reason);
      return;
    }
    this.callbacks.enableSpinButton();
    this.callbacks.enableAutoplayButton();
    this.callbacks.enableFeatureButton();
    this.callbacks.enableBetButtons();
    this.callbacks.enableAmplifyButton();
    this.callbacks.enableTurboButton();
    this.callbacks.enableBetBackgroundInteraction(reason);
  }

  /** Release buy-feature locks and restore HUD after a failed or aborted purchase (kobi_ass parity). */
  private releaseBuyFeatureFailureLock(reason: string): void {
    this.buyFeatureSpinLock = false;
    gameStateManager.isBuyFeatureSpin = false;
    this.callbacks.restoreControlsAfterBuyFeatureFailure(reason);
  }

  public showDrawer(options?: { onClose?: () => void; onConfirm?: () => void }): void {
    if (!this.buyFeature) {
      console.warn('[SlotController] Buy feature component not initialized');
      return;
    }

    this.buyFeature.show({
      featurePrice: 24000.0,
      onClose: () => {
        try { options?.onClose?.(); } catch {}
      },
      onConfirm: () => {
        try { options?.onConfirm?.(); } catch {}
        this.buyFeatureSpinLock = true;
        this.lockControls('buy feature confirmed');
        this.handleBuyFeature();
      }
    });
  }

  private async handleBuyFeature(): Promise<void> {
    if (this.buyFeatureApiCallActive) {
      console.warn('[BuyFeatureController] Buy feature API call already active - ignoring duplicate request');
      return;
    }

    const gameAPI = this.callbacks.getGameAPI();
    if (!this.buyFeature || !gameAPI) {
      console.error('[SlotController] Buy feature or GameAPI not available');
      this.releaseBuyFeatureFailureLock('buy feature unavailable');
      return;
    }

    this.buyFeatureApiCallActive = true;
    const originalBaseBet = this.callbacks.getBaseBetAmount();

    try {
      const buyFeatureBet = this.buyFeature.getCurrentBetAmount();
      const selectedBuyFeatureType = this.buyFeature.getSelectedBuyFeatureType();
      const buyFeat = selectedBuyFeatureType === 2 ? 2 : 1;
      const effectiveBet = buyFeat === 2 ? buyFeatureBet * 5 : buyFeatureBet;
      // Price is 100x the effective total bet (v.2 uses 5x bet).
      const calculatedPrice = effectiveBet * 100;

      const currentBalance = this.callbacks.getBalanceAmount();
      if (currentBalance < calculatedPrice) {
        console.error(`[SlotController] Insufficient balance: $${currentBalance.toFixed(2)} < $${calculatedPrice.toFixed(2)}`);
        this.releaseBuyFeatureFailureLock('buy feature insufficient balance');
        this.callbacks.showOutOfBalancePopup();
        return;
      }

      // Deduct buy-feature price only after a successful spin response (below).

      gameStateManager.isBuyFeatureSpin = true;
      gameStateManager.buyFeatureStartMultiplier = buyFeat === 2 ? 2 : 0;
      const spinData = await gameAPI.doSpin(
        // Backend applies buyFeat multiplier; send base bet to avoid double-multiplying.
        buyFeatureBet,
        true,
        false,
        false,
        buyFeat,
      );

      if (!spinData) {
        console.warn('[BuyFeatureController] No buy feature spin data received; unlocking controller');
        this.releaseBuyFeatureFailureLock('buy feature no spin data');
        return;
      }

      const balanceBeforeCharge = this.callbacks.getBalanceAmount();
      if (Number.isFinite(balanceBeforeCharge)) {
        const newBalance = Math.max(0, balanceBeforeCharge - calculatedPrice);
        if (gameAPI.getDemoState()) {
          gameAPI.updateDemoBalance(newBalance);
        }
        this.callbacks.startBalanceTween(newBalance, 200);
        console.log(
          `[BuyFeatureController] Buy feature balance deducted after spin OK: $${balanceBeforeCharge.toFixed(2)} -> $${newBalance.toFixed(2)}`
        );
      } else {
        console.warn('[BuyFeatureController] Skipping buy feature balance deduction: balance not readable');
      }

      // Only update bet / feature button after successful API response.
      // For v.2, persist base bet (not 5x effective) so option cards do not inflate after free spins.
      this.callbacks.updateBetAmount(buyFeatureBet);
      this.callbacks.setFeatureButtonAmountOverride(calculatedPrice);

      const hasFreeSpinItems = !!(spinData?.slot?.freespin?.items || spinData?.slot?.freeSpin?.items);
      const shouldKeepBuyFeatureFlag = hasFreeSpinItems || SpinDataUtils.hasFreeSpins(spinData);
      if (!shouldKeepBuyFeatureFlag) {
        gameStateManager.isBuyFeatureSpin = false;
      }

      try {
        if (hasFreeSpinItems) {
          const gd = this.callbacks.getGameData();
          if (gd) {
            const wasTurboGD = !!gd.isTurbo;
            const wasTurboGSM = !!gameStateManager.isTurbo;
            if (wasTurboGD || wasTurboGSM) {
              gd.isTurbo = false;
              gameStateManager.isTurbo = false;
              const scene = this.callbacks.getScene();
              if (scene) {
                scene.events.once('dialogAnimationsComplete', () => {
                  try {
                    if (wasTurboGD) {
                      gd.isTurbo = true;
                    }
                    if (wasTurboGSM) {
                      gameStateManager.isTurbo = true;
                    }
                  } catch (e) {
                    console.warn('[SlotController] Failed to restore turbo after dialogs:', e);
                  }
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('[SlotController] Turbo normalization for buy feature scatter failed:', e);
      }

      gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, { spinData });
      // Keep buyFeatureSpinLock until reels + scatter/bonus transition settle.
    } catch (error) {
      console.error('[SlotController] Error processing buy feature purchase:', error);
      this.callbacks.updateBetAmount(originalBaseBet);
      this.callbacks.setFeatureButtonAmountOverride(null);
      this.releaseBuyFeatureFailureLock('buy feature error');
      try {
        showBetFailurePopupFromError(error);
      } catch (popupErr) {
        console.error('[BuyFeatureController] showBetFailurePopupFromError threw:', popupErr);
      }
    } finally {
      this.buyFeatureApiCallActive = false;
    }
  }
}
