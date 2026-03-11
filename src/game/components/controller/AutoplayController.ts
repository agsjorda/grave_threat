/**
 * AutoplayController - Manages autoplay state and UI
 * 
 * Extracted from SlotController.ts for better code organization.
 * Handles autoplay spins, animations, and stop conditions.
 */

import type { Scene } from 'phaser';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { TurboConfig } from '../../../config/TurboConfig';
import { ensureSpineFactory } from '../../../utils/SpineGuard';
import { Logger } from '../../../utils/Logger';
import { startAnimation } from '../../../utils/SpineAnimationHelper';
import { SoundEffectType } from '../../../managers/AudioManager';

const log = Logger.slot;

export interface AutoplayCallbacks {
  onSpinRequested: () => Promise<void>;
  onAutoplayStarted: () => void;
  onAutoplayStopped: () => void;
  getSymbols: () => any;
}

export class AutoplayController {
  private scene: Scene;
  private container: Phaser.GameObjects.Container;
  private callbacks: AutoplayCallbacks;
  
  // UI Elements
  private autoplayButton: Phaser.GameObjects.Image | null = null;
  private autoplayButtonAnimation: any = null;
  private autoplaySpinsRemainingText: Phaser.GameObjects.Text | null = null;
  private autoplayStopIcon: Phaser.GameObjects.Image | null = null;
  private autoplayButtonTextureOn: string | null = null;
  private autoplayButtonTextureOff: string | null = null;
  private uiContainer: Phaser.GameObjects.Container | null = null;
  
  // State
  private autoplaySpinsRemaining: number = 0;
  private autoplayTimer: Phaser.Time.TimerEvent | null = null;
  private isFreeRoundAutoplay: boolean = false;
  private hasDecrementedAutoplayForCurrentSpin: boolean = false;
  private isManagingAutoplay: boolean = false;
  private showBaseUi: boolean = true;

  constructor(
    scene: Scene,
    container: Phaser.GameObjects.Container,
    callbacks: AutoplayCallbacks
  ) {
    this.scene = scene;
    this.container = container;
    this.callbacks = callbacks;
    
    this.setupEventListeners();
  }

  /**
   * Check if autoplay is currently active
   */
  public isActive(): boolean {
    return this.autoplaySpinsRemaining > 0;
  }

  /**
   * Get remaining autoplay spins
   */
  public getSpinsRemaining(): number {
    return this.autoplaySpinsRemaining;
  }

  /**
   * Create autoplay button and animations
   */
  public createAutoplayButton(
    x: number,
    y: number,
    assetScale: number,
    primaryControllers: Phaser.GameObjects.Container
  ): Phaser.GameObjects.Image {
    this.autoplayButton = this.scene.add.image(x, y, 'auto')
      .setOrigin(0.5, 0.5)
      .setScale(assetScale)
      .setDepth(10)
      .setInteractive();
    
    this.autoplayButton.on('pointerdown', () => {
      log.debug('Autoplay button clicked');
      const audioManager =
        (this.scene as any)?.audioManager || (window as any)?.audioManager;
      if (audioManager && typeof audioManager.playSoundEffect === 'function') {
        audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
      }
      this.handleAutoplayButtonClick();
    });
    
    primaryControllers.add(this.autoplayButton);
    
    // Create spine animation
    this.createAutoplayButtonAnimation(x, y, assetScale, primaryControllers);
    
    return this.autoplayButton;
  }

  /**
   * Attach already-created UI elements (SlotController-managed)
   */
  public attachUiElements(options: {
    button?: Phaser.GameObjects.Image | null;
    stopIcon?: Phaser.GameObjects.Image | null;
    spinsText?: Phaser.GameObjects.Text | null;
    buttonTextureOn?: string;
    buttonTextureOff?: string;
    uiContainer?: Phaser.GameObjects.Container | null;
  }): void {
    if (options.button !== undefined) {
      this.autoplayButton = options.button;
    }
    if (options.stopIcon !== undefined) {
      this.autoplayStopIcon = options.stopIcon;
    }
    if (options.spinsText !== undefined) {
      this.autoplaySpinsRemainingText = options.spinsText;
    }
    if (options.buttonTextureOn) {
      this.autoplayButtonTextureOn = options.buttonTextureOn;
    }
    if (options.buttonTextureOff) {
      this.autoplayButtonTextureOff = options.buttonTextureOff;
    }
    if (options.uiContainer !== undefined) {
      this.uiContainer = options.uiContainer;
    }
  }

