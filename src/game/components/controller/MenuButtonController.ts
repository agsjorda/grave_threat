import type { Scene } from 'phaser';
import { EventBus } from '../../EventBus';
import { SoundEffectType } from '../../../managers/AudioManager';

export class MenuButtonController {
  private scene: Scene;
  private controllerContainer: Phaser.GameObjects.Container;
  private primaryControllers: Phaser.GameObjects.Container;
  private buttons: Map<string, Phaser.GameObjects.Image>;

  constructor(
    scene: Scene,
    controllerContainer: Phaser.GameObjects.Container,
    primaryControllers: Phaser.GameObjects.Container,
    buttons: Map<string, Phaser.GameObjects.Image>
  ) {
    this.scene = scene;
    this.controllerContainer = controllerContainer;
    this.primaryControllers = primaryControllers;
    this.buttons = buttons;
  }

  public createButton(
    x: number,
    y: number,
    assetScale: number,
    textStyle: Phaser.Types.GameObjects.Text.TextStyle,
    controllerTexts: Phaser.GameObjects.Text[]
  ): Phaser.GameObjects.Image {
    const menuButton = this.scene.add.image(
      x,
      y,
      'menu'
    ).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
    menuButton.setInteractive();
    menuButton.on('pointerdown', () => {
      console.log('[SlotController] Menu button clicked');
      const audioManager =
        (this.scene as any)?.audioManager || (window as any)?.audioManager;
      if (audioManager && typeof audioManager.playSoundEffect === 'function') {
        audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
      }
      EventBus.emit('menu');
    });
    this.buttons.set('menu', menuButton);
    this.primaryControllers.add(menuButton);

    const menuText = this.scene.add.text(
      x,
      y + (menuButton.displayHeight * 0.5) + 15,
      'Menu',
      textStyle
    ).setOrigin(0.5, 0.5).setDepth(10);
    this.controllerContainer.add(menuText);
    controllerTexts.push(menuText);

    return menuButton;
  }
}
