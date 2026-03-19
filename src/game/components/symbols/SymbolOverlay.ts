/**
 * SymbolOverlay - Manages overlay graphics and win text display
 * 
 * Responsibilities:
 * - Show/hide dark overlay behind winning symbols
 * - Create and manage win text displays
 * - Handle multiplier overlay images
 */

import type { Game } from '../../scenes/Game';
import type { GridBounds, SymbolObject } from './types';
import {
  DEPTH_OVERLAY,
  DEPTH_WINNING_SYMBOL,
  DEPTH_OVERLAY_CONTAINER,
  DEPTH_RETRIGGER_SYMBOL,
  OVERLAY_FADE_IN_DURATION_MS,
  OVERLAY_FADE_OUT_DURATION_MS,
} from '../../../config/GameConfig';
import { CurrencyManager } from '../CurrencyManager';
import { formatCurrencyNumber } from '../../../utils/NumberPrecisionFormatter';

/**
 * Manages overlay graphics and win text for the symbol grid
 */
export class SymbolOverlay {
  private scene: Game;
  
  /** Semi-transparent dark overlay graphics */
  private overlayRect: Phaser.GameObjects.Graphics | null = null;
  
  /** Container for symbols lifted above the mask during animations */
  private overlayContainer: Phaser.GameObjects.Container | null = null;

  constructor(scene: Game) {
    this.scene = scene;
  }

  // ============================================================================
  // OVERLAY RECT (Dark background behind winning symbols)
  // ============================================================================

  /**
   * Create the semi-transparent overlay rectangle
   */
  public createOverlayRect(bounds: GridBounds): void {
    if (this.overlayRect) {
      this.overlayRect.destroy();
    }
    
    this.overlayRect = this.scene.add.graphics();
    this.overlayRect.fillStyle(0x000000, 0.7);
    this.overlayRect.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.overlayRect.setDepth(DEPTH_OVERLAY);
    this.overlayRect.setVisible(false);
    
  }

  /**
   * Show the overlay with fade-in animation
   */
  public showOverlay(): void {
    if (!this.overlayRect) {
      console.warn('[SymbolOverlay] Cannot show - overlay not created');
      return;
    }
    
    // Stop existing tweens
    this.scene.tweens.killTweensOf(this.overlayRect);
    
    // If already visible at full alpha, skip
    if (this.overlayRect.visible && this.overlayRect.alpha >= 1) {
      return;
    }
    
    // Set initial state and fade in
    this.overlayRect.setVisible(true);
    this.overlayRect.setAlpha(0);
    
    this.scene.tweens.add({
      targets: this.overlayRect,
      alpha: 1,
      duration: OVERLAY_FADE_IN_DURATION_MS,
      ease: 'Power2.easeOut',
      onComplete: () => {
      }
    });
  }

  /**
   * Hide the overlay with fade-out animation
   */
  public hideOverlay(): void {
    if (!this.overlayRect || !this.overlayRect.visible) {
      return;
    }
    
    this.scene.tweens.killTweensOf(this.overlayRect);
    
    this.scene.tweens.add({
      targets: this.overlayRect,
      alpha: 0,
      duration: OVERLAY_FADE_OUT_DURATION_MS,
      ease: 'Power2.easeIn',
      onComplete: () => {
        if (this.overlayRect) {
          this.overlayRect.setVisible(false);
        }
      }
    });
  }

  /**
   * Check if overlay is currently visible
   */
  public isOverlayVisible(): boolean {
    return !!(this.overlayRect && this.overlayRect.visible);
  }

  // ============================================================================
  // OVERLAY CONTAINER (For symbols lifted above the mask)
  // ============================================================================

  /**
   * Get or create the overlay container
   */
  public getOverlayContainer(): Phaser.GameObjects.Container {
    if (!this.overlayContainer) {
      this.overlayContainer = this.scene.add.container(0, 0);
      this.overlayContainer.setDepth(DEPTH_OVERLAY_CONTAINER);
    }
    return this.overlayContainer;
  }

  /**
   * Lift a symbol to the overlay container (above the mask)
   */
  public liftSymbolToOverlay(
    symbol: SymbolObject,
    originalParent: Phaser.GameObjects.Container | null
  ): { worldX: number; worldY: number; localX: number; localY: number } {
    const container = this.getOverlayContainer();
    
    // Compute world coordinates
    let worldX = symbol.x;
    let worldY = symbol.y;
    
    try {
      const matrix = (symbol as any).getWorldTransformMatrix?.();
      if (matrix && typeof matrix.tx === 'number' && typeof matrix.ty === 'number') {
        worldX = matrix.tx;
        worldY = matrix.ty;
      } else if (originalParent) {
        worldX = symbol.x + (originalParent.x || 0);
        worldY = symbol.y + (originalParent.y || 0);
      }
    } catch { /* ignore */ }
    
    // Store local position for restoration
    const localX = symbol.x;
    const localY = symbol.y;
    
    // Detach from original parent
    try {
      if (originalParent) {
        originalParent.remove(symbol as any);
      }
    } catch { /* ignore */ }
    
    // Add to overlay container
    container.add(symbol as any);
    symbol.x = worldX;
    symbol.y = worldY;
    
    try {
      symbol.setDepth?.(DEPTH_RETRIGGER_SYMBOL);
    } catch { /* ignore */ }
    
    return { worldX, worldY, localX, localY };
  }

