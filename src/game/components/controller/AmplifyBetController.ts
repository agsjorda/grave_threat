import type { Scene } from 'phaser';
import { EventBus } from '../../EventBus';
import { gameStateManager } from '../../../managers/GameStateManager';
import { NetworkManager } from '../../../managers/NetworkManager';
import { ensureSpineFactory } from '../../../utils/SpineGuard';
import { startAnimation } from '../../../utils/SpineAnimationHelper';
import type { GameData } from '../GameData';
import { SoundEffectType } from '../../../managers/AudioManager';

export interface AmplifyBetCallbacks {
  getGameData: () => GameData | null;
  enableFeatureButton: () => void;
  disableFeatureButton: () => void;
  applyAmplifyBetIncrease: () => void;
  restoreOriginalBetAmount: () => void;
  updateFeatureAmountFromCurrentBet: () => void;
}

export class AmplifyBetController {
  private scene: Scene;
  private controllerContainer: Phaser.GameObjects.Container;
  private buttons: Map<string, Phaser.GameObjects.Image>;
  private networkManager: NetworkManager;
  private callbacks: AmplifyBetCallbacks;

  private amplifyBetAnimation: any = null;
  private enhanceBetIdleAnimation: any = null;
  private amplifyDescriptionContainer: Phaser.GameObjects.Container | null = null;
  private amplifyBetBounceTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    scene: Scene,
    controllerContainer: Phaser.GameObjects.Container,
    buttons: Map<string, Phaser.GameObjects.Image>,
    networkManager: NetworkManager,
    callbacks: AmplifyBetCallbacks
  ) {
    this.scene = scene;
    this.controllerContainer = controllerContainer;
    this.buttons = buttons;
    this.networkManager = networkManager;
    this.callbacks = callbacks;
  }

  public createButton(
    x: number,
    y: number,
    assetScale: number,
    textStyle: Phaser.Types.GameObjects.Text.TextStyle,
    primaryControllers: Phaser.GameObjects.Container,
    controllerTexts: Phaser.GameObjects.Text[]
  ): Phaser.GameObjects.Image {
    const amplifyButton = this.scene.add.image(
      x,
      y,
      'amplify'
    ).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
    amplifyButton.setInteractive();
    amplifyButton.on('pointerdown', () => {
      console.log('[SlotController] Amplify button clicked');
      const audioManager =
        (this.scene as any)?.audioManager || (window as any)?.audioManager;
      if (audioManager && typeof audioManager.playSoundEffect === 'function') {
        audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
      }
      this.handleAmplifyButtonClick();
    });
    this.buttons.set('amplify', amplifyButton);
    primaryControllers.add(amplifyButton);

    const amplifyText = this.scene.add.text(
      x,
      y + (amplifyButton.displayHeight * 0.5) + 15,
      'Amplify Bet',
      textStyle
    ).setOrigin(0.5, 0.5).setDepth(10);
    this.controllerContainer.add(amplifyText);
    controllerTexts.push(amplifyText);

    return amplifyButton;
  }

  public createDescription(scene: Scene): void {
    const amplifyX = scene.scale.width * 0.73;
    const amplifyY = scene.scale.height * 0.833;
    const descriptionX = amplifyX;
    const descriptionY = amplifyY - 50;
    const containerWidth = 90;
    const containerHeight = 30;
    const cornerRadius = 8;

    this.amplifyDescriptionContainer = scene.add.container(0, 0);

    const descriptionBg = scene.add.graphics();
    descriptionBg.fillStyle(0x000000, 0.65);
    descriptionBg.fillRoundedRect(
      descriptionX - containerWidth / 2,
      descriptionY - containerHeight / 2,
      containerWidth,
      containerHeight,
      cornerRadius
    );
    descriptionBg.lineStyle(1, 0x00ff00, 1);
    descriptionBg.strokeRoundedRect(
      descriptionX - containerWidth / 2,
      descriptionY - containerHeight / 2,
      containerWidth,
      containerHeight,
      cornerRadius
    );
    descriptionBg.setDepth(8);
    this.amplifyDescriptionContainer.add(descriptionBg);

    const descriptionLabel1 = scene.add.text(
      descriptionX,
      descriptionY - 5,
      'Double Chance',
      {
        fontSize: '9px',
        color: '#ffffff',
        fontFamily: 'poppins-regular'
      }
    ).setOrigin(0.5, 0.5).setDepth(9);
    this.amplifyDescriptionContainer.add(descriptionLabel1);

    const descriptionLabel2 = scene.add.text(
      descriptionX,
      descriptionY + 6,
      'For Feature',
      {
        fontSize: '9px',
        color: '#ffffff',
        fontFamily: 'poppins-regular'
      }
    ).setOrigin(0.5, 0.5).setDepth(9);
    this.amplifyDescriptionContainer.add(descriptionLabel2);

    this.controllerContainer.add(this.amplifyDescriptionContainer);
  }

  public setDescriptionVisible(visible: boolean): void {
    if (this.amplifyDescriptionContainer) {
      this.amplifyDescriptionContainer.setVisible(visible);
      console.log(`[SlotController] ${visible ? 'Showing' : 'Hiding'} amplify description`);
    }
  }

  public createAmplifyBetAnimation(scene: Scene, betX: number, betY: number): void {
    try {
      if (!ensureSpineFactory(scene, '[SlotController] createAmplifyBetAnimation')) {
        return;
      }

      if (!scene.cache.json.has('amplify_bet')) {
        console.warn('[SlotController] Amplify bet spine assets not loaded');
        return;
      }

      const amplifyOffsetX = -4;
      const amplifyOffsetY = 0;

      this.amplifyBetAnimation = scene.add.spine(
        betX + amplifyOffsetX,
        betY + amplifyOffsetY,
        'amplify_bet',
        'amplify_bet-atlas'
      );

      this.amplifyBetAnimation.setScale(1);
      this.amplifyBetAnimation.setDepth(7);
      this.amplifyBetAnimation.setVisible(false);

      this.controllerContainer.add(this.amplifyBetAnimation);
      console.log('[SlotController] Amplify bet animation created');
    } catch (error) {
      console.warn('[SlotController] Failed to create amplify bet animation:', error);
    }
  }

  public createEnhanceBetIdleAnimation(scene: Scene, betX: number, betY: number): void {
    try {
      if (!ensureSpineFactory(scene, '[SlotController] createEnhanceBetIdleAnimation')) {
        return;
      }

      if (!scene.cache.json.has('enhance_bet_idle_on')) {
        console.warn('[SlotController] Enhance bet idle spine assets not loaded');
        return;
      }

      const targetX = this.amplifyBetAnimation ? this.amplifyBetAnimation.x : (betX - 4);
      const targetY = this.amplifyBetAnimation ? this.amplifyBetAnimation.y : betY;

      this.enhanceBetIdleAnimation = scene.add.spine(
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
      this.controllerContainer.add(this.enhanceBetIdleAnimation);
    } catch (error) {
      console.warn('[SlotController] Failed to create enhance bet idle animation:', error);
    }
  }

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

  public hideEnhanceBetIdleLoop(): void {
    if (!this.enhanceBetIdleAnimation) return;

    this.enhanceBetIdleAnimation.animationState.clearTracks();
    this.enhanceBetIdleAnimation.setVisible(false);
  }

  public handleAmplifyButtonClick(): void {
    const gameData = this.callbacks.getGameData();
    if (!gameData) {
      console.error('[SlotController] GameData not available for amplify button click');
      return;
    }

    if (gameData.isEnhancedBet) {
      console.log('[SlotController] Turning amplify bet OFF via button click');
      gameData.isEnhancedBet = false;
      this.setAmplifyButtonState(false);
      this.hideAmplifyBetAnimation();
      this.hideEnhanceBetIdleLoop();
      this.callbacks.restoreOriginalBetAmount();

      if (!gameStateManager.isBonus) {
        this.callbacks.enableFeatureButton();
      }
    } else {
      console.log('[SlotController] Turning amplify bet ON via button click');
      gameData.isEnhancedBet = true;
      this.setAmplifyButtonState(true);
      this.triggerAmplifyBetAnimation();
      this.callbacks.applyAmplifyBetIncrease();

      this.callbacks.disableFeatureButton();
    }

    this.controlAmplifyBetAnimation();
    EventBus.emit('amplify', gameData.isEnhancedBet);
    console.log(`[SlotController] Amplify bet state changed to: ${gameData.isEnhancedBet}`);
  }

  public disableButton(): void {
    const amplifyButton = this.buttons.get('amplify');
    if (amplifyButton) {
      amplifyButton.setAlpha(0.5);
      amplifyButton.removeInteractive();
      console.log('[SlotController] Amplify button disabled');
    }
  }

  public enableButton(): void {
    const amplifyButton = this.buttons.get('amplify');
    if (amplifyButton) {
      amplifyButton.setAlpha(1.0);
      amplifyButton.clearTint();
      amplifyButton.setInteractive();
      console.log('[SlotController] Amplify button enabled');
    }
  }

  public setAmplifyButtonState(isOn: boolean): void {
    const amplifyButton = this.buttons.get('amplify');
    if (amplifyButton) {
      if (isOn) {
        amplifyButton.setTint(0xffff00);
      } else {
        amplifyButton.clearTint();
      }
      console.log(`[SlotController] Amplify button state changed to: ${isOn ? 'ON' : 'OFF'}`);
    }
  }

  public initializeAmplifyButtonState(): void {
    const gameData = this.callbacks.getGameData();
    if (!gameData) {
      return;
    }

    this.setAmplifyButtonState(gameData.isEnhancedBet);
    this.controlAmplifyBetAnimation();

    if (gameData.isEnhancedBet) {
      this.callbacks.disableFeatureButton();
    }

    console.log(`[SlotController] Amplify button initialized with state: ${gameData.isEnhancedBet ? 'ON' : 'OFF'}`);
  }

  public controlAmplifyBetAnimation(): void {
    const gameData = this.callbacks.getGameData();
    if (!gameData) {
      return;
    }

    this.stopAmplifyBetBouncing();

    if (!gameData.isEnhancedBet) {
      this.hideEnhanceBetIdleLoop();
    }
  }

  public startAmplifyBetBouncing(): void {
    const amplifyButton = this.buttons.get('amplify');
    if (!amplifyButton || !this.scene) {
      console.warn('[SlotController] Amplify button or scene not available for pulsing');
      return;
    }

    if (this.amplifyBetBounceTimer) {
      this.amplifyBetBounceTimer.destroy();
    }

    this.scene.tweens.add({
      targets: amplifyButton,
      scaleX: amplifyButton.scaleX * 1.1,
      scaleY: amplifyButton.scaleY * 1.1,
      duration: 500,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    console.log('[SlotController] Amplify button pulsing started');
  }

  public stopAmplifyBetBouncing(): void {
    const amplifyButton = this.buttons.get('amplify');
    if (amplifyButton && this.scene) {
      this.scene.tweens.killTweensOf(amplifyButton);

      const originalScale = this.getAmplifyButtonOriginalScale();
      amplifyButton.setScale(originalScale, originalScale);
    }

    if (this.amplifyBetBounceTimer) {
      this.amplifyBetBounceTimer.destroy();
      this.amplifyBetBounceTimer = null;
    }

    console.log('[SlotController] Amplify button pulsing stopped');
  }

  private getAmplifyButtonOriginalScale(): number {
    const assetScale = this.networkManager.getAssetScale();
    return assetScale;
  }

  public triggerAmplifyBetAnimation(): void {
    const gameData = this.callbacks.getGameData();
    if (!gameData || !gameData.isEnhancedBet) {
      console.log('[SlotController] Amplify bet not active, skipping animation');
      return;
    }

    if (this.amplifyBetAnimation) {
      this.amplifyBetAnimation.animationState.clearTracks();
      this.amplifyBetAnimation.animationState.clearListeners();
      this.amplifyBetAnimation.skeleton.setToSetupPose();
      this.amplifyBetAnimation.animationState.setEmptyAnimation(0, 0);
      this.amplifyBetAnimation.setVisible(false);

      this.scene?.time.delayedCall(50, () => {
        this.amplifyBetAnimation.setVisible(true);
        this.playAmplifyBetAnimation();
      });
    }
  }

  private playAmplifyBetAnimation(): void {
    if (!this.amplifyBetAnimation) {
      console.warn('[SlotController] Amplify bet animation not available for playing');
      return;
    }

    const animationName = 'animation';
    const animations = this.amplifyBetAnimation.skeleton?.data.animations || [];
    const playedAnimation = startAnimation(this.amplifyBetAnimation, {
      animationName,
      fallbackAnimationName: animations[0]?.name,
      fallbackToFirstAvailable: true,
      loop: false,
      logWhenMissing: false
    });

    if (!playedAnimation) {
      console.warn('[SlotController] No animations found for amplify bet spine');
      return;
    }

    this.amplifyBetAnimation.animationState.addListener({
      complete: (entry: any) => {
        if (entry.animation.name === playedAnimation) {
          this.amplifyBetAnimation.setVisible(false);
          console.log('[SlotController] Amplify bet animation completed and hidden');
          const gameData = this.callbacks.getGameData();
          if (gameData && gameData.isEnhancedBet) {
            this.showEnhanceBetIdleLoop();
          }
        }
      }
    });
    console.log('[SlotController] Playing amplify bet animation once:', playedAnimation);
  }

  public hideAmplifyBetAnimation(): void {
    if (this.amplifyBetAnimation) {
      this.amplifyBetAnimation.setVisible(false);
      this.amplifyBetAnimation.animationState.clearTracks();
      console.log('[SlotController] Amplify bet animation hidden and stopped');
    }
  }

  public resetAmplifyBetOnBetChange(): void {
    const gameData = this.callbacks.getGameData();
    if (!gameData || !gameData.isEnhancedBet) {
      return;
    }

    console.log('[SlotController] Bet amount changed externally - resetting amplify bet state');

    gameData.isEnhancedBet = false;
    this.setAmplifyButtonState(false);
    this.hideAmplifyBetAnimation();
    this.hideEnhanceBetIdleLoop();
    this.stopAmplifyBetBouncing();
    this.callbacks.updateFeatureAmountFromCurrentBet();

    console.log('[SlotController] Amplify bet state reset due to bet change');
  }
}
