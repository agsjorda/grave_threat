/**
 * SpinButtonController - Manages spin button and related UI
 * 
 * Extracted from SlotController.ts for better code organization.
 * Handles spin button state, animations, and interactions.
 */

import type { Scene } from 'phaser';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { ensureSpineFactory } from '../../../utils/SpineGuard';
import { Logger } from '../../../utils/Logger';
import { startAnimation } from '../../../utils/SpineAnimationHelper';

const log = Logger.slot;

export interface SpinButtonCallbacks {
  onSpinRequested: () => Promise<void>;
  onSpinBlocked: (reason: string) => void;
  isAutoplayActive: () => boolean;
  stopAutoplay: () => void;
}

export class SpinButtonController {
  private scene: Scene;
  private container: Phaser.GameObjects.Container;
  private callbacks: SpinButtonCallbacks;
  
  // UI Elements
  private spinButton: Phaser.GameObjects.Image | null = null;
  private spinIcon: Phaser.GameObjects.Image | null = null;
  private spinIconTween: Phaser.Tweens.Tween | null = null;
  
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
    primaryControllers: Phaser.GameObjects.Container
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
    
    // Start continuous rotation
    this.spinIconTween = this.scene.tweens.add({
      targets: this.spinIcon,
      angle: 360,
      duration: 4000,
      repeat: -1,
      ease: 'Linear'
    });
    
    // Create spine animations
    this.createSpinButtonAnimation(assetScale, primaryControllers);
    
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
    
    // Play main animation
    if (this.spinButtonAnimation) {
      try {
        const animationName = 'animation';
        this.spinButtonAnimation.setVisible(true);
        startAnimation(this.spinButtonAnimation, {
          animationName,
          loop: false,
          fallbackToFirstAvailable: true,
          logWhenMissing: false
        });
        
        this.spinButtonAnimation.animationState.addListener({
          complete: (entry: any) => {
            if (entry.animation.name === animationName) {
              this.spinButtonAnimation.setVisible(false);
              // Ensure icon alpha is correct based on disabled state
              if (this.spinIcon) {
                if (this.isDisabled) {
                  this.spinIcon.setAlpha(this.DISABLED_ALPHA);
                } else {
                  this.spinIcon.setAlpha(1.0);
                }
              }
            }
          }
        });
        
        log.debug('Spin button animation played');
      } catch (error) {
        log.warn('Failed to play spin button animation:', error);
        this.spinButtonAnimation.setVisible(false);
        // Ensure icon alpha is correct based on disabled state
        if (this.spinIcon) {
          if (this.isDisabled) {
            this.spinIcon.setAlpha(this.DISABLED_ALPHA);
          } else {
            this.spinIcon.setAlpha(1.0);
          }
        }
      }
    }
    
    // Rotate icon briefly
    this.rotateSpinButton();
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
    
    // Check if already spinning
    if (gameStateManager.isReelSpinning) {
      this.callbacks.onSpinBlocked('Already spinning');
      return;
    }
    
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
        this.scene.time.delayedCall(250, () => {
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
