import type { Scene } from 'phaser';

/**
 * HudController - Owns direct HUD mutation for spin, autoplay, bet, feature,
 * turbo, and amplify controls.
 *
 * Owned by: SlotController. Created once per scene and used as the low-level
 * UI mutator for button enable/disable and visibility changes.
 *
 * Why this exists:
 * - SlotController still decides *when* controls should change.
 * - HudController is responsible for *how* the visible HUD is updated.
 * - This keeps the repetitive Phaser UI mutation code in one place.
 *
 * Callers:
 * - SlotController.lockControlsForSpinAction()
 * - SlotController.lockControlsForScatterOrBonus()
 * - SlotController.reenableHudAfterSpinLikeShuten()
 * - SlotController.setExternalControlLock()
 * - BuyFeatureController via SlotController's coarse lock/unlock callbacks
 */
export interface HudControllerCallbacks {
  getScene: () => Scene | null;
  getControllerContainer: () => Phaser.GameObjects.Container | null;
  getButtons: () => Map<string, Phaser.GameObjects.Image>;
  getBetAmountText: () => Phaser.GameObjects.Text | null;
  getFeatureAmountText: () => Phaser.GameObjects.Text | null;
  getFeatureDollarText: () => Phaser.GameObjects.Text | null;
  getFeatureLabelText: () => Phaser.GameObjects.Text | null;
  getFeatureLabelContainer: () => Phaser.GameObjects.Container | null;
  getFeatureButtonHitbox: () => Phaser.GameObjects.Rectangle | null;
}

export class HudController {
  private readonly disabledAlpha: number = 0.7;
  private readonly disabledTint: number = 0x666666;

  constructor(private readonly callbacks: HudControllerCallbacks) {}

  public disableSpinButton(): void {
    const spinButton = this.callbacks.getButtons().get('spin');
    if (spinButton) {
      // Match grave_threat: spin button stays fully opaque and is only tinted.
      spinButton.setAlpha(1.0);
      spinButton.setTint(this.disabledTint);
      spinButton.disableInteractive();
    }
  }

  public enableSpinButton(): void {
    const spinButton = this.callbacks.getButtons().get('spin');
    if (spinButton) {
      spinButton.setAlpha(1.0);
      spinButton.clearTint();
      spinButton.setInteractive();
    }
  }

  public disableAutoplayButton(): void {
    const autoplayButton = this.callbacks.getButtons().get('autoplay');
    if (autoplayButton) {
      autoplayButton.setAlpha(this.disabledAlpha);
      autoplayButton.setTint(this.disabledTint);
      autoplayButton.disableInteractive();
    }
  }

  public enableAutoplayButton(): void {
    const autoplayButton = this.callbacks.getButtons().get('autoplay');
    if (autoplayButton) {
      autoplayButton.setAlpha(1.0);
      autoplayButton.clearTint();
      autoplayButton.setInteractive();
    }
  }

  public disableBetButtons(): void {
    const buttons = this.callbacks.getButtons();
    const buttonKeys = ['betminus', 'betplus'];
    for (const key of buttonKeys) {
      const button = buttons.get(key);
      if (button) {
        button.setAlpha(0.5);
        button.setTint(0x555555);
        button.disableInteractive();
      }
    }
    const betAmountText = this.callbacks.getBetAmountText();
    if (betAmountText) {
      betAmountText.setAlpha(0.5);
      betAmountText.disableInteractive();
    }
  }

  public enableBetButtons(): void {
    const buttons = this.callbacks.getButtons();
    const buttonKeys = ['betminus', 'betplus'];
    for (const key of buttonKeys) {
      const button = buttons.get(key);
      if (button) {
        button.setAlpha(1.0);
        button.clearTint();
        button.setInteractive();
      }
    }
    const betAmountText = this.callbacks.getBetAmountText();
    if (betAmountText) {
      betAmountText.setAlpha(1.0);
      betAmountText.setInteractive();
    }
  }

  public disableFeatureButton(): void {
    const featureButton = this.callbacks.getButtons().get('feature');
    if (featureButton) {
      featureButton.setAlpha(this.disabledAlpha);
      featureButton.setTint(this.disabledTint);
      featureButton.disableInteractive();
    }

    const featureAmountText = this.callbacks.getFeatureAmountText();
    if (featureAmountText) {
      featureAmountText.setAlpha(this.disabledAlpha);
    }

    const featureDollarText = this.callbacks.getFeatureDollarText();
    if (featureDollarText) {
      featureDollarText.setAlpha(this.disabledAlpha);
    }

    const featureLabelText = this.callbacks.getFeatureLabelText();
    if (featureLabelText) {
      featureLabelText.setAlpha(this.disabledAlpha);
    }

    const featureLabelContainer = this.callbacks.getFeatureLabelContainer();
    if (featureLabelContainer) {
      featureLabelContainer.setAlpha(this.disabledAlpha);
    }

    const featureButtonHitbox = this.callbacks.getFeatureButtonHitbox();
    if (featureButtonHitbox) {
      featureButtonHitbox.disableInteractive();
    }
  }

