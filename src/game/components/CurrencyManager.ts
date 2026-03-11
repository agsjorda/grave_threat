import type { SlotInitializeData } from "../../backend/GameAPI";
import { Scene, GameObjects } from "phaser";
import { formatCurrencyNumber } from "../../utils/NumberPrecisionFormatter";
import { SoundEffectType } from "../../managers/AudioManager";

type CurrencyInit = Pick<SlotInitializeData, "currency" | "currencySymbol">;

function normalizeText(value: unknown): string {
	if (typeof value !== "string") return "";
	return value.trim();
}

function isDemoMode(): boolean {
	try {
		const urlParams = new URLSearchParams(window.location.search);
		const demoParam = (urlParams.get("demo") || "").toLowerCase();
		if (demoParam === "true" || demoParam === "1" || demoParam === "yes") return true;
	} catch {}

	try {
		if (localStorage.getItem("demo") === "true") return true;
	} catch {}

	try {
		if (sessionStorage.getItem("demo") === "true") return true;
	} catch {}

	return false;
}

/**
 * Centralized currency display helper.
 *
 * For pastry_cub we always prefer the currency *code* as a text prefix
 * (e.g. "USD 1.00"), even when a currency symbol is provided.
 */
export class CurrencyManager {
	private static currencyCode = "";
	private static currencySymbol = "";

	// One-shot overlay shown when currency fields are missing.
	private static missingCurrencyPopupShown = false;
	private static currencyErrorPopup?: CurrencyErrorPopup;

	public static initializeFromInitData(initData: CurrencyInit | null | undefined): void {
		const code = normalizeText(initData?.currency);
		const symbol = normalizeText(initData?.currencySymbol);

		CurrencyManager.currencyCode = code;
		CurrencyManager.currencySymbol = symbol;

		// In demo mode, currency fields may be omitted; do not show an error popup.
		if (isDemoMode()) {
			return;
		}

		// If both are missing, inform the player with a popup.
		if (CurrencyManager.currencyCode.length === 0 && CurrencyManager.currencySymbol.length === 0) {
			CurrencyManager.showMissingCurrencyPopup();
		}
	}

	public static getCurrencyCode(): string {
		return CurrencyManager.currencyCode;
	}

	public static getCurrencySymbol(): string {
		return CurrencyManager.currencySymbol;
	}

	/**
	 * Returns the glyph to display where "$" used to be.
	 * For pastry_cub this is always the currency code (if present),
	 * never the currency symbol.
	 */
	public static getCurrencyGlyph(): string {
		if (CurrencyManager.currencyCode.length > 0) return CurrencyManager.currencyCode;
		return "";
	}

	/**
	 * Returns a prefix suitable for inline amounts.
	 * We always use the currency code and include a trailing space for readability.
	 */
	public static getInlinePrefix(): string {
		if (CurrencyManager.currencyCode.length > 0) return `${CurrencyManager.currencyCode} `;
		return "";
	}

	public static formatAmount(amount: number, decimals = 2): string {
		const safe = Number.isFinite(amount) ? amount : 0;
		const currencyCode = CurrencyManager.getCurrencyCode();
		const space = currencyCode ? ' ' : '';
		const normalizedDecimals = Number.isFinite(decimals) ? Math.max(0, Math.floor(decimals)) : 2;
		let formatted: string;
		if (normalizedDecimals === 2) {
			formatted = formatCurrencyNumber(safe);
		} else {
			// Shuten-style: trim trailing zeros (e.g. 3.300 → 3.30, not 3.300)
			const fixedValue = safe.toFixed(normalizedDecimals);
			const decimalPart = fixedValue.split(".")[1] ?? "";
			const hasNonZeroTenths = decimalPart.length > 0 && decimalPart[0] !== "0";
			const minimumFractionDigits = hasNonZeroTenths ? Math.min(2, normalizedDecimals) : 0;
			formatted = safe.toLocaleString("en-US", {
				minimumFractionDigits,
				maximumFractionDigits: normalizedDecimals,
			});
		}
		return currencyCode ? `${currencyCode}${space}${formatted}` : formatted;
	}

