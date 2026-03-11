/**
 * UI Factory Utilities
 * Provides factory methods for creating common UI elements
 */

import { Scene, GameObjects } from 'phaser';
import { UI_CONFIG } from '../config/GameConfig';
import { CurrencyManager } from '../game/components/CurrencyManager';

/**
 * Configuration for creating a control button
 */
export interface ControlButtonConfig {
  /** Button name/ID (used for texture and button map) */
  name: string;
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Click handler */
  onClick?: () => void;
  /** Asset scale */
  scale?: number;
  /** Depth layer */
  depth?: number;
  /** Initial texture suffix (default: '_off') */
  initialState?: 'on' | 'off';
}

/**
 * Configuration for creating a text label
 */
export interface TextLabelConfig {
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Text content */
  text: string;
  /** Font size (default: '10px') */
  fontSize?: string;
  /** Font color (default: '#ffffff') */
  color?: string;
  /** Font family (default: 'poppins-regular') */
  fontFamily?: string;
  /** Depth layer */
  depth?: number;
  /** Origin X (default: 0.5) */
  originX?: number;
  /** Origin Y (default: 0.5) */
  originY?: number;
}

/**
 * Configuration for creating a currency display
 */
export interface CurrencyDisplayConfig {
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Initial amount */
  amount: number;
  /** Show currency symbol (default: true in real mode) */
  showCurrency?: boolean;
  /** Currency symbol (defaults to CurrencyManager glyph when omitted) */
  currencySymbol?: string;
  /** Font size (default: '14px') */
  fontSize?: string;
  /** Decimal places (default: 2) */
  decimals?: number;
  /** Depth layer */
  depth?: number;
}

/**
 * Result of creating a currency display
 */
export interface CurrencyDisplayResult {
  /** The amount text object */
  amountText: GameObjects.Text;
  /** The currency symbol text object */
  currencyText: GameObjects.Text;
  /** Container holding both texts */
  container: GameObjects.Container;
  /** Update the displayed amount */
  updateAmount: (amount: number, isDemo?: boolean) => void;
}

/**
 * Default text style for UI elements
 */
export function getDefaultTextStyle(): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: '10px',
    color: '#ffffff',
    fontFamily: 'poppins-regular',
  };
}

/**
 * Create a control button with standard configuration
 */
export function createControlButton(
  scene: Scene,
  config: ControlButtonConfig
): GameObjects.Image {
  const {
    name,
    x,
    y,
    onClick,
    scale = 1,
    depth = UI_CONFIG.DEPTH.CONTROLLER,
    initialState = 'off',
  } = config;

  const texture = `${name}_${initialState}`;
  const button = scene.add.image(x, y, texture)
    .setOrigin(0.5, 0.5)
    .setScale(scale)
    .setDepth(depth);

  button.setInteractive();

  if (onClick) {
    button.on('pointerdown', onClick);
  }

  return button;
}

/**
 * Create a text label with standard configuration
 */
export function createTextLabel(
  scene: Scene,
  config: TextLabelConfig
): GameObjects.Text {
  const {
    x,
    y,
    text,
    fontSize = '10px',
    color = '#ffffff',
    fontFamily = 'poppins-regular',
    depth = UI_CONFIG.DEPTH.CONTROLLER,
    originX = 0.5,
    originY = 0.5,
  } = config;

  return scene.add.text(x, y, text, {
    fontSize,
    color,
    fontFamily,
  })
    .setOrigin(originX, originY)
    .setDepth(depth);
}

/**
 * Create a currency display with amount and currency symbol
 */
export function createCurrencyDisplay(
  scene: Scene,
  config: CurrencyDisplayConfig
): CurrencyDisplayResult {
  const {
    x,
    y,
    amount,
    showCurrency = true,
    currencySymbol = CurrencyManager.getCurrencyGlyph(),
    fontSize = '14px',
    decimals = 2,
    depth = UI_CONFIG.DEPTH.CONTROLLER,
  } = config;

  const container = scene.add.container(x, y);
  container.setDepth(depth);

  // Currency symbol text
  const currencyText = scene.add.text(0, 0, showCurrency ? currencySymbol : '', {
    fontSize,
    color: '#ffffff',
    fontFamily: 'poppins-regular',
  }).setOrigin(0.5, 0.5);

  // Amount text (local format: toLocaleString with decimals)
  const amountText = scene.add.text(0, 0, formatAmount(amount, decimals), {
    fontSize,
    color: '#ffffff',
    fontFamily: 'poppins-regular',
  }).setOrigin(0.5, 0.5);

  container.add([currencyText, amountText]);

  // Position currency symbol relative to amount
  const updatePositions = (isDemo: boolean = false) => {
    if (isDemo) {
      currencyText.setVisible(false);
      amountText.setX(0);
    } else {
      currencyText.setVisible(true);
      currencyText.setX(-amountText.width / 2 - currencyText.width / 2 - 3);
      amountText.setX(3);
    }
  };

  updatePositions(!showCurrency);

  const updateAmount = (newAmount: number, isDemo: boolean = false) => {
    amountText.setText(formatAmount(newAmount, decimals));
    updatePositions(isDemo);
  };

  return {
    amountText,
    currencyText,
    container,
    updateAmount,
  };
}

/**
 * Format a numeric amount for display (local toLocaleString)
 */
export function formatAmount(amount: number, decimals: number = 2): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Create a button with label below it
 */
export function createButtonWithLabel(
  scene: Scene,
  buttonConfig: ControlButtonConfig,
  labelText: string,
  labelOffset: number = 15
): { button: GameObjects.Image; label: GameObjects.Text } {
  const button = createControlButton(scene, buttonConfig);
  
  const label = createTextLabel(scene, {
    x: buttonConfig.x,
    y: buttonConfig.y + (button.displayHeight * 0.5) + labelOffset,
    text: labelText,
  });

  return { button, label };
}

/**
 * Update button texture based on active state
 */
export function updateButtonState(
  button: GameObjects.Image,
  buttonName: string,
  isActive: boolean
): void {
  const newTexture = isActive ? `${buttonName}_on` : `${buttonName}_off`;
  button.setTexture(newTexture);
}

/**
 * Disable a button (grey out and remove interaction)
 */
export function disableButton(button: GameObjects.Image): void {
  button.setAlpha(0.3);
  button.setTint(0x777777);
  button.disableInteractive();
}

/**
 * Enable a button (restore opacity and interaction)
 */
export function enableButton(button: GameObjects.Image): void {
  button.setAlpha(1.0);
  button.clearTint();
  button.setInteractive();
}

/**
 * Create a bounce animation for a game object
 */
export function createBounceAnimation(
  scene: Scene,
  target: GameObjects.GameObject,
  config?: {
    scaleMultiplier?: number;
    duration?: number;
  }
): Phaser.Tweens.Tween {
  const { scaleMultiplier = 1.45, duration = 100 } = config || {};

  return scene.tweens.add({
    targets: target,
    scaleX: scaleMultiplier,
    scaleY: scaleMultiplier,
    duration,
    ease: 'Power2',
    yoyo: true,
    onComplete: () => {
      (target as any).setScale?.(1, 1);
    },
  });
}