  public enableFeatureButton(): void {
    const featureButton = this.callbacks.getButtons().get('feature');
    if (featureButton) {
      featureButton.setAlpha(1.0);
      featureButton.clearTint();
      featureButton.setInteractive();
    }

    const featureAmountText = this.callbacks.getFeatureAmountText();
    if (featureAmountText) {
      featureAmountText.setAlpha(1.0);
    }

    const featureDollarText = this.callbacks.getFeatureDollarText();
    if (featureDollarText) {
      featureDollarText.setAlpha(1.0);
    }

    const featureLabelText = this.callbacks.getFeatureLabelText();
    if (featureLabelText) {
      featureLabelText.setAlpha(1.0);
    }

    const featureLabelContainer = this.callbacks.getFeatureLabelContainer();
    if (featureLabelContainer) {
      featureLabelContainer.setAlpha(1.0);
    }

    const featureButtonHitbox = this.callbacks.getFeatureButtonHitbox();
    if (featureButtonHitbox) {
      featureButtonHitbox.setInteractive();
    }
  }

  public disableTurboButton(): void {
    const turboButton = this.callbacks.getButtons().get('turbo');
    if (turboButton) {
      turboButton.setAlpha(this.disabledAlpha);
      turboButton.setTint(this.disabledTint);
      turboButton.disableInteractive();
    }
  }

  public enableTurboButton(): void {
    const turboButton = this.callbacks.getButtons().get('turbo');
    if (turboButton) {
      turboButton.setAlpha(1.0);
      turboButton.clearTint();
      turboButton.setInteractive();
    }
  }

  public disableAmplifyButton(alpha: number = 0.5): void {
    const amplifyButton = this.callbacks.getButtons().get('amplify');
    if (amplifyButton) {
      amplifyButton.setAlpha(alpha);
      amplifyButton.setTint(this.disabledTint);
      amplifyButton.disableInteractive();
    }
  }

  public enableAmplifyButton(): void {
    const amplifyButton = this.callbacks.getButtons().get('amplify');
    if (amplifyButton) {
      amplifyButton.setAlpha(1.0);
      amplifyButton.clearTint();
      amplifyButton.setInteractive();
    }
  }

  public disableBetBackgroundInteraction(reason: string = ''): void {
    const controllerContainer = this.callbacks.getControllerContainer();
    if (controllerContainer) {
      controllerContainer.iterate((child: any) => {
        if (child && child.getData && child.getData('isBetBackground')) {
          child.disableInteractive();
          const suffix = reason ? ` (${reason})` : '';
          void suffix;
        }
      });
    }

    const betAmountText = this.callbacks.getBetAmountText();
    if (betAmountText) {
      betAmountText.disableInteractive();
    }
  }

  public enableBetBackgroundInteraction(reason: string = ''): void {
    const controllerContainer = this.callbacks.getControllerContainer();
    if (controllerContainer) {
      controllerContainer.iterate((child: any) => {
        if (child && child.getData && child.getData('isBetBackground')) {
          child.setInteractive();
          const suffix = reason ? ` (${reason})` : '';
          void suffix;
        }
      });
    }

    const betAmountText = this.callbacks.getBetAmountText();
    if (betAmountText) {
      betAmountText.setInteractive();
    }
  }

  public setBuyFeatureVisible(visible: boolean): void {
    const featureButton = this.callbacks.getButtons().get('feature');
    if (featureButton) {
      featureButton.setVisible(visible);
      if (visible) featureButton.setAlpha(1.0);
    }

    const featureAmountText = this.callbacks.getFeatureAmountText();
    if (featureAmountText) {
      featureAmountText.setVisible(visible);
      if (visible) featureAmountText.setAlpha(1.0);
    }

    const featureDollarText = this.callbacks.getFeatureDollarText();
    if (featureDollarText) {
      featureDollarText.setVisible(visible);
      if (visible) featureDollarText.setAlpha(1.0);
    }

    const featureLabelText = this.callbacks.getFeatureLabelText();
    if (featureLabelText) {
      featureLabelText.setVisible(visible);
      if (visible) featureLabelText.setAlpha(1.0);
    }

    const featureLabelContainer = this.callbacks.getFeatureLabelContainer();
    if (featureLabelContainer) {
      featureLabelContainer.setVisible(visible);
      if (visible) featureLabelContainer.setAlpha(1.0);
    }

    const featureButtonHitbox = this.callbacks.getFeatureButtonHitbox();
    if (featureButtonHitbox) featureButtonHitbox.setVisible(visible);
  }
}