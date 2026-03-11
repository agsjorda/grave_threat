import { Scene } from 'phaser';
import { NetworkManager } from '../../managers/NetworkManager';
import { ScreenModeManager } from '../../managers/ScreenModeManager';

export interface NumberDisplayConfig {
	x: number;
	y: number;
	offsetY?: number;
	scale?: number;
	spacing?: number;
	alignment?: 'left' | 'center' | 'right';
	decimalPlaces?: number;
	showCommas?: boolean;
	prefix?: string;
	suffix?: string;
	commaYOffset?: number;
	dotYOffset?: number;
	/** When set, used for display instead of internal formatting (e.g. formatCurrencyNumber). */
	formatValue?: (value: number) => string;
}

export class NumberDisplay {
	private scene: Scene | null = null;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private container!: Phaser.GameObjects.Container;
	private numberSprites: Phaser.GameObjects.Image[] = [];
	private config: NumberDisplayConfig;
	private currentValue: number = 0;
	private isInitialized: boolean = false;
	private countTween: Phaser.Tweens.Tween | null = null;

	// Number image keys mapping
	private numberKeys: { [key: string]: string } = {
		'0': 'number_0',
		'1': 'number_1',
		'2': 'number_2',
		'3': 'number_3',
		'4': 'number_4',
		'5': 'number_5',
		'6': 'number_6',
		'7': 'number_7',
		'8': 'number_8',
		'9': 'number_9',
		',': 'number_comma',
		'.': 'number_dot'
	};

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager, config: NumberDisplayConfig) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
		this.config = {
			scale: 1,
			spacing: 2,
			alignment: 'left',
			decimalPlaces: 2,
			showCommas: true,
			prefix: '',
			suffix: '',
			commaYOffset: 0,
			dotYOffset: 0,
			offsetY: 0,
			...config
		};
	}

	/**
	 * Initialize the number display
	 */
	create(scene: Scene): void {
		console.log('[NumberDisplay] Creating number display');
		
		this.scene = scene;
		
		// Create container for all number sprites
		const offsetY = Number(this.config.offsetY) || 0;
		this.container = scene.add.container(this.config.x, this.config.y + offsetY);
		this.container.setDepth(50); // Adjust depth as needed
		
		this.isInitialized = true;
	}

	/**
	 * Display a number value
	 */
	displayValue(value: number): void {
		if (!this.isInitialized) {
			console.warn('[NumberDisplay] Not initialized yet');
			return;
		}

		this.currentValue = value;
		this.updateDisplay();
	}

	/**
	 * Animate value counting to a target value
	 */
	animateToValue(targetValue: number, options?: { duration?: number; ease?: string; startFromCurrent?: boolean; startValue?: number }): void {
		if (!this.isInitialized || !this.scene) {
			console.warn('[NumberDisplay] Cannot animate - not initialized');
			return;
		}

		// Stop any existing tween
		if (this.countTween) {
			this.countTween.stop();
			this.countTween = null;
		}

		const duration = options?.duration ?? 2000;
		const ease = options?.ease ?? 'Power2';
		const startValue = options?.startValue !== undefined
			? options.startValue
			: (options?.startFromCurrent === false ? 0 : this.currentValue);

		const counter = { v: startValue };
		const decimalPlaces = Math.max(0, this.config.decimalPlaces ?? 0);

		this.countTween = this.scene.tweens.add({
			targets: counter,
			v: targetValue,
			duration,
			ease,
			onUpdate: () => {
				// Round to configured decimal places
				const factor = Math.pow(10, decimalPlaces);
				this.currentValue = Math.round(counter.v * factor) / factor;
				this.updateDisplay();
			},
			onComplete: () => {
				this.currentValue = targetValue;
				this.updateDisplay();
				this.countTween = null;
			}
		});
	}

	/**
	 * Update the display with current value
	 */
	private updateDisplay(): void {
		if (!this.scene) return;

		// Clear existing sprites
		this.clearSprites();

		// Format the number (use formatValue when provided, e.g. for currency precision)
		const formattedNumber = this.config.formatValue
			? (this.config.prefix ?? '') + this.config.formatValue(this.currentValue) + (this.config.suffix ?? '')
			: this.formatNumber(this.currentValue);
		console.log(`[NumberDisplay] Displaying: ${formattedNumber}`);

		// Create sprites for each character
		let currentX = 0;
		const totalWidth = this.calculateTotalWidth(formattedNumber);

		// Adjust starting position based on alignment
		if (this.config.alignment === 'center') {
			currentX = -totalWidth / 2;
		} else if (this.config.alignment === 'right') {
			currentX = -totalWidth;
		}

		// Create sprites for each character
		for (let i = 0; i < formattedNumber.length; i++) {
			const char = formattedNumber[i];
			const key = this.numberKeys[char];
			
			if (key && this.scene!.textures.exists(key)) {
				const sprite = this.scene!.add.image(currentX, 0, key);
				sprite.setScale(this.config.scale!);
				sprite.setOrigin(0, 0.5);
				
				// Apply y-offset for commas and decimal points
				if (char === ',') {
					sprite.setY(this.config.commaYOffset!);
				} else if (char === '.') {
					sprite.setY(this.config.dotYOffset!);
				}
				
				this.container.add(sprite);
				this.numberSprites.push(sprite);
				
				// Move to next position
				currentX += sprite.width * this.config.scale! + this.config.spacing!;
			} else {
				console.warn(`[NumberDisplay] Missing texture for character: ${char}`);
			}
		}
	}

	/**
	 * Format number with commas and decimal places
	 */
	private formatNumber(value: number): string {
		let formatted = '';

		// Add prefix
		if (this.config.prefix) {
			formatted += this.config.prefix;
		}

		// Format the number
		if (this.config.showCommas) {
			// Add commas for thousands
			const parts = value.toString().split('.');
			parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
			formatted += parts.join('.');
		} else {
			formatted += value.toString();
		}

		// Ensure correct decimal places
		if (this.config.decimalPlaces! > 0) {
			const parts = formatted.split('.');
			if (parts.length === 1) {
				formatted += '.' + '0'.repeat(this.config.decimalPlaces!);
			} else {
				const decimals = parts[1];
				if (decimals.length < this.config.decimalPlaces!) {
					formatted += '0'.repeat(this.config.decimalPlaces! - decimals.length);
				} else if (decimals.length > this.config.decimalPlaces!) {
					formatted = parts[0] + '.' + decimals.substring(0, this.config.decimalPlaces!);
				}
			}
		}

		// Add suffix
		if (this.config.suffix) {
			formatted += this.config.suffix;
		}

		return formatted;
	}

	/**
	 * Calculate total width of the formatted number
	 */
	private calculateTotalWidth(formattedNumber: string): number {
		let totalWidth = 0;
		
		for (let i = 0; i < formattedNumber.length; i++) {
			const char = formattedNumber[i];
			const key = this.numberKeys[char];
			
			if (key && this.scene!.textures.exists(key)) {
				const texture = this.scene!.textures.get(key);
				totalWidth += texture.source[0].width * this.config.scale! + this.config.spacing!;
			}
		}
		
		// Remove last spacing
		if (totalWidth > 0) {
			totalWidth -= this.config.spacing!;
		}
		
		return totalWidth;
	}

	/**
	 * Clear all number sprites
	 */
	private clearSprites(): void {
		for (const sprite of this.numberSprites) {
			sprite.destroy();
		}
		this.numberSprites = [];
	}

	/**
	 * Update configuration
	 */
	updateConfig(newConfig: Partial<NumberDisplayConfig>): void {
		this.config = { ...this.config, ...newConfig };
		if (this.isInitialized) {
			this.updateDisplay();
		}
	}

	/**
	 * Set position
	 */
	setPosition(x: number, y: number): void {
		this.config.x = x;
		this.config.y = y;
		if (this.container) {
			this.container.setPosition(x, y);
		}
	}

	/**
	 * Set scale
	 */
	setScale(scale: number): void {
		this.config.scale = scale;
		if (this.isInitialized) {
			this.updateDisplay();
		}
	}

	/**
	 * Get current value
	 */
	getValue(): number {
		return this.currentValue;
	}

	/**
	 * Get container
	 */
	getContainer(): Phaser.GameObjects.Container {
		return this.container;
	}

	/**
	 * Show/hide the display
	 */
	setVisible(visible: boolean): void {
		if (this.container) {
			this.container.setVisible(visible);
		}
	}

	/**
	 * Set alpha
	 */
	setAlpha(alpha: number): void {
		if (this.container) {
			this.container.setAlpha(alpha);
		}
	}

	/**
	 * Destroy the number display
	 */
	destroy(): void {
		this.clearSprites();
		if (this.countTween) {
			this.countTween.stop();
			this.countTween = null;
		}
		if (this.container) {
			this.container.destroy();
		}
		this.isInitialized = false;
	}
} 