	/**
	 * Best-effort removal of currency prefix from a display string.
	 * Useful when legacy code parses numeric values from UI text.
	 */
	public static stripCurrencyPrefix(text: string): string {
		let out = typeof text === "string" ? text : "";

		const symbol = CurrencyManager.currencySymbol;
		const code = CurrencyManager.currencyCode;

		if (symbol) out = out.replace(symbol, "");
		if (code) out = out.replace(code, "");

		return out.trim();
	}

	private static resolvePopupScene(): Scene | null {
		try {
			const game: any = (window as any).game;
			const sceneManager: any = game?.scene;
			// Prefer Game scene so it appears in-game; fall back to Preloader if needed.
			const gameScene = sceneManager?.getScene?.("Game") as Scene | undefined;
			if (gameScene) return gameScene;
			const preloaderScene = sceneManager?.getScene?.("Preloader") as Scene | undefined;
			if (preloaderScene) return preloaderScene;
		} catch {}
		return null;
	}

	private static showMissingCurrencyPopup(): void {
		if (CurrencyManager.missingCurrencyPopupShown) {
			return;
		}
		const scene = CurrencyManager.resolvePopupScene();
		if (!scene) {
			// Scene not ready yet (e.g. during very early boot). We'll skip showing for now.
			return;
		}

		const message =
			"There was an error with the selected currency.\n\nPlease try refreshing the game or selecting another currency.";

		// Use a local popup implementation (TokenExpiredPopup look/feel, but exclusive to this file).
		if (!CurrencyManager.currencyErrorPopup) {
			CurrencyManager.currencyErrorPopup = new CurrencyErrorPopup(scene, {
				panelWidthFactor: 0.8,
				panelHeightFactor: 0.30,
				buttonOffsetY: 90,
				buttonScale: 0.8,
				backgroundAlpha: 0.4,
				cornerRadius: 20,
				overlayAlpha: 0.35,
			});
		}
		try { CurrencyManager.currencyErrorPopup.updateMessage(message); } catch {}
		try { CurrencyManager.currencyErrorPopup.show(); } catch {}

		CurrencyManager.missingCurrencyPopupShown = true;
	}
}

/**
 * Currency error popup (exclusive to CurrencyManager).
 * Matches TokenExpiredPopup styling/animation, with configurable panel height.
 */
class CurrencyErrorPopup extends GameObjects.Container {
	private background: GameObjects.Graphics;
	private messageText: GameObjects.Text;
	private buttonImage: GameObjects.Image;
	private buttonText: GameObjects.Text;
	private overlay: Phaser.GameObjects.Graphics;

	private backgroundColor: number = 0x000000; // Black
	private backgroundAlpha: number = 0.4; // Default opacity
	private cornerRadius: number = 20; // Corner radius
	private buttonOffsetY: number = 130; // Vertical offset from center
	private buttonScale: number = 0.8; // Scale factor for the button
	private buttonWidth: number = 364; // Base width of the button
	private buttonHeight: number = 62; // Base height of the button
	private animationDuration: number = 300; // Animation duration in milliseconds
	private overlayColor: number = 0x000000;
	private overlayAlpha: number = 0.35;

	private panelWidthFactor: number = 0.8;
	private panelHeightFactor: number = 0.28;

