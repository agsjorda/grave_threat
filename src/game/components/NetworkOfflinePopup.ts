import { Scene, GameObjects } from 'phaser';
import { SoundEffectType } from '../../managers/AudioManager';
import { getGlobalAudioManager, playSoundEffectSafe } from '../../utils/AudioHelpers';
import { localizationManager } from '../../managers/LocalizationManager';
import { POPUP_NETWORK_OFFLINE, COMMON_OK, LOCALIZATION_DEFAULTS } from '../../backend/LocalizationData';

export class NetworkOfflinePopup extends GameObjects.Container {
	private getPopupText(key: string): string {
		return localizationManager.getTextByKey(key) ?? LOCALIZATION_DEFAULTS[key] ?? key;
	}

	private background: GameObjects.Graphics;
	private messageText: GameObjects.Text;
	private buttonImage: GameObjects.Image;
	private buttonText: GameObjects.Text;
	private backgroundColor: number = 0x000000;
	private backgroundAlpha: number = 0.8;
	private cornerRadius: number = 20;
	/** OK button center Y; matches OutOfBalancePopup (inset from panel bottom). */
	private buttonOffsetY: number = 130;
	private buttonScale: number = 0.8;
	private buttonWidth: number = 364;
	private buttonHeight: number = 62;
	private animationDuration: number = 300;
	private overlay: Phaser.GameObjects.Graphics;
	private onHideCallback?: () => void;

	constructor(
		scene: Scene,
		x: number = 0,
		y: number = 0,
		options: {
			opacity?: number;
			cornerRadius?: number;
			buttonOffsetY?: number;
			buttonScale?: number;
			overlayColor?: number;
			overlayAlpha?: number;
			/** Called when the popup is hidden (e.g. user clicked OK). Use to clear PopupManager state. */
			onHideCallback?: () => void;
		} = {}
	) {
		super(scene, x, y);
		this.scene = scene;

		this.overlay = new GameObjects.Graphics(scene);
		this.overlay.fillStyle(
			options.overlayColor || 0x000000,
			options.overlayAlpha !== undefined ? Phaser.Math.Clamp(options.overlayAlpha, 0, 1) : 0.35
		);
		this.overlay.fillRect(0, 0, scene.scale.width, scene.scale.height);
		this.overlay.setScrollFactor(0);
		this.overlay.setInteractive(
			new Phaser.Geom.Rectangle(0, 0, scene.scale.width, scene.scale.height),
			Phaser.Geom.Rectangle.Contains
		);
		this.overlay.visible = false;
		scene.add.existing(this.overlay);

		if (options.opacity !== undefined) this.backgroundAlpha = Phaser.Math.Clamp(options.opacity, 0, 1);
		if (options.cornerRadius !== undefined) this.cornerRadius = Math.max(0, options.cornerRadius);
		if (options.buttonOffsetY !== undefined) this.buttonOffsetY = options.buttonOffsetY;
		if (options.buttonScale !== undefined) this.buttonScale = Phaser.Math.Clamp(options.buttonScale, 0.1, 2);
		if (options.onHideCallback !== undefined) this.onHideCallback = options.onHideCallback;

		this.background = new Phaser.GameObjects.Graphics(scene);
		this.drawBackground();

		this.messageText = new GameObjects.Text(scene, 0, -40, this.getPopupText(POPUP_NETWORK_OFFLINE), {
			fontFamily: 'Poppins-Regular',
			fontSize: '21px',
			color: '#ffffff',
			align: 'center',
			wordWrap: { width: scene.scale.width * 0.7, useAdvancedWrap: true },
		});
		this.messageText.setOrigin(0.5);

		const buttonX = 0;
		const buttonY = this.buttonOffsetY;
		const scaledWidth = this.buttonWidth * this.buttonScale;
		const scaledHeight = this.buttonHeight * this.buttonScale;

		this.buttonImage = new GameObjects.Image(scene, buttonX, buttonY, 'long_button');
		this.buttonImage.setOrigin(0.5, 0.5);
		this.buttonImage.setDisplaySize(scaledWidth, scaledHeight);
		this.buttonImage.setScale(this.buttonScale);

		this.buttonText = new GameObjects.Text(scene, buttonX, buttonY, this.getPopupText(COMMON_OK), {
			fontFamily: 'Poppins-Bold',
			fontSize: '24px',
			color: '#000000',
			align: 'center',
		});
		this.buttonText.setOrigin(0.5);

		this.buttonImage.setInteractive({ useHandCursor: true });
		this.buttonImage.on('pointerdown', () => {
			playSoundEffectSafe(this.scene, SoundEffectType.MENU_CLICK);
			this.hide();
		});
		this.buttonImage.on('pointerover', () => this.buttonImage.setTint(0xcccccc));
		this.buttonImage.on('pointerout', () => this.buttonImage.clearTint());

		this.add([this.background, this.messageText, this.buttonImage, this.buttonText]);
		this.setPosition(scene.scale.width / 2, scene.scale.height / 2);
		this.setVisible(false);
		scene.add.existing(this);
	}

	public show(): void {
		this.overlay.setVisible(true);
		// Bumped above any in-game UI layer (fade overlays, loading spinners, drawers) to stay topmost.
		this.overlay.setDepth(200000);

		this.setVisible(true);
		this.setDepth(200001);
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
				const audioManager = getGlobalAudioManager() as any;
				audioManager?.playSoundEffect?.('popup_open');
			},
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
				this.onHideCallback?.();
				if (callback) callback();
			},
		});
	}

	public updateMessage(message: string): void {
		this.messageText.setText(message);
	}

	private drawBackground(): void {
		const width = this.scene.scale.width * 0.8;
		const height = this.scene.scale.height * 0.4;

		this.background.clear();
		this.background.fillStyle(this.backgroundColor, this.backgroundAlpha);
		this.background.fillRoundedRect(-width / 2, -height / 2, width, height, this.cornerRadius);
	}

	public destroy(fromScene?: boolean): void {
		try {
			this.overlay?.destroy();
		} catch {}
		super.destroy(fromScene);
	}
}
