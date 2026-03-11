import type { Scene } from 'phaser';
import { EventBus } from '../../EventBus';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { NetworkManager } from '../../../managers/NetworkManager';
import { ensureSpineFactory } from '../../../utils/SpineGuard';
import { gameStateManager } from '../../../managers/GameStateManager';
import { startAnimation } from '../../../utils/SpineAnimationHelper';
import type { GameData } from '../GameData';
import { SoundEffectType } from '../../../managers/AudioManager';

export interface TurboButtonCallbacks {
  getGameData: () => GameData | null;
  applyTurboSpeedModifications: () => void;
  forceApplyTurboToSceneGameData: () => void;
}

export class TurboButtonController {
  private scene: Scene;
  private controllerContainer: Phaser.GameObjects.Container;
  private primaryControllers: Phaser.GameObjects.Container;
  private buttons: Map<string, Phaser.GameObjects.Image>;
  private networkManager: NetworkManager;
  private callbacks: TurboButtonCallbacks;

  private turboButtonAnimation: any = null;

  constructor(
    scene: Scene,
    controllerContainer: Phaser.GameObjects.Container,
    primaryControllers: Phaser.GameObjects.Container,
    buttons: Map<string, Phaser.GameObjects.Image>,
    networkManager: NetworkManager,
    callbacks: TurboButtonCallbacks
  ) {
    this.scene = scene;
    this.controllerContainer = controllerContainer;
    this.primaryControllers = primaryControllers;
    this.buttons = buttons;
    this.networkManager = networkManager;
    this.callbacks = callbacks;
  }

  public createButton(
    x: number,
    y: number,
    assetScale: number,
    textStyle: Phaser.Types.GameObjects.Text.TextStyle,
    controllerTexts: Phaser.GameObjects.Text[]
  ): Phaser.GameObjects.Image {
    const turboButton = this.scene.add.image(
      x,
      y,
      'turbo_off'
    ).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
    turboButton.setInteractive();
    turboButton.on('pointerdown', () => {
      console.log('[SlotController] Turbo button clicked');
      const audioManager =
        (this.scene as any)?.audioManager || (window as any)?.audioManager;
      if (audioManager && typeof audioManager.playSoundEffect === 'function') {
        audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
      }
      this.handleTurboButtonClick();
    });
    this.buttons.set('turbo', turboButton);
    this.primaryControllers.add(turboButton);

    const turboText = this.scene.add.text(
      x,
      y + (turboButton.displayHeight * 0.5) + 15,
      'Turbo',
      textStyle
    ).setOrigin(0.5, 0.5).setDepth(10);
    this.controllerContainer.add(turboText);
    controllerTexts.push(turboText);

    return turboButton;
  }

  public createTurboButtonAnimation(scene: Scene, assetScale: number): void {
    try {
      if (!ensureSpineFactory(scene, '[SlotController] createTurboButtonAnimation')) {
        console.warn('[SlotController] Spine factory not available yet; will retry turbo spine shortly');
        scene.time.delayedCall(250, () => this.createTurboButtonAnimation(scene, assetScale));
        return;
      }

      if (!scene.cache.json.has('turbo_animation')) {
        console.warn('[SlotController] turbo_animation spine assets not loaded yet, will retry later');
        scene.time.delayedCall(1000, () => {
          this.createTurboButtonAnimation(scene, assetScale);
        });
        return;
      }

      const turboButton = this.buttons.get('turbo');
      if (!turboButton) {
        console.warn('[SlotController] Turbo button not found, cannot position animation');
        return;
      }

      this.turboButtonAnimation = scene.add.spine(
        turboButton.x,
        turboButton.y + 7,
        'turbo_animation',
        'turbo_animation-atlas'
      );

      this.turboButtonAnimation.setOrigin(0.5, 0.5);
      this.turboButtonAnimation.setScale(assetScale * 1);
      this.turboButtonAnimation.setDepth(11);
      this.turboButtonAnimation.animationState.timeScale = 1;
      this.turboButtonAnimation.setVisible(false);

      this.primaryControllers.add(this.turboButtonAnimation);

      console.log('[SlotController] Turbo button spine animation created successfully with 1.3x speed');
    } catch (error) {
      console.error('[SlotController] Error creating Spine turbo button animation:', error);
    }
  }