	constructor(scene: Scene, options: {
		panelWidthFactor?: number;
		panelHeightFactor?: number;
		buttonOffsetY?: number;
		buttonScale?: number;
		backgroundAlpha?: number;
		cornerRadius?: number;
		overlayAlpha?: number;
		overlayColor?: number;
	} = {}) {
		super(scene, 0, 0);
		this.scene = scene;

		if (options.panelWidthFactor !== undefined) this.panelWidthFactor = Phaser.Math.Clamp(options.panelWidthFactor, 0.2, 0.95);
		if (options.panelHeightFactor !== undefined) this.panelHeightFactor = Phaser.Math.Clamp(options.panelHeightFactor, 0.2, 0.95);
		if (options.buttonOffsetY !== undefined) this.buttonOffsetY = options.buttonOffsetY;
		if (options.buttonScale !== undefined) this.buttonScale = Phaser.Math.Clamp(options.buttonScale, 0.1, 2);
		if (options.backgroundAlpha !== undefined) this.backgroundAlpha = Phaser.Math.Clamp(options.backgroundAlpha, 0, 1);
		if (options.cornerRadius !== undefined) this.cornerRadius = Math.max(0, options.cornerRadius);
		if (options.overlayAlpha !== undefined) this.overlayAlpha = Phaser.Math.Clamp(options.overlayAlpha, 0, 1);
		if (options.overlayColor !== undefined) this.overlayColor = options.overlayColor;

		// Overlay first (behind everything else)
		this.overlay = new GameObjects.Graphics(scene);
		this.overlay.fillStyle(this.overlayColor, this.overlayAlpha);
		this.overlay.fillRect(0, 0, scene.scale.width, scene.scale.height);
		this.overlay.setScrollFactor(0);
		this.overlay.setInteractive(
			new Phaser.Geom.Rectangle(0, 0, scene.scale.width, scene.scale.height),
			Phaser.Geom.Rectangle.Contains
		);
		this.overlay.visible = false;
		try { this.overlay.disableInteractive(); } catch {}
		scene.add.existing(this.overlay);

		// Background
		this.background = new Phaser.GameObjects.Graphics(scene);
		this.drawBackground();

		// Message text
		this.messageText = new GameObjects.Text(
			scene,
			0,
			-30,
			"There was an error with the selected currency.\n\nPlease try refreshing the game or selecting another currency.",
			{
				fontFamily: "Poppins-Regular",
				fontSize: "21px",
				color: "#ffffff",
				align: "center",
				wordWrap: { width: scene.scale.width * 0.7, useAdvancedWrap: true }
			}
		);
		this.messageText.setOrigin(0.5);

		// Button
		const buttonX = 0;
		const buttonY = this.buttonOffsetY;
		const scaledWidth = this.buttonWidth * this.buttonScale;
		const scaledHeight = this.buttonHeight * this.buttonScale;

		this.buttonImage = new GameObjects.Image(scene, buttonX, buttonY, "long_button");
		this.buttonImage.setOrigin(0.5, 0.5);
		this.buttonImage.setDisplaySize(scaledWidth, scaledHeight);
		this.buttonImage.setScale(this.buttonScale);

		this.buttonText = new GameObjects.Text(scene, buttonX, buttonY, "REFRESH", {
			fontFamily: "Poppins-Bold",
			fontSize: "24px",
			color: "#000000",
			align: "center"
		});
		this.buttonText.setOrigin(0.5);

		this.buttonImage.setInteractive({ useHandCursor: true });
		this.buttonImage.on("pointerdown", () => {
			try {
				const audioManager =
					(this.scene as any)?.audioManager || (window as any)?.audioManager;
				if (audioManager && typeof audioManager.playSoundEffect === "function") {
					audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
				}
			} catch {}
			try { window.location.reload(); } catch {}
		});
		this.buttonImage.on("pointerover", () => this.buttonImage.setTint(0xcccccc));
		this.buttonImage.on("pointerout", () => this.buttonImage.clearTint());

		this.add([this.background, this.messageText, this.buttonImage, this.buttonText]);

		// Center the container
		this.setPosition(scene.scale.width / 2, scene.scale.height / 2);
		this.setVisible(false);
		scene.add.existing(this);
	}

	public updateMessage(message: string): void {
		this.messageText.setText(message);
	}

	public show(): void {
		// Show overlay first
		this.overlay.setVisible(true);
		this.overlay.setDepth(9999);
		try {
			const anyOverlay: any = this.overlay as any;
			if (anyOverlay?.input) anyOverlay.input.enabled = true;
		} catch {}

		// Animate popup in
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
			ease: "Back.Out",
			onStart: () => {
				try {
					if ((window as any).audioManager) {
						(window as any).audioManager.playSoundEffect("popup_open");
					}
				} catch {}
			}
		});
	}

	private drawBackground(): void {
		const width = this.scene.scale.width * this.panelWidthFactor;
		const height = this.scene.scale.height * this.panelHeightFactor;

		this.background.clear();
		this.background.fillStyle(this.backgroundColor, this.backgroundAlpha);
		this.background.fillRoundedRect(-width / 2, -height / 2, width, height, this.cornerRadius);
	}
}
