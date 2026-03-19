import type { Scene } from 'phaser';
import type { GameAPI } from '../../../backend/GameAPI';
import type { GameData } from '../GameData';
import { CurrencyManager } from '../CurrencyManager';

export interface BalanceControllerCallbacks {
  getScene: () => Scene | null;
  getGameAPI: () => GameAPI | null;
  getGameData: () => GameData | null;
  getBaseBetAmount: () => number;
  updateBetAmount: (bet: number) => void;
  showOutOfBalancePopup: () => void;
}

export class BalanceController {
  private controllerContainer: Phaser.GameObjects.Container;
  private callbacks: BalanceControllerCallbacks;
  private balanceLabelText!: Phaser.GameObjects.Text;
  private balanceAmountText!: Phaser.GameObjects.Text;
  private pendingBalanceUpdate: { balance: number; bet: number; winnings?: number } | null = null;

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
      '0',
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
      this.balanceAmountText.setText(
        balanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    }
  }

  public decrementBalanceByBet(): void {
    try {
      const currentBalance = this.getBalanceAmount();
      const currentBet = this.callbacks.getBaseBetAmount();
      const gameData = this.callbacks.getGameData();

      const totalBetToCharge = (gameData && gameData.isEnhancedBet)
        ? currentBet * 1.25
        : currentBet;


      const newBalance = Math.max(0, currentBalance - totalBetToCharge);
      this.updateBalanceAmount(newBalance);

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
      const balanceText = CurrencyManager.stripCurrencyPrefix(this.balanceAmountText.text).replace(/,/g, '');
      return parseFloat(balanceText) || 0;
    }
    return 0;
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
        this.updateBalanceAmount(this.pendingBalanceUpdate.balance);
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
        this.updateBalanceAmount(this.pendingBalanceUpdate.balance);

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

  public async updateBalanceFromServer(): Promise<void> {
    if (this.callbacks.getGameAPI()?.getDemoState()) {
      return;
    }

    try {

      const gameAPI = this.callbacks.getGameAPI();
      if (!gameAPI) {
        console.warn('[SlotController] GameAPI not available for balance update');
        return;
      }

      const balanceResponse = await gameAPI.getBalance();

      let newBalance = 0;
      if (balanceResponse && balanceResponse.data && balanceResponse.data.balance !== undefined) {
        newBalance = parseFloat(balanceResponse.data.balance);
      } else if (balanceResponse && balanceResponse.balance !== undefined) {
        newBalance = parseFloat(balanceResponse.balance);
      } else {
        console.warn('[SlotController] Unexpected balance response structure:', balanceResponse);
        return;
      }

      const oldBalance = this.getBalanceAmount();

      this.updateBalanceAmount(newBalance);
      if (newBalance <= 0) {
        this.callbacks.showOutOfBalancePopup();
      }

    } catch (error) {
      console.error('[SlotController] ❌ Error updating balance from server:', error);
    }
  }
}
