import type { Scene } from 'phaser';
import type { GameAPI } from '../../../backend/GameAPI';
import type { GameData } from '../GameData';
import { CurrencyManager } from '../CurrencyManager';
import { formatCurrencyNumber } from '../../../utils/NumberPrecisionFormatter';

export interface BalanceControllerCallbacks {
  getScene: () => Scene | null;
  getGameAPI: () => GameAPI | null;
  getGameData: () => GameData | null;
  getBaseBetAmount: () => number;
  updateBetAmount: (bet: number) => void;
  showOutOfBalancePopup: () => void;
}

export class BalanceController {
  private static readonly BALANCE_PENDING_TEXT = '-';
  private controllerContainer: Phaser.GameObjects.Container;
  private callbacks: BalanceControllerCallbacks;
  private balanceLabelText!: Phaser.GameObjects.Text;
  private balanceAmountText!: Phaser.GameObjects.Text;
  private pendingBalanceUpdate: { balance: number; bet: number; winnings?: number } | null = null;
  private isBalanceInitialized: boolean = false;
  private balanceTween: Phaser.Tweens.Tween | null = null;
  private balanceAnimationInProgress: boolean = false;
  private pendingServerBalanceForReconcile: number | null = null;
  private activeBalanceTweenTarget: number | null = null;

  constructor(
    controllerContainer: Phaser.GameObjects.Container,
    callbacks: BalanceControllerCallbacks
  ) {
    this.controllerContainer = controllerContainer;
    this.callbacks = callbacks;
  }

  public createBalanceDisplay(scene: Scene): void {
    const balanceX = scene.scale.width * 0.19;
    const balanceY = scene.scale.height * 0.724;
    const containerWidth = 125;
    const containerHeight = 55;
    const cornerRadius = 10;
    const isDemoBalance = this.callbacks.getGameAPI()?.getDemoState();

    const balanceBg = scene.add.graphics();
    balanceBg.fillStyle(0x000000, 0.65);
    balanceBg.fillRoundedRect(
      balanceX - containerWidth / 2,
      balanceY - containerHeight / 2,
      containerWidth,
      containerHeight,
      cornerRadius
    );
    balanceBg.setDepth(8);
    this.controllerContainer.add(balanceBg);

    const currencyCode = isDemoBalance ? '' : CurrencyManager.getCurrencyCode();
    const balanceLabelString = currencyCode ? `BALANCE (${currencyCode})` : 'BALANCE';
    this.balanceLabelText = scene.add.text(
      balanceX,
      balanceY - 8,
      balanceLabelString,
      {
        fontSize: '12px',
        color: '#00ff00',
        fontFamily: 'poppins-bold'
      }
    ).setOrigin(0.5, 0.5).setDepth(9);
    this.controllerContainer.add(this.balanceLabelText);

    this.balanceAmountText = scene.add.text(
      balanceX,
      balanceY + 8,
      BalanceController.BALANCE_PENDING_TEXT,
      {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'poppins-bold'
      }
    ).setOrigin(0.5, 0.5).setDepth(9);
    this.controllerContainer.add(this.balanceAmountText);
  }

  public updateBalanceAmount(balanceAmount: number): void {
    if (this.balanceAmountText) {
      if (!Number.isFinite(balanceAmount)) {
        this.balanceAmountText.setText(BalanceController.BALANCE_PENDING_TEXT);
        return;
      }
      this.balanceAmountText.setText(formatCurrencyNumber(balanceAmount));
      this.isBalanceInitialized = true;
    }
  }

  public hasInitializedBalance(): boolean {
    return this.isBalanceInitialized;
  }

