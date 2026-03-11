/**
 * BetController - Manages bet display and controls
 * 
 * Extracted from SlotController.ts for better code organization.
 * Handles bet levels, +/- buttons, amplify bet, and bet display updates.
 */

import type { Scene } from 'phaser';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { ensureSpineFactory } from '../../../utils/SpineGuard';
import { Logger } from '../../../utils/Logger';
import { startAnimation } from '../../../utils/SpineAnimationHelper';
import { formatCurrencyNumber } from '../../../utils/NumberPrecisionFormatter';
import { SoundEffectType } from '../../../managers/AudioManager';

const log = Logger.slot;

/** Standard bet levels ladder - keep in sync with BetOptions.ts */
export const BET_LEVELS: readonly number[] = Object.freeze([
  0.2, 0.4, 0.6, 0.8, 1,
  1.2, 1.6, 2, 2.4, 2.8,
  3.2, 3.6, 4, 5, 6,
  8, 10, 14, 18, 24,
  32, 40, 60, 80, 100,
  110, 120, 130, 140, 150
]);

export interface BetDisplayConfig {
  x: number;
  y: number;
  assetScale: number;
  isDemoMode: boolean;
}

export interface BetControllerCallbacks {
  onBetChange: (newBet: number, previousBet: number) => void;
  getBaseBetAmount: () => number;
  getGameData: () => any;
}

export class BetController {
  private scene: Scene;
  private container: Phaser.GameObjects.Container;
  private callbacks: BetControllerCallbacks;
  
  // UI Elements
  private betAmountText: Phaser.GameObjects.Text | null = null;
  private decreaseBetButton: Phaser.GameObjects.Image | null = null;
  private increaseBetButton: Phaser.GameObjects.Image | null = null;
  
  // Spine animations
  private amplifyBetAnimation: any = null;
  private enhanceBetIdleAnimation: any = null;
  
  // State
  private baseBetAmount: number = 0.2;
  private isButtonsDisabled: boolean = false;
  private disabledAlpha: number = 0.5;

  constructor(
    scene: Scene,
    container: Phaser.GameObjects.Container,
    callbacks: BetControllerCallbacks
  ) {
    this.scene = scene;
    this.container = container;
    this.callbacks = callbacks;
  }

  /**
   * Get the bet levels ladder
   */
  public getBetLevels(): readonly number[] {
    return BET_LEVELS;
  }

  /**
   * Get the current base bet amount
   */
  public getBaseBetAmount(): number {
    return this.baseBetAmount;
  }

  /**
   * Set the base bet amount
   */
  public setBaseBetAmount(amount: number): void {
    this.baseBetAmount = amount;
  }

  /**
   * Create bet display UI elements
   */
  public createBetDisplay(config: BetDisplayConfig): void {
    const { x: betX, y: betY, assetScale, isDemoMode } = config;
    
    // Bet background
    const betBackground = this.scene.add.image(betX, betY, 'bet_bg')
      .setOrigin(0.5, 0.5)
      .setScale(assetScale)
      .setDepth(8)
      .setInteractive();
    
    betBackground.setData('isBetBackground', true);
    this.container.add(betBackground);

    // Bet label
    const betLabel = this.scene.add.text(betX, betY - 15, 'BET', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'poppins-regular'
    }).setOrigin(0.5, 0.5).setDepth(9);
    this.container.add(betLabel);

