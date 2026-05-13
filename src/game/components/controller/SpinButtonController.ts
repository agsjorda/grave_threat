/**
 * SpinButtonController - Manages spin button and related UI
 * 
 * Extracted from SlotController.ts for better code organization.
 * Handles spin button state, animations, and interactions.
 */

import type { Scene } from 'phaser';
import { gameStateManager } from '../../../managers/GameStateManager';
import { ensureSpineFactory, SPINE_FACTORY_RETRY_MS } from '../../../utils/SpineGuard';
import { Logger } from '../../../utils/Logger';
import { startAnimation, startAnimationWithEntry } from '../../../utils/SpineAnimationHelper';

const log = Logger.slot;

export interface SpinButtonCallbacks {
  onSpinRequested: () => Promise<void>;
  onSpinBlocked: (reason: string) => void;
  isAutoplayActive: () => boolean;
  stopAutoplay: () => void;
  onSpinClickStarted?: () => void;
  isInFreeRoundSpins?: () => boolean;
  canAffordCurrentSpin?: () => boolean;
  isSpinLocked?: () => boolean;
  isPendingWinLock?: () => boolean;
  isTumbleSequenceInProgress?: () => boolean;
}

export class SpinButtonController {
  private scene: Scene;
  private container: Phaser.GameObjects.Container;
  private callbacks: SpinButtonCallbacks;
  
  // UI Elements
  private spinButton: Phaser.GameObjects.Image | null = null;
  private spinIcon: Phaser.GameObjects.Image | null = null;
  private spinIconTween: Phaser.Tweens.Tween | null = null;
  private autoplayStopIcon: Phaser.GameObjects.Image | null = null;
  
  // Spine animations
  private spinButtonAnimation: any = null;
  private freeRoundSpinButtonAnimation: any = null;
  
  // State
  private isDisabled: boolean = false;
  private readonly DISABLED_ALPHA: number = 0.5;
  private lastClickAt: number = 0;
  private readonly clickDebounceMs: number = 500;

  constructor(
    scene: Scene,
    container: Phaser.GameObjects.Container,
    callbacks: SpinButtonCallbacks
  ) {
    this.scene = scene;
    this.container = container;
    this.callbacks = callbacks;
  }

  /**
   * Create spin button and related UI elements
   */
  public createSpinButton(
    x: number,
    y: number,
    assetScale: number,
    stopIconScale: number,
    primaryControllers: Phaser.GameObjects.Container,
    animationBaseScale: number = assetScale
  ): Phaser.GameObjects.Image {
    // Spin button (main button)
    this.spinButton = this.scene.add.image(x, y, 'spin')
      .setOrigin(0.5, 0.5)
      .setScale(assetScale)
      .setDepth(10)
      .setInteractive();
    
    this.spinButton.on('pointerdown', () => {
      this.handleSpinButtonClick();
    });
    
    primaryControllers.add(this.spinButton);
    
    // Spin icon overlay (rotating icon on top of button)
    this.spinIcon = this.scene.add.image(x, y, 'spin_icon')
      .setOrigin(0.5, 0.5)
      .setScale(assetScale)
      .setDepth(12);
    
    primaryControllers.add(this.spinIcon);

    // Autoplay-stop icon (hidden by default; shown by AutoplayController)
    this.autoplayStopIcon = this.scene.add.image(x, y, 'autoplay_stop_icon')
      .setOrigin(0.5, 0.5)
      .setScale(stopIconScale)
      .setDepth(13)
      .setVisible(false);
    primaryControllers.add(this.autoplayStopIcon);
    
    // Start continuous rotation
    this.spinIconTween = this.scene.tweens.add({
      targets: this.spinIcon,
      angle: 360,
      duration: 4000,
      repeat: -1,
      ease: 'Linear'
    });
    
    // Create spine animations using base asset scale (avoid portrait double-scaling)
    this.createSpinButtonAnimation(animationBaseScale, primaryControllers);
    
    return this.spinButton;
  }

