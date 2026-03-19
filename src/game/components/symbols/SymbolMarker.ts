/**
 * SymbolMarker - Bonus multiplier markers on the symbol grid
 *
 * Shows per-cell multiplier badges (x1 marker, then x2, x4, ... x128) when cells are part of
 * a sugar win during Free Spins. First hit only marks the cell, multiplier starts at x2.
 */

import type { Game } from '../../scenes/Game';
import {
  SLOT_COLUMNS,
  SLOT_ROWS,
  DEPTH_SYMBOL_DEFAULT,
  BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT,
  BONUS_MULTIPLIER_MAX_VALUE,
} from '../../../config/GameConfig';

export interface SymbolMarkerLayout {
  displayWidth: number;
  displayHeight: number;
  slotX: number;
  slotY: number;
  totalGridWidth: number;
  totalGridHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  numCols: number;
  numRows: number;
  parentContainer?: Phaser.GameObjects.Container;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
}

/**
 * Manages bonus multiplier cell markers (x1 marker, then x2, x4, ... x128) on the symbol grid.
 */
export class SymbolMarker {
  private scene: Game | null = null;
  private layout: SymbolMarkerLayout | null = null;
  private values: number[][] = [];
  private overlays: (Phaser.GameObjects.GameObject | null)[][] = [];
  private static readonly MARKER_VALUE = 1;
  private static readonly MIN_ACTIVE_MULTIPLIER = 2;
  private static readonly MAX_MULTIPLIER = BONUS_MULTIPLIER_MAX_VALUE;
  private static readonly FIRST_MARKER_ALPHA = 0.7;

  constructor(scene: Game) {
    this.scene = scene;
    this.ensureState();
  }

  /**
   * Set grid layout for positioning markers. Call when grid is ready or layout changes.
   */
  public setLayout(layout: SymbolMarkerLayout): void {
    this.layout = layout;
    this.ensureState();
  }

  /**
   * Mark a cell as having been part of a sugar win during bonus.
   * First hit creates a marker (x1 visual only), second hit starts multiplier at x2.
   * Each subsequent hit doubles up to x128.
   */
  public markCell(col: number, row: number): number {
    if (col < 0 || row < 0) return 0;
    this.ensureState();
    const cols = this.values.length;
    const rows = this.values[0]?.length ?? 0;
    if (col >= cols || row >= rows) return 0;

    let current = this.values[col][row] || 0;
    if (current <= 0) {
      current = SymbolMarker.MARKER_VALUE;
    } else {
      let next = current * 2;
      if (next > SymbolMarker.MAX_MULTIPLIER) next = SymbolMarker.MAX_MULTIPLIER;
      current = next;
    }

    this.values[col][row] = current;
    try {
    } catch {}
    this.updateOverlay(col, row, current);
    return current;
  }

  /**
   * Set a cell to a specific multiplier value (e.g. for buy feature 2 starting x2 sticky markers).
   * Value must be between 1 and MAX_MULTIPLIER; use 2 for active x2 sticky.
   */
  public setCellValue(col: number, row: number, value: number): void {
    if (col < 0 || row < 0) return;
    this.ensureState();
    const cols = this.values.length;
    const rows = this.values[0]?.length ?? 0;
    if (col >= cols || row >= rows) return;
    const clamped = Math.max(1, Math.min(SymbolMarker.MAX_MULTIPLIER, Math.floor(value)));
    this.values[col][row] = clamped;
    this.updateOverlay(col, row, clamped);
  }

  /**
   * Get current multiplier value at the given grid cell.
   * Returns 0 when the cell has no multiplier yet.
   */
  public getCellValue(col: number, row: number): number {
    if (col < 0 || row < 0) return 0;
    this.ensureState();
    const cols = this.values.length;
    const rows = this.values[0]?.length ?? 0;
    if (col >= cols || row >= rows) return 0;
    return this.values[col][row] || 0;
  }

  /**
   * Effective payout multiplier contribution for a cell.
   * Marker-only state (x1) does not contribute until it upgrades to x2.
   */
  public getCellContribution(col: number, row: number): number {
    const value = this.getCellValue(col, row);
    return value >= SymbolMarker.MIN_ACTIVE_MULTIPLIER ? value : 0;
  }