  public startBalanceTween(targetBalance: number, durationMs: number = 220): void {
    if (!Number.isFinite(targetBalance)) return;
    const scene = this.callbacks.getScene();
    if (!scene || !this.balanceAmountText) {
      this.updateBalanceAmount(targetBalance);
      return;
    }
    const current = this.getBalanceAmount();
    const from = Number.isFinite(current) ? current : targetBalance;
    if (Math.abs(from - targetBalance) < 0.0001) {
      this.updateBalanceAmount(targetBalance);
      return;
    }

    try { this.balanceTween?.stop(); } catch { }
    this.activeBalanceTweenTarget = targetBalance;
    const proxy = { value: from };
    this.balanceAnimationInProgress = true;
    this.balanceTween = scene.tweens.add({
      targets: proxy,
      value: targetBalance,
      duration: durationMs,
      ease: 'Cubic.Out',
      onUpdate: () => {
        if (this.balanceAmountText) {
          this.balanceAmountText.setText(formatCurrencyNumber(proxy.value));
          this.isBalanceInitialized = true;
        }
      },
      onComplete: () => {
        this.balanceAnimationInProgress = false;
        this.balanceTween = null;
        this.activeBalanceTweenTarget = null;
        this.updateBalanceAmount(targetBalance);
        const deferred = this.pendingServerBalanceForReconcile;
        this.pendingServerBalanceForReconcile = null;
        if (Number.isFinite(deferred)) this.startBalanceTween(Number(deferred), 200);
      },
      onStop: () => {
        this.balanceAnimationInProgress = false;
        this.balanceTween = null;
        this.activeBalanceTweenTarget = null;
      }
    });
  }

  public finalizeBalanceTweenBeforeSpin(): void {
    if (!this.balanceAnimationInProgress) return;
    const target = this.activeBalanceTweenTarget;
    try { this.balanceTween?.stop(); } catch { }
    this.balanceTween = null;
    this.balanceAnimationInProgress = false;
    this.activeBalanceTweenTarget = null;
    if (Number.isFinite(target)) {
      this.updateBalanceAmount(Number(target));
    }
  }

  public decrementBalanceByBet(): void {
    try {
      this.finalizeBalanceTweenBeforeSpin();
      const currentBalance = this.getBalanceAmount();
      if (!Number.isFinite(currentBalance)) {
        console.warn('[SlotController] Balance not initialized yet; skip optimistic decrement.');
        return;
      }
      const currentBet = this.callbacks.getBaseBetAmount();
      const gameData = this.callbacks.getGameData();

      const totalBetToCharge = (gameData && gameData.isEnhancedBet)
        ? currentBet * 1.25
        : currentBet;


      const newBalance = Math.max(0, currentBalance - totalBetToCharge);
      this.startBalanceTween(newBalance, 200);

      const gameAPI = this.callbacks.getGameAPI();
      if (gameAPI?.getDemoState()) {
        gameAPI.updateDemoBalance(newBalance);
      }

    } catch (error) {
      console.error('[SlotController] Error decrementing balance:', error);
    }
  }

  public getBalanceAmountText(): string | null {
    return this.balanceAmountText ? this.balanceAmountText.text : null;
  }

  public getBalanceAmount(): number {
    if (this.balanceAmountText) {
      const rawText = (this.balanceAmountText.text || '').trim();
      if (!rawText || rawText === BalanceController.BALANCE_PENDING_TEXT || rawText === '\u2014') {
        return Number.NaN;
      }
      const balanceText = CurrencyManager.stripCurrencyPrefix(rawText).replace(/,/g, '');
      const parsed = parseFloat(balanceText);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    }
    return Number.NaN;
  }

  public refreshCurrencySymbols(): void {
    const scene = this.callbacks.getScene();
    if (!scene || !this.balanceLabelText) return;
    const isDemo = this.callbacks.getGameAPI()?.getDemoState();
    const currencyCode = isDemo ? '' : CurrencyManager.getCurrencyCode();
    this.balanceLabelText.setText(currencyCode ? `BALANCE (${currencyCode})` : 'BALANCE');
  }

  private layoutCurrencyPair(
    centerX: number,
    y: number,
    currencyText: Phaser.GameObjects.Text,
    amountText: Phaser.GameObjects.Text,
    isDemo: boolean,
    spacing: number
  ): void {
    const glyph = CurrencyManager.getCurrencyGlyph();
    const showCurrency = !isDemo && glyph.length > 0;

    if (!showCurrency) {
      try { currencyText.setVisible(false); } catch {}
      amountText.setPosition(centerX, y);
      return;
    }

    currencyText.setVisible(true);
    currencyText.setText(glyph);

    const glyphWidth = currencyText.width || 0;
    const amountWidth = amountText.width || 0;
    const totalWidth = glyphWidth + spacing + amountWidth;
    const startX = centerX - (totalWidth / 2);

    currencyText.setPosition(startX + glyphWidth / 2, y);
    amountText.setPosition(startX + glyphWidth + spacing + (amountWidth / 2), y);
  }