  /**
   * Create autoplay spins remaining text
   */
  public createSpinsRemainingText(
    spinButton: Phaser.GameObjects.Image,
    primaryControllers: Phaser.GameObjects.Container
  ): void {
    this.autoplaySpinsRemainingText = this.scene.add.text(
      spinButton.x,
      spinButton.y,
      '',
      {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: 'poppins-bold',
        stroke: '#000000',
        strokeThickness: 4
      }
    ).setOrigin(0.5, 0.5).setDepth(14).setVisible(false);
    
    primaryControllers.add(this.autoplaySpinsRemainingText);
  }

  /**
   * Create autoplay stop icon
   */
  public createStopIcon(
    spinButton: Phaser.GameObjects.Image,
    primaryControllers: Phaser.GameObjects.Container,
    assetScale: number
  ): Phaser.GameObjects.Image {
    this.autoplayStopIcon = this.scene.add.image(
      spinButton.x,
      spinButton.y,
      'autoplay_stop_icon'
    ).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(13).setVisible(false);
    
    primaryControllers.add(this.autoplayStopIcon);
    
    return this.autoplayStopIcon;
  }

  /**
   * Start autoplay with specified number of spins
   */
  public startAutoplay(spins: number, options?: { showBaseUi?: boolean }): void {
    log.debug(`Starting autoplay with ${spins} spins`);
    
    this.autoplaySpinsRemaining = spins;
    this.isManagingAutoplay = true;
    this.showBaseUi = options?.showBaseUi !== false;
    gameStateManager.isAutoPlaying = true;
    gameStateManager.isAutoPlaySpinRequested = true;
    
    // Apply turbo mode to animations if enabled
    const symbols = this.callbacks.getSymbols();
    if (gameStateManager.isTurbo && symbols?.setTurboMode) {
      symbols.setTurboMode(true);
    }
    
    // Show autoplay UI
    if (this.showBaseUi) {
      this.setButtonTextureState(true);
      this.showSpinsRemainingText();
      this.updateSpinsRemainingText(spins);
      this.showStopIcon();
      this.startAutoplayAnimation();
    } else {
      this.hideSpinsRemainingText();
      this.hideStopIcon();
    }
    
    // Notify
    this.callbacks.onAutoplayStarted();
    
    // Start first spin
    this.performAutoplaySpin();
  }

  /**
   * Stop autoplay
   */
  public stopAutoplay(emitAutoStop: boolean = true): void {
    log.debug('Stopping autoplay');
    
    // Clear timer
    if (this.autoplayTimer) {
      this.autoplayTimer.destroy();
      this.autoplayTimer = null;
    }
    
    // Reset state
    this.autoplaySpinsRemaining = 0;
    this.isFreeRoundAutoplay = false;
    this.hasDecrementedAutoplayForCurrentSpin = false;
    this.isManagingAutoplay = false;
    this.showBaseUi = true;
    
    // Update global state
    gameStateManager.isAutoPlaying = false;
    gameStateManager.isAutoPlaySpinRequested = false;
    
    // Hide autoplay UI
    this.setButtonTextureState(false);
    this.hideSpinsRemainingText();
    this.hideStopIcon();
    this.stopAutoplayAnimation();
    
    // Restore win animation timing
    const symbols = this.callbacks.getSymbols();
    if (symbols?.setTurboMode) {
      symbols.setTurboMode(false);
    }
    
    // Emit event when requested (autoplay finished naturally)
    if (emitAutoStop) {
      gameEventManager.emit(GameEventType.AUTO_STOP);
    }
    
    // Notify
    this.callbacks.onAutoplayStopped();
  }

  /**
   * Decrement autoplay counter (called on REELS_START)
   */
  public decrementSpinsIfNeeded(): void {
    if (!this.isManagingAutoplay || !gameStateManager.isAutoPlaying || this.hasDecrementedAutoplayForCurrentSpin) {
      return;
    }
    
    this.hasDecrementedAutoplayForCurrentSpin = true;
    this.autoplaySpinsRemaining = Math.max(0, this.autoplaySpinsRemaining - 1);
    
    this.updateSpinsRemainingText(this.autoplaySpinsRemaining);
    this.bounceSpinsRemainingText();
    
    log.debug(`Autoplay spins remaining: ${this.autoplaySpinsRemaining}`);
    
    if (this.autoplaySpinsRemaining <= 0) {
      log.debug('Autoplay spins exhausted');
    }
  }