  /**
   * Restore a symbol from the overlay container to its original parent
   */
  public restoreSymbolFromOverlay(
    symbol: SymbolObject,
    originalParent: Phaser.GameObjects.Container | null,
    localX: number,
    localY: number
  ): void {
    try {
      if (this.overlayContainer) {
        this.overlayContainer.remove(symbol as any);
      }
    } catch { /* ignore */ }
    
    if (originalParent) {
      try {
        originalParent.add(symbol as any);
      } catch { /* ignore */ }
      symbol.x = localX;
      symbol.y = localY;
    } else {
      // Return to root display list
      try {
        this.scene.children.add(symbol as any);
      } catch { /* ignore */ }
      symbol.x = localX;
      symbol.y = localY;
    }
    
    try {
      symbol.setDepth?.(0);
    } catch { /* ignore */ }
  }

  // ============================================================================
  // WIN TEXT
  // ============================================================================

  /**
   * Create a win text display at the specified position.
   * @param scale Optional scale for the text (e.g. 0.7 for bonus game). Default 1.
   */
  public createWinText(
    amount: number,
    x: number,
    y: number,
    displayHeight: number,
    isDemo: boolean = false,
    scale: number = 1
  ): Phaser.GameObjects.Text {
    const fontSize = Math.max(40, Math.round(displayHeight * 0.5));
    const currencyPrefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
    
    // Format the amount
    let textValue: string;
    try {
      textValue = `${currencyPrefix}${formatCurrencyNumber(amount)}`;
    } catch {
      textValue = `${currencyPrefix}${amount}`;
    }
    
    // Create the text object
    const text = this.scene.add.text(x, y, textValue, {
      fontFamily: 'Poppins-Bold',
      fontSize: `${fontSize}px`,
      color: '#FFFFFF',
      align: 'center'
    } as any);
    
    text.setOrigin(0.5, 0.5);
    
    // Add stroke and shadow
    try {
      (text as any).setStroke?.('#FA2A55', Math.max(2, Math.round(fontSize * 0.12)));
      (text as any).setShadow?.(0, 2, '#000000', Math.max(2, Math.round(fontSize * 0.15)), true, true);
    } catch { /* ignore */ }
    
    if (scale !== 1) {
      try { text.setScale(scale); } catch { /* ignore */ }
    }
    
    return text;
  }

  /**
   * Destroy overlay image associated with a symbol
   */
  public destroySymbolOverlay(symbol: SymbolObject): void {
    try {
      const overlayObj = (symbol as any)?.__overlayImage;
      if (overlayObj && overlayObj.destroy && !overlayObj.destroyed) {
        overlayObj.destroy();
      }
    } catch { /* ignore */ }
    
    // Detach win text reference (let its own tween handle destruction)
    try {
      const winText = (symbol as any)?.__winText;
      if (winText) {
        (symbol as any).__winText = null;
      }
    } catch { /* ignore */ }
  }

  /**
   * Get tween targets for a symbol including its overlay
   */
  public getSymbolTweenTargets(symbol: SymbolObject): any | any[] {
    try {
      const overlayObj = (symbol as any)?.__overlayImage;
      if (overlayObj) {
        return [symbol, overlayObj];
      }
    } catch { /* ignore */ }
    return symbol;
  }

  // ============================================================================
  // SYMBOL DEPTH MANAGEMENT
  // ============================================================================

  /**
   * Move a symbol to appear in front of the overlay
   */
  public moveSymbolToFront(
    symbol: SymbolObject,
    container: Phaser.GameObjects.Container
  ): void {
    // Remove from container and add to scene
    container.remove(symbol as any);
    this.scene.add.existing(symbol as any);
    
    symbol.setDepth?.(DEPTH_WINNING_SYMBOL);
    
    // Move overlay image too if present
    try {
      const overlayObj = (symbol as any).__overlayImage;
      if (overlayObj) {
        this.scene.tweens.killTweensOf(overlayObj);
        if ((overlayObj as any).parentContainer === container) {
          container.remove(overlayObj);
        } else {
          this.scene.children.remove(overlayObj);
        }
        this.scene.add.existing(overlayObj);
        overlayObj.setDepth((symbol.depth || DEPTH_WINNING_SYMBOL) + 1);
      }
    } catch { /* ignore */ }
  }

  /**
   * Reset a symbol to its default depth in the container
   */
  public resetSymbolDepth(
    symbol: SymbolObject,
    container: Phaser.GameObjects.Container
  ): void {
    // Move back to container
    if ((symbol as any).parentContainer !== container) {
      this.scene.children.remove(symbol as any);
      container.add(symbol as any);
    }
    
    symbol.setDepth?.(0);
    
    // Move overlay back too
    try {
      const overlayObj = (symbol as any).__overlayImage;
      if (overlayObj) {
        this.scene.tweens.killTweensOf(overlayObj);
        if ((overlayObj as any).parentContainer !== container) {
          this.scene.children.remove(overlayObj);
          container.add(overlayObj);
        }
        overlayObj.setDepth(1);
      }
    } catch { /* ignore */ }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Destroy all overlay resources
   */
  public destroy(): void {
    if (this.overlayRect) {
      this.overlayRect.destroy();
      this.overlayRect = null;
    }
    
    if (this.overlayContainer) {
      this.overlayContainer.destroy();
      this.overlayContainer = null;
    }
  }
}