    // Bet amount text
    this.betAmountText = this.scene.add.text(betX, betY + 8, '0.00', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'poppins-bold'
    }).setOrigin(0.5, 0.5).setDepth(9);
    this.container.add(this.betAmountText);

    // Decrease bet button
    this.decreaseBetButton = this.scene.add.image(betX - 42, betY + 8, 'decrease_bet')
      .setOrigin(0.5, 0.5)
      .setScale(assetScale * 0.55)
      .setDepth(10)
      .setInteractive();
    
    this.decreaseBetButton.on('pointerdown', () => {
      if (this.isButtonsDisabled) {
        console.log('[BetController] Decrease bet clicked but buttons are disabled');
        return;
      }
      const audioManager =
        (this.scene as any)?.audioManager || (window as any)?.audioManager;
      if (audioManager && typeof audioManager.playSoundEffect === 'function') {
        audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
      }
      log.debug('Decrease bet clicked');
      this.adjustBetByStep(-1);
    });
    this.container.add(this.decreaseBetButton);

    // Increase bet button
    this.increaseBetButton = this.scene.add.image(betX + 42, betY + 8, 'increase_bet')
      .setOrigin(0.5, 0.5)
      .setScale(assetScale * 0.55)
      .setDepth(10)
      .setInteractive();
    
    this.increaseBetButton.on('pointerdown', () => {
      if (this.isButtonsDisabled) {
        console.log('[BetController] Increase bet clicked but buttons are disabled');
        return;
      }
      const audioManager =
        (this.scene as any)?.audioManager || (window as any)?.audioManager;
      if (audioManager && typeof audioManager.playSoundEffect === 'function') {
        audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
      }
      log.debug('Increase bet clicked');
      this.adjustBetByStep(1);
    });
    this.container.add(this.increaseBetButton);

    // Create spine animations
    this.createAmplifyBetAnimation(betX, betY, assetScale);
    this.createEnhanceBetIdleAnimation(betX, betY);

    // Initialize button states
    this.updateBetLimitButtons(this.baseBetAmount);
  }

  /**
   * Update bet amount display
   */
  public updateBetAmount(amount: number): void {
    this.baseBetAmount = amount;
    
    if (this.betAmountText) {
      const formattedAmount = formatCurrencyNumber(amount);
      this.betAmountText.setText(formattedAmount);
    }
    
    this.updateBetLimitButtons(amount);
  }

  /**
   * Adjust bet by one step in the ladder
   */
  public adjustBetByStep(direction: 1 | -1): void {
    try {
      const currentBaseBet = this.callbacks.getBaseBetAmount() || 0.2;

      const currentIdx = this.getClosestBetIndex(currentBaseBet);
      const newIdx = Math.max(0, Math.min(BET_LEVELS.length - 1, currentIdx + direction));
      const previousBet = currentBaseBet;
      const newBet = BET_LEVELS[newIdx];

      // Update display and notify
      this.updateBetAmount(newBet);
      this.callbacks.onBetChange(newBet, previousBet);
      
      // Emit event
      gameEventManager.emit(GameEventType.BET_UPDATE, { 
        newBet, 
        previousBet 
      });
    } catch (e) {
      log.warn('adjustBetByStep failed:', e);
    }
  }

  /**
   * Update bet limit button states (grey out at min/max)
   */
  public updateBetLimitButtons(currentBet: number, shouldAllowEnable: boolean = true): void {
    if (!this.decreaseBetButton && !this.increaseBetButton) {
      return;
    }

    if (this.isButtonsDisabled) {
      this.disableBetButtons(this.disabledAlpha);
      return;
    }

    // Find closest bet level index
    const idx = this.getClosestBetIndex(currentBet);

    const minBet = BET_LEVELS[0] ?? 0.2;
    const isAtMin = idx === 0 || currentBet <= minBet + 1e-6;
    const isAtMax = idx === BET_LEVELS.length - 1;

    // Update decrease button
    if (this.decreaseBetButton) {
      if (isAtMin || !shouldAllowEnable) {
        this.decreaseBetButton.setAlpha(0.5);
        this.decreaseBetButton.setTint(0x555555);
        this.decreaseBetButton.disableInteractive();
      } else {
        this.decreaseBetButton.setAlpha(1.0);
        this.decreaseBetButton.clearTint();
        this.decreaseBetButton.setInteractive();
      }
    }

    // Update increase button
    if (this.increaseBetButton) {
      if (isAtMax || !shouldAllowEnable) {
        this.increaseBetButton.setAlpha(0.5);
        this.increaseBetButton.setTint(0x555555);
        this.increaseBetButton.disableInteractive();
      } else {
        this.increaseBetButton.setAlpha(1.0);
        this.increaseBetButton.clearTint();
        this.increaseBetButton.setInteractive();
      }
    }
  }

  /**
   * Disable bet buttons
   */
  public disableBetButtons(alpha: number = 0.5): void {
    this.isButtonsDisabled = true;
    this.disabledAlpha = alpha;
    if (this.decreaseBetButton) {
      this.decreaseBetButton.setAlpha(alpha);
      this.decreaseBetButton.setTint(0x555555);
      this.decreaseBetButton.disableInteractive();
    }

    if (this.increaseBetButton) {
      this.increaseBetButton.setAlpha(alpha);
      this.increaseBetButton.setTint(0x555555);
      this.increaseBetButton.disableInteractive();
    }
  }

  /**
   * Enable bet buttons
   */
  public enableBetButtons(): void {
    this.isButtonsDisabled = false;
    if (this.decreaseBetButton) {
      this.decreaseBetButton.setAlpha(1.0);
      this.decreaseBetButton.clearTint();
      this.decreaseBetButton.setInteractive();
    }

    if (this.increaseBetButton) {
      this.increaseBetButton.setAlpha(1.0);
      this.increaseBetButton.clearTint();
      this.increaseBetButton.setInteractive();
    }

    // Apply limit states after generic enable
    this.updateBetLimitButtons(this.callbacks.getBaseBetAmount() || 0.2);
  }

  /**
   * Create amplify bet spine animation
   */
  private createAmplifyBetAnimation(betX: number, betY: number, assetScale: number): void {
    try {
      if (!ensureSpineFactory(this.scene, '[BetController] createAmplifyBetAnimation')) {
        return;
      }

      if (!this.scene.cache.json.has('amplify_bet')) {
        log.warn('Amplify bet spine assets not loaded');
        return;
      }

      const amplifyOffsetX = -4;
      const amplifyOffsetY = 0;
      
      this.amplifyBetAnimation = this.scene.add.spine(
        betX + amplifyOffsetX,
        betY + amplifyOffsetY,
        'amplify_bet',
        'amplify_bet-atlas'
      );
      
      this.amplifyBetAnimation.setScale(1);
      this.amplifyBetAnimation.setDepth(7);
      this.amplifyBetAnimation.setVisible(false);
      
      this.container.add(this.amplifyBetAnimation);
      
      log.debug('Amplify bet animation created');
    } catch (error) {
      log.warn('Failed to create amplify bet animation:', error);
    }
  }

  /**
   * Create enhance bet idle loop animation
   */
  private createEnhanceBetIdleAnimation(betX: number, betY: number): void {
    try {
      if (!ensureSpineFactory(this.scene, '[BetController] createEnhanceBetIdleAnimation')) {
        return;
      }

      if (!this.scene.cache.json.has('enhance_bet_idle_on')) {
        log.warn('Enhance bet idle spine assets not loaded');
        return;
      }

      const targetX = this.amplifyBetAnimation ? this.amplifyBetAnimation.x : (betX - 4);
      const targetY = this.amplifyBetAnimation ? this.amplifyBetAnimation.y : betY;
      
      this.enhanceBetIdleAnimation = this.scene.add.spine(
        targetX,
        targetY,
        'enhance_bet_idle_on',
        'enhance_bet_idle_on-atlas'
      );
      
      this.enhanceBetIdleAnimation.setOrigin(0.5, 0.5);
      
      if (this.amplifyBetAnimation) {
        this.enhanceBetIdleAnimation.setScale(
          this.amplifyBetAnimation.scaleX,
          this.amplifyBetAnimation.scaleY
        );
        this.enhanceBetIdleAnimation.setDepth(this.amplifyBetAnimation.depth);
      } else {
        this.enhanceBetIdleAnimation.setScale(1);
        this.enhanceBetIdleAnimation.setDepth(7);
      }
      
      this.enhanceBetIdleAnimation.setVisible(false);
      this.container.add(this.enhanceBetIdleAnimation);
      
      log.debug('Enhance bet idle animation created');
    } catch (error) {
      log.warn('Failed to create enhance bet idle animation:', error);
    }
  }

  /**
   * Show enhance bet idle loop
   */
  public showEnhanceBetIdleLoop(): void {
    if (!this.enhanceBetIdleAnimation) return;
    
    this.enhanceBetIdleAnimation.setVisible(true);
    const idleName = 'animation';
    const animations = this.enhanceBetIdleAnimation.skeleton?.data.animations || [];
    startAnimation(this.enhanceBetIdleAnimation, {
      animationName: idleName,
      fallbackAnimationName: animations[0]?.name,
      fallbackToFirstAvailable: true,
      loop: true,
      logWhenMissing: false
    });
  }

  /**
   * Hide enhance bet idle loop
   */
  public hideEnhanceBetIdleLoop(): void {
    if (!this.enhanceBetIdleAnimation) return;
    
    this.enhanceBetIdleAnimation.animationState.clearTracks();
    this.enhanceBetIdleAnimation.setVisible(false);
  }

  /**
   * Play amplify bet animation once
   */
  public playAmplifyBetAnimation(): void {
    if (!this.amplifyBetAnimation) return;
    
    try {
      this.amplifyBetAnimation.setVisible(true);
      startAnimation(this.amplifyBetAnimation, {
        animationName: 'animation',
        loop: false,
        fallbackToFirstAvailable: true,
        logWhenMissing: false
      });
      
      this.amplifyBetAnimation.animationState.addListener({
        complete: () => {
          this.amplifyBetAnimation.setVisible(false);
          const gameData = this.callbacks.getGameData?.();
          if (gameData && gameData.isEnhancedBet) {
            this.showEnhanceBetIdleLoop();
          }
        }
      });
    } catch (error) {
      log.warn('Failed to play amplify bet animation:', error);
    }
  }

  /**
   * Get the bet amount text element (for positioning other elements)
   */
  public getBetAmountText(): Phaser.GameObjects.Text | null {
    return this.betAmountText;
  }

  private getClosestBetIndex(currentBet: number): number {
    let idx = 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < BET_LEVELS.length; i++) {
      const diff = Math.abs(BET_LEVELS[i] - currentBet);
      if (diff < bestDiff) {
        bestDiff = diff;
        idx = i;
      }
    }
    return idx;
  }
}