  /**
   * Continue autoplay after current spin completes
   */
  public continueAutoplayIfNeeded(): void {
    if (!this.isManagingAutoplay || !gameStateManager.isAutoPlaying) {
      return;
    }
    if (this.autoplaySpinsRemaining <= 0) {
      this.stopAutoplay(true);
      return;
    }
    
    // Reset decrement flag for next spin
    this.hasDecrementedAutoplayForCurrentSpin = false;
    
    // Calculate delay
    const baseDelay = 500;
    const delay = gameStateManager.isTurbo 
      ? baseDelay * TurboConfig.TURBO_DELAY_MULTIPLIER 
      : baseDelay;
    
    // Schedule next spin
    this.autoplayTimer = this.scene.time.delayedCall(delay, () => {
      this.performAutoplaySpin();
    });
  }

  /**
   * Disable autoplay button
   */
  public disableButton(): void {
    if (this.autoplayButton) {
      this.autoplayButton.setAlpha(0.5);
      this.autoplayButton.setTint(0x555555);
      this.autoplayButton.disableInteractive();
    }
  }

  /**
   * Enable autoplay button
   */
  public enableButton(): void {
    if (this.autoplayButton) {
      this.autoplayButton.setAlpha(1.0);
      this.autoplayButton.clearTint();
      this.autoplayButton.setInteractive();
    }
  }

  /**
   * Get the autoplay button
   */
  public getButton(): Phaser.GameObjects.Image | null {
    return this.autoplayButton;
  }