  public setPendingBalanceUpdate(update: { balance: number; bet: number; winnings?: number } | null): void {
    this.pendingBalanceUpdate = update;
  }

  public applyPendingBalanceUpdateIfAny(): void {
    if (this.pendingBalanceUpdate) {
      if (this.pendingBalanceUpdate.balance !== undefined) {
        const oldBalance = this.getBalanceAmountText();
        this.startBalanceTween(this.pendingBalanceUpdate.balance, 320);
        try {
          const gameAPI = this.callbacks.getGameAPI();
          if (gameAPI?.getDemoState()) {
            gameAPI.updateDemoBalance(this.pendingBalanceUpdate.balance);
          }
        } catch { }
        if (this.pendingBalanceUpdate.winnings && this.pendingBalanceUpdate.winnings > 0) {
        } else {
        }
      }
      this.pendingBalanceUpdate = null;
    } else {
    }
  }

  public clearPendingBalanceUpdate(): void {
    if (this.pendingBalanceUpdate) {
      this.pendingBalanceUpdate = null;
    }
  }

  public getPendingBalanceUpdate(): { balance: number; bet: number; winnings?: number } | null {
    return this.pendingBalanceUpdate;
  }

  public hasPendingBalanceUpdate(): boolean {
    return this.pendingBalanceUpdate !== null;
  }

  public hasPendingWinnings(): boolean {
    return this.pendingBalanceUpdate?.winnings !== undefined && this.pendingBalanceUpdate.winnings > 0;
  }

  public getPendingWinnings(): number {
    return this.pendingBalanceUpdate?.winnings || 0;
  }

  public forceApplyPendingBalanceUpdate(): void {
    if (this.pendingBalanceUpdate) {

      if (this.pendingBalanceUpdate.balance !== undefined) {
        const oldBalance = this.getBalanceAmountText();
        this.startBalanceTween(this.pendingBalanceUpdate.balance, 320);

        if (this.pendingBalanceUpdate.winnings && this.pendingBalanceUpdate.winnings > 0) {
        } else {
        }
      }

      if (this.pendingBalanceUpdate.bet !== undefined) {
        this.callbacks.updateBetAmount(this.pendingBalanceUpdate.bet);
      }

      this.pendingBalanceUpdate = null;
    } else {
    }
  }

  public async updateBalanceFromServer(spinData?: any): Promise<void> {
    const gameAPI = this.callbacks.getGameAPI();
    const isDemo = !!gameAPI?.getDemoState?.();

    const payloadBalance = Number(spinData?.balance ?? spinData?.data?.balance);
    if (Number.isFinite(payloadBalance)) {
      try {
        if (this.balanceAnimationInProgress) {
          this.pendingServerBalanceForReconcile = payloadBalance;
        } else {
          this.startBalanceTween(payloadBalance, 200);
        }
        if (isDemo) {
          try { gameAPI?.updateDemoBalance?.(payloadBalance); } catch { }
        }
        if (payloadBalance <= 0) {
          this.callbacks.showOutOfBalancePopup();
        }
      } catch (error) {
        console.error('[SlotController] ❌ Error applying payload balance:', error);
      }
      return;
    }

    if (isDemo) {
      return;
    }

    try {
      if (!gameAPI) {
        console.warn('[SlotController] GameAPI not available for balance update');
        return;
      }

      const balanceResponse = await gameAPI.getBalance();

      const newBalance = Number(balanceResponse?.data?.balance ?? balanceResponse?.balance);
      if (!Number.isFinite(newBalance)) {
        console.warn('[SlotController] Unexpected balance response structure:', balanceResponse);
        return;
      }

      if (this.balanceAnimationInProgress) {
        this.pendingServerBalanceForReconcile = newBalance;
      } else {
        this.startBalanceTween(newBalance, 200);
      }
      if (newBalance <= 0) {
        this.callbacks.showOutOfBalancePopup();
      }
    } catch (error) {
      console.error('[SlotController] ❌ Error updating balance from server:', error);
    }
  }
}