  /**
   * Reset all multiplier state and destroy overlay objects. Call at bonus start (once per session) and bonus end.
   */
  public reset(): void {
    for (let c = 0; c < this.values.length; c++) {
      for (let r = 0; r < this.values[c].length; r++) {
        this.values[c][r] = 0;
        const overlay = this.overlays[c]?.[r];
        if (overlay) {
          try {
            overlay.destroy();
          } catch {}
          this.overlays[c][r] = null;
        }
      }
    }
  }

  /**
   * Refresh positions and visibility of all existing marker overlays.
   * Call after symbols drop or grid layout changes to ensure markers stay aligned.
   */
  public refreshOverlays(): void {
    if (!this.scene || !this.layout) return;
    this.ensureState();
    for (let c = 0; c < this.overlays.length; c++) {
      for (let r = 0; r < this.overlays[c].length; r++) {
        const value = this.values[c]?.[r] || 0;
        if (value > 0) {
          // Update existing overlay position and ensure it's visible
          const overlay = this.overlays[c]?.[r] as any;
          if (overlay && overlay.scene) {
            const L = this.layout;
            const symbolTotalWidth = L.displayWidth + L.horizontalSpacing;
            const symbolTotalHeight = L.displayHeight + L.verticalSpacing;
            const startX = L.slotX - L.totalGridWidth * 0.5;
            const startY = L.slotY - L.totalGridHeight * 0.5;
            const x = startX + c * symbolTotalWidth + symbolTotalWidth * 0.5 + (L.offsetX ?? 0);
            const y = startY + r * symbolTotalHeight + symbolTotalHeight * 0.5 + (L.offsetY ?? 0);
            try {
              overlay.setPosition?.(x, y);
              overlay.setVisible?.(true);
              overlay.setDepth?.(this.getOverlayDepth());
              L.parentContainer?.sendToBack?.(overlay);
            } catch {}
          } else if (value > 0) {
            // Recreate overlay if it was destroyed
            this.updateOverlay(c, r, value);
          }
        }
      }
    }
  }

  private ensureState(): void {
    const cols = this.layout?.numCols ?? SLOT_COLUMNS;
    const rows = this.layout?.numRows ?? SLOT_ROWS;

    if (this.values.length !== cols || this.values[0]?.length !== rows) {
      this.values = Array.from({ length: cols }, () => Array<number>(rows).fill(0));
    }
    if (this.overlays.length !== cols || this.overlays[0]?.length !== rows) {
      this.overlays = Array.from(
        { length: cols },
        () => Array<Phaser.GameObjects.GameObject | null>(rows).fill(null)
      );
    }
  }

  private getOverlayDepth(): number {
    // Match bonus-game marker layering: keep marker overlays behind symbol objects.
    return DEPTH_SYMBOL_DEFAULT - 1;
  }