  /**
   * Get the stop icon
   */
  public getStopIcon(): Phaser.GameObjects.Image | null {
    return this.autoplayStopIcon;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private setupEventListeners(): void {
    // REELS_START - decrement counter
    gameEventManager.on(GameEventType.REELS_START, () => {
      if (this.isManagingAutoplay) {
        this.decrementSpinsIfNeeded();
      }
    });
    
    // WIN_STOP - continue autoplay
    gameEventManager.on(GameEventType.WIN_STOP, () => {
      // If a scatter has triggered, let the scatter / bonus flow take over.
      // Normal base-game autoplay should not advance to the next spin while
      // the scatter animations and FreeSpin dialog are running.
      if (gameStateManager.isScatter) {
        log.debug('[AutoplayController] WIN_STOP: scatter active - skipping autoplay continue');
        return;
      }

      if (this.isManagingAutoplay && gameStateManager.isAutoPlaying && !gameStateManager.isShowingWinDialog) {
        this.continueAutoplayIfNeeded();
      }
    });
    
    // WIN_DIALOG_CLOSED - continue autoplay after dialog
    gameEventManager.on(GameEventType.WIN_DIALOG_CLOSED, () => {
      // When a scatter has been detected, dialog closure typically leads into
      // scatter / bonus handling (including delayed scatter flows). In that case,
      // do not resume base-game autoplay here; FreeSpinController will manage
      // its own autoplay sequence once the scatter flow completes.
      if (gameStateManager.isScatter) {
        log.debug('[AutoplayController] WIN_DIALOG_CLOSED: scatter active - skipping autoplay continue');
        return;
      }

      if (this.isManagingAutoplay && gameStateManager.isAutoPlaying) {
        this.continueAutoplayIfNeeded();
      }
    });
  }

  private handleAutoplayButtonClick(): void {
    if (gameStateManager.isReelSpinning) {
      log.debug('Cannot toggle autoplay while spinning');
      return;
    }
    
    if (gameStateManager.isAutoPlaying) {
      this.stopAutoplay();
    } else {
      // Emit event to show autoplay options dialog
      gameEventManager.emit(GameEventType.AUTO_START);
    }
  }

  private async performAutoplaySpin(): Promise<void> {
    if (this.autoplaySpinsRemaining <= 0) {
      this.stopAutoplay();
      return;
    }
    
    if (gameStateManager.isShowingWinDialog) {
      log.debug('Autoplay paused - win dialog showing');
      return;
    }
    
    try {
      await this.callbacks.onSpinRequested();
    } catch (error) {
      log.warn('Autoplay spin failed:', error);
      this.stopAutoplay();
    }
  }

  private createAutoplayButtonAnimation(
    x: number,
    y: number,
    assetScale: number,
    container: Phaser.GameObjects.Container
  ): void {
    try {
      if (!ensureSpineFactory(this.scene, '[AutoplayController]')) {
        this.scene.time.delayedCall(250, () => {
          this.createAutoplayButtonAnimation(x, y, assetScale, container);
        });
        return;
      }

      if (!this.scene.cache.json.has('button_animation_idle')) {
        log.warn('Autoplay animation spine assets not loaded');
        return;
      }

      this.autoplayButtonAnimation = this.scene.add.spine(
        x - 4,
        y - 26,
        'button_animation_idle',
        'button_animation_idle-atlas'
      );
      
      this.autoplayButtonAnimation.setOrigin(0.5, 0.5);
      this.autoplayButtonAnimation.setScale(assetScale * 0.16);
      this.autoplayButtonAnimation.setDepth(11);
      this.autoplayButtonAnimation.animationState.timeScale = 1;
      this.autoplayButtonAnimation.setVisible(false);
      
      container.add(this.autoplayButtonAnimation);
      
      log.debug('Autoplay button animation created');
    } catch (error) {
      log.warn('Failed to create autoplay animation:', error);
    }
  }

  private startAutoplayAnimation(): void {
    if (!this.autoplayButtonAnimation) return;
    
    try {
      this.autoplayButtonAnimation.setVisible(true);
      startAnimation(this.autoplayButtonAnimation, {
        animationName: 'animation',
        loop: true,
        logWhenMissing: false
      });
    } catch (error) {
      log.warn('Failed to start autoplay animation:', error);
    }
  }

  private stopAutoplayAnimation(): void {
    if (!this.autoplayButtonAnimation) return;
    
    try {
      this.autoplayButtonAnimation.setVisible(false);
      this.autoplayButtonAnimation.animationState.clearTracks();
    } catch (error) {
      log.warn('Failed to stop autoplay animation:', error);
    }
  }

  private setButtonTextureState(isOn: boolean): void {
    if (!this.autoplayButton) return;
    const key = isOn ? this.autoplayButtonTextureOn : this.autoplayButtonTextureOff;
    if (key) {
      this.autoplayButton.setTexture(key);
    }
  }

  private showSpinsRemainingText(): void {
    if (this.autoplaySpinsRemainingText) {
      this.autoplaySpinsRemainingText.setVisible(true);
      const parent = (this.autoplaySpinsRemainingText as any).parentContainer || this.uiContainer || this.container;
      if (parent && parent.bringToTop) {
        parent.bringToTop(this.autoplaySpinsRemainingText);
      }
    }
  }

  private hideSpinsRemainingText(): void {
    if (this.autoplaySpinsRemainingText) {
      this.autoplaySpinsRemainingText.setVisible(false);
    }
  }

  private updateSpinsRemainingText(spins: number): void {
    if (this.autoplaySpinsRemainingText) {
      this.autoplaySpinsRemainingText.setText(spins.toString());
    }
  }

  private bounceSpinsRemainingText(): void {
    if (!this.autoplaySpinsRemainingText) return;
    
    try {
      this.scene.tweens.add({
        targets: this.autoplaySpinsRemainingText,
        scaleX: 1.45,
        scaleY: 1.45,
        duration: 100,
        ease: 'Power2',
        yoyo: true,
        onComplete: () => {
          this.autoplaySpinsRemainingText?.setScale(1, 1);
        }
      });
    } catch (error) {
      log.warn('Failed to bounce spins text:', error);
    }
  }

  private showStopIcon(): void {
    if (this.autoplayStopIcon) {
      this.autoplayStopIcon.setVisible(true);
      const parent = (this.autoplayStopIcon as any).parentContainer || this.uiContainer || this.container;
      if (parent && parent.bringToTop) {
        parent.bringToTop(this.autoplayStopIcon);
      }
    }
  }

  private hideStopIcon(): void {
    if (this.autoplayStopIcon) {
      this.autoplayStopIcon.setVisible(false);
    }
  }
}
