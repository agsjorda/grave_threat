import type { Scene } from 'phaser';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { SpinDataUtils } from '../../../backend/SpinData';
import { BuyFeature } from '../BuyFeature';
import type { GameAPI } from '../../../backend/GameAPI';
import type { SlotController } from './SlotController';
import type { GameData } from '../GameData';

export interface BuyFeatureCallbacks {
  getGameData: () => GameData | null;
  getScene: () => Scene | null;
  getGameAPI: () => GameAPI | null;
  getBalanceAmount: () => number;
  updateBalanceAmount: (balance: number) => void;
  updateBetAmount: (bet: number) => void;
  setFeatureButtonAmountOverride: (amount: number | null) => void;
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
  updateSpinButtonState: () => void;
}

export class BuyFeatureController {
  private buyFeature: BuyFeature | null = null;
  private buyFeatureSpinLock: boolean = false;
  private callbacks: BuyFeatureCallbacks;

  constructor(callbacks: BuyFeatureCallbacks) {
    this.callbacks = callbacks;
    this.buyFeature = new BuyFeature();
  }

  public setSlotController(slotController: SlotController): void {
    if (!this.buyFeature) return;
    this.buyFeature.setSlotController(slotController);
  }

  public resetBetFromExternal(baseBet: number): void {
    if (!this.buyFeature) return;
    if (typeof this.buyFeature.resetBetFromExternal === 'function') {
      try {
        (this.buyFeature as any).resetBetFromExternal(baseBet);
      } catch (e) {
        console.warn('[BuyFeatureController] Failed to reset bet from external base bet:', e);
      }
    }
  }

  public create(scene: Scene): void {
    if (!this.buyFeature) return;
    this.buyFeature.create(scene);
  }

  public isSpinLocked(): boolean {
    return this.buyFeatureSpinLock;
  }

  public setSpinLock(locked: boolean): void {
    this.buyFeatureSpinLock = locked;
  }

  private lockControls(reason: string): void {
    this.callbacks.disableSpinButton();
    this.callbacks.disableAutoplayButton();
    this.callbacks.disableFeatureButton();
    this.callbacks.disableBetButtons();
    this.callbacks.disableAmplifyButton();
    this.callbacks.disableTurboButton();
    this.callbacks.disableBetBackgroundInteraction(reason);
  }

  private unlockControls(reason: string): void {
    this.callbacks.enableSpinButton();
    this.callbacks.enableAutoplayButton();
    this.callbacks.enableFeatureButton();
    this.callbacks.enableBetButtons();
    this.callbacks.enableAmplifyButton();
    this.callbacks.enableTurboButton();
    this.callbacks.enableBetBackgroundInteraction(reason);
  }

  public showDrawer(): void {
    if (!this.buyFeature) {
      console.warn('[SlotController] Buy feature component not initialized');
      return;
    }

    this.buyFeature.show({
      featurePrice: 24000.0,
      onClose: () => {
      },
      onConfirm: () => {
        this.buyFeatureSpinLock = true;
        this.lockControls('buy feature confirmed');
        this.handleBuyFeature();
      }
    });
  }

  private async handleBuyFeature(): Promise<void> {

    const gameAPI = this.callbacks.getGameAPI();
    if (!this.buyFeature || !gameAPI) {
      console.error('[SlotController] Buy feature or GameAPI not available');
      this.buyFeatureSpinLock = false;
      this.unlockControls('buy feature unavailable');
      return;
    }

    try {
      let shouldKeepBuyFeatureFlag = false;
      const buyFeatureBet = this.buyFeature.getCurrentBetAmount();
      const selectedBuyFeatureType = this.buyFeature.getSelectedBuyFeatureType();
      const buyFeat = selectedBuyFeatureType === 2 ? 2 : 1;
      const effectiveBet = buyFeat === 2 ? buyFeatureBet * 5 : buyFeatureBet;
      // Price is 100x the effective total bet (v.2 uses 5x bet).
      const calculatedPrice = effectiveBet * 100;

      // Keep the game's base bet aligned to the Buy Feature base bet selection.
      // For v.2, effective bet is 5x for pricing/spin logic, but persisting that as
      // base bet would inflate option cards after free spins (e.g. 40/200 -> 200/1000).
      this.callbacks.updateBetAmount(buyFeatureBet);
      // Keep Buy Feature button amount aligned with the confirmed option card amount
      // (v.2 should display 5x card price on the feature button after confirm).
      this.callbacks.setFeatureButtonAmountOverride(calculatedPrice);


      const currentBalance = this.callbacks.getBalanceAmount();
      if (currentBalance < calculatedPrice) {
        console.error(`[SlotController] Insufficient balance: $${currentBalance.toFixed(2)} < $${calculatedPrice.toFixed(2)}`);
        this.buyFeatureSpinLock = false;
        this.unlockControls('buy feature insufficient balance');
        this.callbacks.showOutOfBalancePopup();
        return;
      }

      const newBalance = currentBalance - calculatedPrice;
      if (gameAPI?.getDemoState()) {
        gameAPI.updateDemoBalance(newBalance);
      }
      this.callbacks.updateBalanceAmount(newBalance);

      // Avoid pre-spin symbol clearing; only run this on explicit skip to prevent flicker.

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

      const hasFreeSpinItems = !!(spinData?.slot?.freespin?.items || spinData?.slot?.freeSpin?.items);
      shouldKeepBuyFeatureFlag = hasFreeSpinItems || SpinDataUtils.hasFreeSpins(spinData);
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

      if (spinData) {
        gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, { spinData });
      }
    } catch (error) {
      console.error('[SlotController] Error processing buy feature purchase:', error);
      gameStateManager.isBuyFeatureSpin = false;
      this.buyFeatureSpinLock = false;
      this.unlockControls('buy feature error');
    }
  }
}