  public startTurboAnimation(): void {
    this.ensureTurboAnimationExists();

    if (!this.turboButtonAnimation) {
      console.warn('[SlotController] Turbo button animation not available');
      return;
    }

    try {
      this.turboButtonAnimation.setVisible(true);
      startAnimation(this.turboButtonAnimation, {
        animationName: 'animation',
        loop: true,
        fallbackToFirstAvailable: true,
        logWhenMissing: false
      });
      console.log('[SlotController] Turbo button spine animation started (looping)');
    } catch (error) {
      console.error('[SlotController] Error starting turbo button animation:', error);
    }
  }

  public stopTurboAnimation(): void {
    if (!this.turboButtonAnimation) {
      console.warn('[SlotController] Turbo button animation not available');
      return;
    }

    try {
      this.turboButtonAnimation.setVisible(false);
      this.turboButtonAnimation.animationState.clearTracks();
      console.log('[SlotController] Turbo button spine animation stopped');
    } catch (error) {
      console.error('[SlotController] Error stopping turbo button animation:', error);
    }
  }

  private ensureTurboAnimationExists(): void {
    if (!this.turboButtonAnimation && this.scene) {
      console.log('[SlotController] Turbo animation not found, recreating...');
      const assetScale = this.networkManager.getAssetScale();
      this.createTurboButtonAnimation(this.scene, assetScale);
    }
  }

  public disableButton(): void {
    const turboButton = this.buttons.get('turbo');
    if (turboButton) {
      turboButton.setAlpha(0.5);
      turboButton.setTint(0x555555);
      turboButton.disableInteractive();
      console.log('[SlotController] Turbo button disabled and greyed out');
    }
  }

  public enableButton(): void {
    const turboButton = this.buttons.get('turbo');
    if (turboButton) {
      turboButton.setAlpha(1.0);
      turboButton.clearTint();
      turboButton.setInteractive();
      console.log('[SlotController] Turbo button enabled');
    }
  }

  public updateButtonState(): void {
    const gameData = this.callbacks.getGameData();
    if (!gameData || !this.buttons.has('turbo')) {
      return;
    }

    const turboButton = this.buttons.get('turbo');
    if (!turboButton) return;

    if (gameStateManager.isReelSpinning) {
      console.log(`[SlotController] Disabling turbo button - isReelSpinning: ${gameStateManager.isReelSpinning}`);
      this.disableButton();
    } else {
      console.log('[SlotController] Enabling turbo button - not spinning');
      this.enableButton();
    }
  }

  public setTurboButtonState(isOn: boolean): void {
    const turboButton = this.buttons.get('turbo');
    if (turboButton) {
      const textureKey = isOn ? 'turbo_on' : 'turbo_off';
      turboButton.setTexture(textureKey);
      console.log(`[SlotController] Turbo button texture changed to: ${textureKey}`);
    }

    if (isOn) {
      this.startTurboAnimation();
    } else {
      this.stopTurboAnimation();
    }
  }

  public handleTurboButtonClick(): void {
    const gameData = this.callbacks.getGameData();
    if (!gameData) {
      console.error('[SlotController] GameData not available for turbo button click');
      return;
    }

    if (gameData.isTurbo) {
      console.log('[SlotController] Turning turbo OFF via button click');
      gameData.isTurbo = false;
      this.setTurboButtonState(false);
    } else {
      console.log('[SlotController] Turning turbo ON via button click');
      gameData.isTurbo = true;
      this.setTurboButtonState(true);
    }

    this.callbacks.applyTurboSpeedModifications();
    this.callbacks.forceApplyTurboToSceneGameData();

    EventBus.emit('turbo', gameData.isTurbo);

    if (gameData.isTurbo) {
      gameEventManager.emit(GameEventType.TURBO_ON);
    } else {
      gameEventManager.emit(GameEventType.TURBO_OFF);
    }

    console.log(`[SlotController] Turbo state changed to: ${gameData.isTurbo} and sent to backend`);
  }
}
