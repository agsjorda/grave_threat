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
  onSpinClickFeedback?: () => void;
  onAbortManualSpin?: () => void;
  isAutoplaySpinControlActive?: () => boolean;
  isManualSpinSkipConsumed?: () => boolean;
  onManualSpinSkip?: () => boolean;
  onPrepareManualSpin?: () => void;
  isManualSpinClickInFlight?: () => boolean;
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
  /**
   * Disable spin button — flag + icon-tween only.
   *
   * The spin button image's tint + interactivity are owned by
   * HudController.disableSpinButton(keepActiveLook). The spin icon's alpha/tint
   * + the autoplay-stop overlay's visibility are orchestrated by
   * SlotController.updateSpinButtonVisualMode().
   *
   * Touching spinButton.setTint() / disableInteractive() here would silently
   * override HudController's "keep active look" branch and hide the spine
   * click-feedback animation (see SKIP_QUEUEING_AND_ANIMATION_PORTING_GUIDE.md §8).
   * Touching spinIcon.setAlpha(0.5) here covers the spine animation regardless of
   * HudController state.
   */
  public disable(): void {
    this.isDisabled = true; // Set flag first
    // Mirror mars_triumph: keep spin icon fully visible (its visibility is then
    // toggled by SlotController.updateSpinButtonVisualMode()). The actual spin
    // button image visual is owned by HudController.disableSpinButton(keepActiveLook).
    if (this.spinIcon) {
      this.spinIcon.setAlpha(1.0);
      this.spinIcon.clearTint();
    }
    if (this.spinIconTween) {
      this.spinIconTween.pause(); // Pause icon rotation
    }
    log.debug('Spin button disabled (flag + icon tween only; button visual owned by HudController)');
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
    // Mirror mars_triumph: keep spin icon fully visible at the start of the click animation.
    // The icon at alpha=0.5 visually obscures the spine click-feedback (red-bordered square)
    // playing behind it. Visibility of the spin icon during active-spin is then toggled by
    // SlotController.updateSpinButtonVisualMode() — this method only resets the visual state.
    if (this.spinIcon) {
      this.spinIcon.setAlpha(1.0);
      this.spinIcon.clearTint();
    }

    const isInFreeRoundSpins = this.callbacks.isInFreeRoundSpins?.() === true;
    const targetAnimation = isInFreeRoundSpins && this.freeRoundSpinButtonAnimation
      ? this.freeRoundSpinButtonAnimation
      : this.spinButtonAnimation;

    if (!targetAnimation) {
      log.warn('[SpinButtonController] playSpinAnimation: targetAnimation is null — createSpinButtonAnimation likely bailed at cache.json.has guard');
      return;
    }

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

      // Use mars_triumph's direct setAnimation call for the main spin button case.
      // The startAnimationWithEntry helper validates against getAvailableAnimations() which
      // can return empty on this spine plugin version (the skeleton's animations field is
      // parsed as an object map, not an array), causing the helper to return null and the
      // spine to be hidden — even though the 'animation' track exists. Direct call bypasses
      // that validation; the plugin looks up the animation lazily.
      let playedAnimationName = animationName;
      let trackEntry: any = null;

      if (targetAnimation === this.spinButtonAnimation) {
        try {
          trackEntry = targetAnimation.animationState.setAnimation(0, animationName, false);
          log.debug(`Spin button animation '${animationName}' started via direct setAnimation`);
        } catch (directErr) {
          log.warn(`Direct setAnimation('${animationName}') failed:`, directErr);
          targetAnimation.setVisible(false);
          return;
        }
      } else {
        // Free-round path uses the helper (different spine asset, different track name).
        const startResult = startAnimationWithEntry(targetAnimation, {
          animationName,
          loop: false,
          timeScale: 1,
          fallbackToFirstAvailable: true,
          logWhenMissing: false
        });
        if (!startResult) {
          try {
            trackEntry = targetAnimation.animationState.setAnimation(0, animationName, false);
            log.debug('Free-round spin animation started via direct fallback');
          } catch (directErr) {
            log.warn('Free-round spin animation could not start:', directErr);
            targetAnimation.setVisible(false);
            return;
          }
        } else {
          playedAnimationName = startResult.animationName;
          trackEntry = startResult.entry;
        }
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
            // Mirror mars_triumph: keep spin icon visible after spin animation completes.
            if (this.spinIcon) {
              this.spinIcon.setAlpha(1.0);
            }
          }
        }
      });

      log.debug('Spin button animation played');
    } catch (error) {
      log.warn('Failed to play spin button animation:', error);
      targetAnimation.setVisible(false);
      if (this.spinIcon) {
        // Mirror mars_triumph: keep icon visible after spin animation completes (or fails).
        this.spinIcon.setAlpha(1.0);
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

  public pauseSpinIconTween(): void {
    try { this.spinIconTween?.pause(); } catch {}
  }

  public resumeSpinIconTween(): void {
    try { this.spinIconTween?.resume(); } catch {}
  }

  public playSpinButtonClickFeedback(): void {
    this.playSpinAnimation();
    this.rotateSpinButton();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Beelze_bop parity: every tap plays full click visuals; skip may no-op without
   * suppressing spine pulse / icon rotation / SFX.
   */
  private async handleSpinButtonClick(): Promise<void> {
    log.debug('Spin button clicked');

    if (this.isDisabled) {
      if (gameStateManager.isReelSpinning || gameStateManager.isProcessingSpin) {
        this.callbacks.onSpinBlocked('Already spinning');
      }
      return;
    }

    try { this.callbacks.onSpinClickFeedback?.(); } catch {}

    if (this.callbacks.isAutoplaySpinControlActive?.()) {
      log.debug('Stopping autoplay via spin button');
      this.callbacks.stopAutoplay();
      return;
    }

    if (this.callbacks.isManualSpinSkipConsumed?.()) {
      return;
    }

    if (this.callbacks.onManualSpinSkip?.()) {
      return;
    }

    if (
      this.callbacks.isManualSpinClickInFlight?.() ||
      gameStateManager.isProcessingSpin ||
      this.callbacks.isSpinLocked?.()
    ) {
      log.debug('Spin button click ignored - spin already starting');
      return;
    }

    if (gameStateManager.isProcessingSpin) {
      this.callbacks.onSpinBlocked('Already processing spin');
      return;
    }
    if (gameStateManager.isReelSpinning) {
      this.callbacks.onSpinBlocked('Already spinning');
      return;
    }

    const now = Date.now();
    const isReelSpinning = gameStateManager.isReelSpinning;
    if (!isReelSpinning && now - this.lastClickAt < this.clickDebounceMs) {
      log.debug('Spin button click ignored - debounce');
      return;
    }
    this.lastClickAt = now;

    if (this.callbacks.isAutoplayActive()) {
      log.debug('Stopping autoplay via spin button');
      this.callbacks.stopAutoplay();
      return;
    }
    
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
    
    try { this.callbacks.onPrepareManualSpin?.(); } catch {}

    this.callbacks.onSpinClickStarted?.();

    this.disable();
    
    try {
      await this.callbacks.onSpinRequested();
    } catch (error) {
      log.warn('Spin request failed:', error);
      try { this.callbacks.onAbortManualSpin?.(); } catch {}
      this.enable();
    }
  }

  private rotateSpinButton(): void {
    if (!this.spinIcon) return;

    try { this.scene.tweens.killTweensOf(this.spinIcon); } catch {}
    
    // Quick rotation effect
    this.scene.tweens.add({
      targets: this.spinIcon,
      angle: '+=360',
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        // Mirror mars_triumph: keep icon fully visible after rotation. The previous
        // alpha=0.5 reset visually grayed out the icon and obscured the spine
        // click-feedback animation playing behind the button.
        if (this.spinIcon) {
          this.spinIcon.setAlpha(1.0);
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