  private getTextureKey(value: number): string | null {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) return null;
    const exactTier = BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT.find((tier) => tier === normalized);
    if (!exactTier) return null;
    return `bonus_multiplier_x${exactTier}`;
  }

  private fitOverlayImageToCell(img: Phaser.GameObjects.Image): void {
    if (!this.layout) return;
    const L = this.layout;
    const fitFactor = Math.max(0.1, L.scale ?? 1);
    const desiredWidth = Math.max(3, L.displayWidth * fitFactor);
    const desiredHeight = Math.max(3, L.displayHeight * fitFactor);
    const texWidth = Math.max(1, img.width);
    const texHeight = Math.max(1, img.height);
    const fitScale = Math.min(desiredWidth / texWidth, desiredHeight / texHeight);
    img.setScale(fitScale);
  }

  private createOverlayObject(x: number, y: number, value: number): Phaser.GameObjects.GameObject | null {
    if (!this.scene || !this.layout) return null;
    const L = this.layout;
    const key = this.getTextureKey(value);

    if (key && this.scene.textures?.exists(key)) {
      const img = this.scene.add.image(x, y, key);
      img.setOrigin(0.5, 0.5);
      img.setVisible(true);
      try {
        img.setDepth(this.getOverlayDepth());
      } catch {}
      try {
        if (L.parentContainer) {
          L.parentContainer.addAt?.(img, 0);
          L.parentContainer.sendToBack?.(img);
        }
      } catch {}
      try {
        this.fitOverlayImageToCell(img);
      } catch {}
      this.applyOverlayAlpha(img, value);
      try {
      } catch {}
      return img;
    }

    try {
      const txt = this.scene.add.text(x, y, `x${value}`, {
        fontFamily: 'Poppins-Bold',
        fontSize: `${Math.max(18, Math.round(L.displayHeight * 0.35))}px`,
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 4,
      } as any);
      txt.setOrigin(0.5, 0.5);
      txt.setVisible(true);
      try {
        txt.setDepth(this.getOverlayDepth());
      } catch {}
      try {
        if (L.parentContainer) {
          L.parentContainer.addAt?.(txt, 0);
          L.parentContainer.sendToBack?.(txt);
        }
      } catch {}
      this.applyOverlayAlpha(txt, value);
      try {
      } catch {}
      return txt;
    } catch {}

    return null;
  }

  private animateOverlaySpawn(overlay: Phaser.GameObjects.GameObject): void {
    if (!this.scene) return;
    try {
      const baseScaleX = (overlay as any).scaleX ?? 1;
      const baseScaleY = (overlay as any).scaleY ?? 1;
      (overlay as any).setScale?.(0);
      this.scene.tweens.add({
        targets: overlay,
        scaleX: baseScaleX,
        scaleY: baseScaleY,
        duration: 200,
        ease: 'Back.easeOut',
      });
    } catch {}
  }

  private animateOverlayPulse(overlay: Phaser.GameObjects.GameObject): void {
    if (!this.scene) return;
    try {
      const baseSX = (overlay as any).scaleX ?? 1;
      const baseSY = (overlay as any).scaleY ?? 1;
      this.scene.tweens.add({
        targets: overlay,
        scaleX: baseSX * 1.1,
        scaleY: baseSY * 1.1,
        duration: 140,
        yoyo: true,
        ease: 'Sine.easeInOut',
      });
    } catch {}
  }

  private updateOverlay(col: number, row: number, value: number): void {
    this.ensureState();
    if (!this.scene || !this.layout) return;
    const cols = this.overlays.length;
    const rows = this.overlays[0]?.length ?? 0;
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;

    const L = this.layout;
    const symbolTotalWidth = L.displayWidth + L.horizontalSpacing;
    const symbolTotalHeight = L.displayHeight + L.verticalSpacing;
    const startX = L.slotX - L.totalGridWidth * 0.5;
    const startY = L.slotY - L.totalGridHeight * 0.5;
    const x = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5 + (L.offsetX ?? 0);
    const y = startY + row * symbolTotalHeight + symbolTotalHeight * 0.5 + (L.offsetY ?? 0);

    const key = this.getTextureKey(value);
    const textureAvailable = !!(key && this.scene.textures?.exists(key));
    const existing = this.overlays[col][row] as any;

    if (!existing || !existing.scene) {
      const overlay = this.createOverlayObject(x, y, value);
      if (!overlay) return;
      this.overlays[col][row] = overlay;
      this.animateOverlaySpawn(overlay);
      return;
    }

    try {
      existing.setPosition?.(x, y);
      existing.setVisible?.(true);
      existing.setDepth?.(this.getOverlayDepth());
      L.parentContainer?.sendToBack?.(existing);
    } catch {}

    let replaceOverlay = false;
    if (existing instanceof Phaser.GameObjects.Image) {
      if (!textureAvailable) {
        replaceOverlay = true;
      } else {
        try {
          if (existing.texture?.key !== key) {
            existing.setTexture(key);
            this.fitOverlayImageToCell(existing);
          }
          this.applyOverlayAlpha(existing, value);
        } catch {
          replaceOverlay = true;
        }
      }
    } else if (existing instanceof Phaser.GameObjects.Text) {
      if (textureAvailable) {
        replaceOverlay = true;
      } else {
        try {
          existing.setText(`x${value}`);
          this.applyOverlayAlpha(existing, value);
        } catch {
          replaceOverlay = true;
        }
      }
    } else {
      replaceOverlay = true;
    }

    if (replaceOverlay) {
      try {
        existing.destroy?.();
      } catch {}
      const overlay = this.createOverlayObject(x, y, value);
      if (!overlay) {
        this.overlays[col][row] = null;
        return;
      }
      this.overlays[col][row] = overlay;
      this.animateOverlaySpawn(overlay);
      return;
    }

    // Ensure existing overlay is visible
    try {
      existing.setVisible?.(true);
    } catch {}
    this.animateOverlayPulse(existing);
  }

  private applyOverlayAlpha(overlay: Phaser.GameObjects.GameObject, value: number): void {
    const alpha = value === SymbolMarker.MARKER_VALUE ? SymbolMarker.FIRST_MARKER_ALPHA : 1;
    try {
      (overlay as any).setAlpha?.(alpha);
    } catch {}
  }
}