  /**
   * Enable spin button
   */
  public enable(): void {
    if (this.spinButton) {
      this.spinButton.setInteractive();
      this.spinButton.setAlpha(1.0);
      this.spinButton.clearTint();
    }
    if (this.spinIcon) {
      this.spinIcon.setAlpha(1.0);
      this.spinIcon.clearTint();
    }
    if (this.spinIconTween) {
      this.spinIconTween.resume();
    }
    this.isDisabled = false;
    log.debug('Spin button enabled');
  }

  /**
   * Disable spin button
   */
  public disable(): void {
    this.isDisabled = true; // Set flag first
    if (this.spinButton) {
      this.spinButton.disableInteractive();
      this.spinButton.setTint(0x666666); // Gray out the button
      // Match grave_threat: keep spin button clickable while reels are spinning
      // so the player can request skip on additional taps.
      if (gameStateManager.isReelSpinning) {
        this.spinButton.setInteractive();
      }
    }
    if (this.spinIcon) {
      this.spinIcon.setAlpha(0.5);
      this.spinIcon.setTint(0x666666);
    }
    if (this.spinIconTween) {
      this.spinIconTween.pause(); // Pause icon animation
    }
    log.debug('Spin button disabled');
  }

  /**
   * Check if spin button is disabled
   */
  public isSpinButtonDisabled(): boolean {
    return this.isDisabled;
  }

  /**
   * Get the spin button image
   */
  public getButton(): Phaser.GameObjects.Image | null {
    return this.spinButton;
  }

  /**
   * Get the spin icon image
   */
  public getIcon(): Phaser.GameObjects.Image | null {
    return this.spinIcon;
  }

  /**
   * Get the autoplay stop icon overlay
   */
  public getAutoplayStopIcon(): Phaser.GameObjects.Image | null {
    return this.autoplayStopIcon;
  }

  /**
   * Play spin button animation
   */
  public playSpinAnimation(): void {
    // Ensure icon alpha is set correctly based on disabled state
    if (this.spinIcon) {
      if (this.isDisabled) {
        this.spinIcon.setAlpha(this.DISABLED_ALPHA);
        log.debug(`Spin icon alpha set to ${this.DISABLED_ALPHA} in playSpinAnimation (disabled)`);
      } else {
        this.spinIcon.setAlpha(1.0);
      }
    }
    
    const isInFreeRoundSpins = this.callbacks.isInFreeRoundSpins?.() === true;
    const targetAnimation = isInFreeRoundSpins && this.freeRoundSpinButtonAnimation
      ? this.freeRoundSpinButtonAnimation
      : this.spinButtonAnimation;

    if (!targetAnimation) return;

    try {
      // Keep only one spin effect visible at a time
      if (targetAnimation === this.freeRoundSpinButtonAnimation && this.spinButtonAnimation) {
        this.spinButtonAnimation.setVisible(false);
      }
      if (targetAnimation === this.spinButtonAnimation && this.freeRoundSpinButtonAnimation) {
        this.freeRoundSpinButtonAnimation.setVisible(false);
      }

      const animationName = targetAnimation === this.freeRoundSpinButtonAnimation
        ? 'Button_Bonus_Bottom'
        : 'animation';

      targetAnimation.setVisible(true);
      const startResult = startAnimationWithEntry(targetAnimation, {
        animationName,
        loop: false,
        timeScale: 1,
        fallbackToFirstAvailable: true,
        logWhenMissing: false
      });

      const playedAnimationName = startResult?.animationName ?? animationName;
      const trackEntry: any = startResult?.entry;

      if (!startResult) {
        targetAnimation.setVisible(false);
        return;
      }

      // Match grave_threat free-round clamp behavior
      if (targetAnimation === this.freeRoundSpinButtonAnimation && trackEntry) {
        try {
          const anySpine: any = targetAnimation;
          const animData = anySpine?.skeleton?.data?.findAnimation?.(playedAnimationName);
          const duration: number | undefined = animData?.duration;
          if (typeof duration === 'number' && duration > 0.01) {
            trackEntry.animationEnd = Math.max(0, duration - 0.01);
          }
        } catch (e) {
          log.warn('Failed to clamp free-round spin animationEnd:', e);
        }
      }

      targetAnimation.animationState.addListener({
        complete: (entry: any) => {
          if (entry.animation.name === playedAnimationName) {
            targetAnimation.setVisible(false);
            if (this.spinIcon) {
              this.spinIcon.setAlpha(this.isDisabled ? this.DISABLED_ALPHA : 1.0);
            }
          }
        }
      });

      log.debug('Spin button animation played');
    } catch (error) {
      log.warn('Failed to play spin button animation:', error);
      targetAnimation.setVisible(false);
      if (this.spinIcon) {
        this.spinIcon.setAlpha(this.isDisabled ? this.DISABLED_ALPHA : 1.0);
      }
    }
  }

