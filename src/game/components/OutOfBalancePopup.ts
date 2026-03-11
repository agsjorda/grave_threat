import { Scene, GameObjects } from 'phaser';
import { SoundEffectType } from '../../managers/AudioManager';

export class OutOfBalancePopup extends GameObjects.Container {
    private background: GameObjects.Graphics;
    private messageText: GameObjects.Text;
    private buttonImage: GameObjects.Image;
    private buttonText: GameObjects.Text;
    private backgroundColor: number = 0x000000;
    private backgroundAlpha: number = 0.4;
    private cornerRadius: number = 20;
    private buttonOffsetY: number = 130;
    private buttonScale: number = 0.8;
    private buttonWidth: number = 364;
    private buttonHeight: number = 62;
    private animationDuration: number = 300;
    private overlay: Phaser.GameObjects.Graphics;

    constructor(scene: Scene, x: number = 0, y: number = 0, options: {
        opacity?: number,
        cornerRadius?: number,
        buttonOffsetY?: number,
        buttonScale?: number,
        overlayColor?: number,
        overlayAlpha?: number
    } = {}) {
        super(scene, x, y);
        this.scene = scene;

        this.overlay = new GameObjects.Graphics(scene);
        this.overlay.fillStyle(options.overlayColor || 0x000000, options.overlayAlpha !== undefined ?
            Phaser.Math.Clamp(options.overlayAlpha, 0, 1) : 0.35);
        this.overlay.fillRect(0, 0, scene.scale.width, scene.scale.height);
        this.overlay.setScrollFactor(0);
        this.overlay.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, scene.scale.width, scene.scale.height),
            Phaser.Geom.Rectangle.Contains
        );
        this.overlay.visible = false;
        scene.add.existing(this.overlay);

        if (options.opacity !== undefined) {
            this.backgroundAlpha = Phaser.Math.Clamp(options.opacity, 0, 1);
        }
        if (options.cornerRadius !== undefined) {
            this.cornerRadius = Math.max(0, options.cornerRadius);
        }
        if (options.buttonOffsetY !== undefined) {
            this.buttonOffsetY = options.buttonOffsetY;
        }
        if (options.buttonScale !== undefined) {
            this.buttonScale = Phaser.Math.Clamp(options.buttonScale, 0.1, 2);
        }

        this.background = new Phaser.GameObjects.Graphics(scene);
        this.drawBackground();

        this.messageText = new GameObjects.Text(
            scene,
            0,
            -40,
            'Insufficient balance.\nYour balance is too low to place this bet.\nPlease add funds or adjust your bet.',
            {
                fontFamily: 'Poppins-Regular',
                fontSize: '21px',
                color: '#ffffff',
                align: 'center',
                wordWrap: { width: scene.scale.width * 0.7, useAdvancedWrap: true }
            }
        );
        this.messageText.setOrigin(0.5);

        const buttonX = 0;
        const buttonY = this.buttonOffsetY;
        const scaledWidth = this.buttonWidth * this.buttonScale;
        const scaledHeight = this.buttonHeight * this.buttonScale;

        this.buttonImage = new GameObjects.Image(
            scene,
            buttonX,
            buttonY,
            'long_button'
        );
        this.buttonImage.setOrigin(0.5, 0.5);
        this.buttonImage.setDisplaySize(scaledWidth, scaledHeight);
        this.buttonImage.setScale(this.buttonScale);

        this.buttonText = new GameObjects.Text(
            scene,
            buttonX,
            buttonY,
            'OK',
            {
                fontFamily: 'Poppins-Bold',
                fontSize: '24px',
                color: '#000000',
                align: 'center'
            }
        );
        this.buttonText.setOrigin(0.5);

        this.buttonImage.setInteractive({ useHandCursor: true });
        this.buttonImage.on('pointerdown', () => {
            const audioManager =
                (this.scene as any)?.audioManager || (window as any)?.audioManager;
            if (audioManager && typeof audioManager.playSoundEffect === 'function') {
                audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
            }
            this.hide();
        });
        this.buttonImage.on('pointerover', () => {
            this.buttonImage.setTint(0xcccccc);
        });
        this.buttonImage.on('pointerout', () => {
            this.buttonImage.clearTint();
        });

        this.add([this.background, this.messageText, this.buttonImage, this.buttonText]);
        this.setPosition(scene.scale.width / 2, scene.scale.height / 2);
        this.setVisible(false);
        scene.add.existing(this);
    }

    public show(): void {
        this.overlay.setVisible(true);
        this.overlay.setDepth(9999);
        this.setVisible(true);
        this.setDepth(10000);
        this.setScale(0.5);
        this.setAlpha(0);
        this.scene.tweens.add({
            targets: this,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: this.animationDuration,
            ease: 'Back.Out',
            onStart: () => {
                if ((window as any).audioManager) {
                    (window as any).audioManager.playSoundEffect('popup_open');
                }
            }
        });
    }

    public hide(callback?: () => void): void {
        this.scene.tweens.add({
            targets: this,
            scaleX: 0.5,
            scaleY: 0.5,
            alpha: 0,
            duration: this.animationDuration * 0.8,
            ease: 'Back.In',
            onComplete: () => {
                this.setVisible(false);
                this.overlay.setVisible(false);
                if (callback) callback();
            }
        });
    }

    public updateMessage(message: string): void {
        this.messageText.setText(message);
    }

    public setBackgroundOpacity(opacity: number): void {
        this.backgroundAlpha = Phaser.Math.Clamp(opacity, 0, 1);
        this.drawBackground();
    }

    private drawBackground(): void {
        const width = this.scene.scale.width * 0.8;
        const height = this.scene.scale.height * 0.4;
        this.background.clear();
        this.background.fillStyle(this.backgroundColor, this.backgroundAlpha);
        this.background.fillRoundedRect(
            -width / 2,
            -height / 2,
            width,
            height,
            this.cornerRadius
        );
    }

    public setBackgroundColor(color: number): void {
        this.backgroundColor = color;
        this.drawBackground();
    }

    public setCornerRadius(radius: number): void {
        this.cornerRadius = Math.max(0, radius);
        this.drawBackground();
    }

    public setButtonOffsetY(offsetY: number): void {
        this.buttonOffsetY = offsetY;
        this.buttonImage.setY(offsetY);
        this.buttonText.setY(offsetY);
    }

    public setButtonScale(scale: number): void {
        this.buttonScale = Phaser.Math.Clamp(scale, 0.1, 2);
        const scaledWidth = this.buttonWidth * this.buttonScale;
        const scaledHeight = this.buttonHeight * this.buttonScale;
        this.buttonImage.setDisplaySize(scaledWidth, scaledHeight);
        this.buttonImage.setScale(this.buttonScale);
        const fontSize = Math.max(16, 24 * this.buttonScale);
        this.buttonText.setFontSize(`${fontSize}px`);
    }

    public destroy(fromScene?: boolean): void {
        if (this.overlay) {
            this.overlay.destroy();
        }
        super.destroy(fromScene);
    }
}