  /**
   * Play free round spin button animation
   */
  public playFreeRoundAnimation(): void {
    if (!this.freeRoundSpinButtonAnimation) return;
    
    try {
      const animationName = 'animation';
      this.freeRoundSpinButtonAnimation.setVisible(true);
      startAnimation(this.freeRoundSpinButtonAnimation, {
        animationName,
        loop: false,
        fallbackToFirstAvailable: true,
        logWhenMissing: false
      });
      
      this.freeRoundSpinButtonAnimation.animationState.addListener({
        complete: (entry: any) => {
          if (entry?.animation?.name !== animationName) return;
          this.freeRoundSpinButtonAnimation.setVisible(false);
        }
      });
    } catch (error) {
      log.warn('Failed to play free round animation:', error);
    }
  }

  /**
   * Hide spin icon (during autoplay stop icon display)
   */
  public hideIcon(): void {
    if (this.spinIcon) {
      this.spinIcon.setVisible(false);
    }
  }

  /**
   * Show spin icon
   */
  public showIcon(): void {
    if (this.spinIcon) {
      this.spinIcon.setVisible(true);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async handleSpinButtonClick(): Promise<void> {
    log.debug('Spin button clicked');

    // Match grave_threat click flow: during reel spinning, clicking spin requests skip.
    if (gameStateManager.isReelSpinning) {
      this.callbacks.onSpinBlocked('Already spinning');
      return;
    }

    if (this.isDisabled) {
      log.debug('Spin button click ignored - disabled');
      return;
    }
    const now = Date.now();
    if (now - this.lastClickAt < this.clickDebounceMs) {
      log.debug('Spin button click ignored - debounce');
      return;
    }
    this.lastClickAt = now;

    // If autoplay is active, clicking spin stops it
    if (this.callbacks.isAutoplayActive()) {
      log.debug('Stopping autoplay via spin button');
      this.callbacks.stopAutoplay();
      return;
    }
    
    // Respect external locks from SlotController when available
    if (
      this.callbacks.isSpinLocked?.() ||
      this.callbacks.isPendingWinLock?.() ||
      this.callbacks.isTumbleSequenceInProgress?.() ||
      gameStateManager.isShowingWinDialog
    ) {
      log.debug('Spin button click ignored - locked');
      return;
    }

    if (this.callbacks.canAffordCurrentSpin && !this.callbacks.canAffordCurrentSpin()) {
      log.debug('Spin button click ignored - cannot afford');
      return;
    }
    
    // Lock all controls for this spin action when parent provides a lock callback
    this.callbacks.onSpinClickStarted?.();

    // Disable button and play animation
    this.disable();
    this.playSpinAnimation();
    
    // Request spin
    try {
      await this.callbacks.onSpinRequested();
    } catch (error) {
      log.warn('Spin request failed:', error);
      this.enable();
    }
  }

  private rotateSpinButton(): void {
    if (!this.spinIcon) return;
    
    // Quick rotation effect
    this.scene.tweens.add({
      targets: this.spinIcon,
      angle: '+=360',
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        // Ensure alpha is maintained after rotation tween
        if (this.spinIcon && this.isDisabled) {
          this.spinIcon.setAlpha(this.DISABLED_ALPHA);
        }
      }
    });
  }

  private createSpinButtonAnimation(
    assetScale: number,
    container: Phaser.GameObjects.Container
  ): void {
    try {
      if (!ensureSpineFactory(this.scene, '[SpinButtonController]')) {
        this.scene.time.delayedCall(SPINE_FACTORY_RETRY_MS, () => {
          this.createSpinButtonAnimation(assetScale, container);
        });
        return;
      }

      if (!this.scene.cache.json.has('spin_button_animation')) {
        log.warn('Spin button animation spine assets not loaded');
        return;
      }

      if (!this.spinButton) return;

      // Create main spin button animation
      this.spinButtonAnimation = this.scene.add.spine(
        this.spinButton.x,
        this.spinButton.y,
        'spin_button_animation',
        'spin_button_animation-atlas'
      );
      
      this.spinButtonAnimation.setOrigin(0.5, 0.5);
      this.spinButtonAnimation.setScale(assetScale * 0.435);
      this.spinButtonAnimation.setDepth(9);
      this.spinButtonAnimation.animationState.timeScale = 1.3;
      this.spinButtonAnimation.setVisible(false);
      
      // Center animation on spin button
      this.centerSpineOnButton(this.spinButtonAnimation, this.spinButton);
      
      // Add to container behind spin button
      const spinIndex = container.getIndex(this.spinButton);
      container.addAt(this.spinButtonAnimation, spinIndex);
      
      log.debug('Spin button animation created');

      // Create free round animation if available
      this.createFreeRoundSpinButtonAnimation(assetScale, container);
      
    } catch (error) {
      log.warn('Failed to create spin button animation:', error);
    }
  }

  private createFreeRoundSpinButtonAnimation(
    assetScale: number,
    container: Phaser.GameObjects.Container
  ): void {
    if (!this.scene.cache.json.has('fr_spin_button_animation')) {
      return;
    }

    if (!this.spinButton) return;

    try {
      const spineScale = assetScale * 1.2;
      
      this.freeRoundSpinButtonAnimation = this.scene.add.spine(
        this.spinButton.x,
        this.spinButton.y,
        'fr_spin_button_animation',
        'fr_spin_button_animation-atlas'
      );
      
      this.freeRoundSpinButtonAnimation.setOrigin(0.5, 0.5);
      this.freeRoundSpinButtonAnimation.setScale(spineScale);
      this.freeRoundSpinButtonAnimation.setDepth(11);
      this.freeRoundSpinButtonAnimation.setVisible(false);
      
      this.centerSpineOnButton(this.freeRoundSpinButtonAnimation, this.spinButton);
      
      const spinIndex = container.getIndex(this.spinButton);
      container.addAt(this.freeRoundSpinButtonAnimation, spinIndex + 1);
      
      log.debug('Free round spin button animation created');
    } catch (error) {
      log.warn('Failed to create free round animation:', error);
    }
  }

  /**
   * Center a Spine animation on a button using visual bounds
   */
  private centerSpineOnButton(spineObj: any, button: Phaser.GameObjects.Image): void {
    if (!spineObj || !button) return;

    try {
      if (typeof spineObj.getBounds !== 'function') {
        spineObj.setPosition(button.x, button.y);
        return;
      }

      const bounds = spineObj.getBounds();
      if (!bounds?.offset || !bounds?.size) {
        spineObj.setPosition(button.x, button.y);
        return;
      }

      const centerX = bounds.offset.x + bounds.size.x * 0.5;
      const centerY = bounds.offset.y + bounds.size.y * 0.5;

      const scaleX = spineObj.scaleX ?? spineObj.scale ?? 1;
      const scaleY = spineObj.scaleY ?? spineObj.scale ?? 1;

      spineObj.x = button.x - centerX * scaleX;
      spineObj.y = button.y - centerY * scaleY;
    } catch (e) {
      log.warn('Failed to center spine on button:', e);
      spineObj.setPosition(button.x, button.y);
    }
  }
}
