import { Scene } from 'phaser';
import { SpinData } from '../../backend/SpinData';
import { QUALIFYING_CLUSTER_COUNT, getOutCount, getOutWin } from './Spin';
import { UI_CONFIG } from '../../config/GameConfig';
import { Logger } from '../../utils/Logger';
import { CurrencyManager } from './CurrencyManager';
import { formatCurrencyNumber } from '../../utils/NumberPrecisionFormatter';

interface WinTrackerLayoutOptions {
  offsetX?: number;
  offsetY?: number;
  spacing?: number;
  iconScale?: number;
  innerGap?: number;
}

interface SymbolSummary {
  lines: number;
  totalWin: number;
  multiplier: number;
  baseValue: number;
}

export class WinTracker {
  private container!: Phaser.GameObjects.Container;
  private scene!: Scene;
  private lastSpinData: SpinData | null = null;

  private baseX: number = 0;
  private baseY: number = 0;
  private offsetX: number = 0;
  private offsetY: number = -45;
  private itemSpacing: number = 80;
  private iconScale: number = 0.01;
  private innerGap: number = 13;
  private horizontalGap: number = 20;
  private autoHideTimer: Phaser.Time.TimerEvent | null = null;
  private pageTimer: Phaser.Time.TimerEvent | null = null;
  private pagedItems: Array<[number, SymbolSummary]> | null = null;
  private pagedIndex: number = 0;
  private pageSize: number = 2;
  private pageDurationMs: number = 1200;
  private pageFadeMs: number = 200;

  private readonly depth: number = 905;
  private readonly shadowOffsetX: number = 4;
  private readonly shadowOffsetY: number = 4;
  private readonly shadowAlpha: number = 0.45;
  private readonly labelFontSize: number = 14;
  private readonly labelFontFamily: string = 'Poppins-Bold';

  create(scene: Scene): void {
    this.scene = scene;
    this.baseX = scene.scale.width * 0.5;
    // ADJUST HERE: WinTracker vertical base position (0.5 = center, 0.76 = bottom area)
    this.baseY = scene.scale.height * 0.5;

    this.container = scene.add.container(
      this.baseX + this.offsetX,
      this.baseY + this.offsetY
    );
    this.container.setDepth(this.depth);
    this.container.setVisible(false);
    this.container.setAlpha(1);
  }

  clear(): void {
    if (!this.container) {
      return;
    }
    if (this.autoHideTimer) {
      try { this.autoHideTimer.remove(false); } catch {}
      this.autoHideTimer = null;
    }
    this.stopPaging();
    this.container.removeAll(true);
    this.container.setVisible(false);
    this.container.setAlpha(1);
    this.lastSpinData = null;
  }

  updateFromSpinData(spinData: SpinData | null): void {
    this.lastSpinData = spinData;
  }

  showLatest(): void {
    if (!this.container) {
      return;
    }
    this.renderFromSpinData(this.lastSpinData);
  }

  /**
   * Show tracker for ONLY the current tumble using its outs array
   */
  public showForTumble(
    outs: Array<{ symbol?: number; count?: number; win?: number }> | null,
    spinData: SpinData | null,
    tumbleWinOverride?: number
  ): void {
    if (!this.container) return;
    this.stopPaging();
    const summary = this.buildSummaryFromTumbleOuts(outs, spinData, tumbleWinOverride);
    this.renderFromSummary(summary);
  }

  public showPagedForTumble(
    outs: Array<{ symbol?: number; count?: number; win?: number }> | null,
    spinData: SpinData | null,
    pageSize: number = 2,
    pageDurationMs: number = 1200,
    pageFadeMs: number = 200,
    tumbleWinOverride?: number
  ): void {
    if (!this.container) return;
    this.stopPaging();
    const summary = this.buildSummaryFromTumbleOuts(outs, spinData, tumbleWinOverride);
    if (!summary || summary.size <= pageSize) {
      this.renderFromSummary(summary);
      return;
    }
    this.pagedItems = Array.from(summary.entries()).sort(
      (a, b) => b[1].totalWin - a[1].totalWin
    );
    this.pagedIndex = 0;
    this.pageSize = Math.max(1, pageSize);
    this.pageDurationMs = Math.max(300, pageDurationMs);
    this.pageFadeMs = Math.max(0, pageFadeMs);
    this.renderPagedSlice();
  }

  private renderFromSpinData(spinData: SpinData | null): void {
    const summary = this.buildSummary(spinData);
    this.renderFromSummary(summary);
  }

  private renderFromSummary(summary: Map<number, SymbolSummary> | null): void {
    this.container.removeAll(true);
    if (!summary) {
      this.container.setVisible(false);
      return;
    }

    this.container.setVisible(true);
    this.container.setAlpha(1);

    const items = Array.from(summary.entries()).sort(
      (a, b) => b[1].totalWin - a[1].totalWin
    );

    const isVertical = false;
    const lineSpacing = Math.max(this.labelFontSize + 12, 28);
    if (isVertical) {
      const spacing = this.itemSpacing;
      const startY = -((items.length - 1) * lineSpacing) / 2;
      let index = 0;
      for (const [symbolId, data] of items) {
        const y = startY + index * lineSpacing;
        const item = this.createSymbolItem(symbolId, data);
        item.container.setPosition(0, y);
        this.container.add(item.container);
        index += 1;
      }
      return;
    }

    const itemContainers: Array<{ container: Phaser.GameObjects.Container; width: number }> = [];
    for (const [symbolId, data] of items) {
      const item = this.createSymbolItem(symbolId, data);
      itemContainers.push(item);
    }
    const gap = Math.max(10, this.horizontalGap);
    const totalWidth = itemContainers.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, itemContainers.length - 1);
    let cursor = -totalWidth / 2;
    for (const item of itemContainers) {
      item.container.setPosition(cursor + item.width / 2, 0);
      this.container.add(item.container);
      cursor += item.width + gap;
    }
  }

  private renderPagedSlice(): void {
    if (!this.container || !this.scene || !this.pagedItems) {
      return;
    }
    const start = this.pagedIndex * this.pageSize;
    const slice = this.pagedItems.slice(start, start + this.pageSize);
    const summary = new Map<number, SymbolSummary>(slice);
    this.renderFromSummary(summary);
    this.container.setVisible(true);
    this.container.setAlpha(1);

    const hasNext = (start + this.pageSize) < this.pagedItems.length;
    if (!hasNext) {
      return;
    }

    if (this.pageTimer) {
      try { this.pageTimer.remove(false); } catch {}
      this.pageTimer = null;
    }
    this.pageTimer = this.scene.time.delayedCall(this.pageDurationMs, () => {
      this.advancePagedSlice();
    });
  }

  private advancePagedSlice(): void {
    if (!this.container || !this.scene || !this.pagedItems) {
      return;
    }
    this.pagedIndex += 1;
    const start = this.pagedIndex * this.pageSize;
    if (start >= this.pagedItems.length) {
      this.stopPaging();
      return;
    }

    const doRenderNext = () => {
      this.renderPagedSlice();
      if (this.pageFadeMs > 0) {
        this.container.setAlpha(0);
        this.scene.tweens.add({
          targets: this.container,
          alpha: 1,
          duration: this.pageFadeMs,
          ease: 'Sine.easeOut'
        });
      }
    };

    if (this.pageFadeMs > 0) {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: this.pageFadeMs,
        ease: 'Sine.easeIn',
        onComplete: doRenderNext
      });
    } else {
      doRenderNext();
    }
  }

  private stopPaging(): void {
    if (this.pageTimer) {
      try { this.pageTimer.remove(false); } catch {}
      this.pageTimer = null;
    }
    this.pagedItems = null;
    this.pagedIndex = 0;
  }

  private buildSummary(spinData: SpinData | null): Map<number, SymbolSummary> | null {
    // Ignore paylines entirely; build summary only from tumble (cluster) wins
    if (!spinData || !spinData.slot) {
      return null;
    }
    const tumbles: any[] = Array.isArray((spinData.slot as any)?.tumbles) ? (spinData.slot as any).tumbles : [];
    if (tumbles.length === 0) {
      return null;
    }

    const summary = new Map<number, SymbolSummary>();
    for (const tumble of tumbles) {
      const outs = Array.isArray((tumble as any)?.symbols?.out) ? (tumble as any).symbols.out as Array<{ symbol?: number; count?: number; win?: number }> : [];
      for (const out of outs) {
        const symbolId = Number(out?.symbol);
        const count = getOutCount(out as any);
        const win = getOutWin(out as any);
        if (!isFinite(symbolId) || count <= 0 || count < QUALIFYING_CLUSTER_COUNT) continue;
        const existing = summary.get(symbolId) || { lines: 0, totalWin: 0, multiplier: 1, baseValue: 0 };
        existing.lines += count;
        existing.totalWin += win;
        summary.set(symbolId, existing);
      }
    }

    for (const [symbolId, data] of Array.from(summary.entries())) {
      if (data.totalWin > 0 && data.lines > 0) {
        data.baseValue = data.totalWin / data.lines;
      } else {
        data.baseValue = 0;
      }
      summary.set(symbolId, data);
    }

    return summary.size > 0 ? summary : null;
  }

  private createSymbolItem(symbolId: number, data: SymbolSummary): { container: Phaser.GameObjects.Container; width: number } {
    const itemContainer = this.scene.add.container(0, 0);
    // Prefer spine-based symbol from the game; fallback to PNG
    const { icon, isSpine } = this.createSymbolIcon(symbolId);
    let shadow: Phaser.GameObjects.Image | null = null;
    if (!isSpine) {
      const key = `symbol_${symbolId}`;
      shadow = this.scene.add.image(0, 0, key);
      shadow.setOrigin(0.5, 0.5);
      shadow.setScale(this.iconScale);
      shadow.setTint(0x000000);
      shadow.setAlpha(this.shadowAlpha);
    }
    const iconDW = (icon as any).displayWidth ?? (icon as any).width ?? 40;

    const countLabel = this.scene.add.text(
      0,
      0,
      `${data.lines}`,
      {
        fontSize: `${this.labelFontSize}px`,
        color: '#ffffff',
        fontFamily: this.labelFontFamily,
        stroke: '#004D00',
        strokeThickness: 4,
        align: 'center'
      }
    );
    countLabel.setOrigin(0.5, 0.5);

    const eqLabel = this.scene.add.text(
      0,
      0,
      '=',
      {
        fontSize: `${this.labelFontSize}px`,
        color: '#ffffff',
        fontFamily: this.labelFontFamily,
        stroke: '#004D00',
        strokeThickness: 4,
        align: 'center'
      }
    );
    eqLabel.setOrigin(0.5, 0.5);
    //eqLabel.setShadow(1, .5, '#E7441E', 1, true, true);

    const valueLabel = this.scene.add.text(
      0,
      0,
      (() => {
        const isDemo = (this.scene as any).gameAPI?.getDemoState();
        const currencyPrefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
        return `${currencyPrefix}${formatCurrencyNumber(data.totalWin)}`;
      })(),
      {
        fontSize: `${this.labelFontSize}px`,
        color: '#ffffff',
        fontFamily: this.labelFontFamily,
        stroke: '#004D00',
        strokeThickness: 4,
        align: 'center'
      }
    );
    valueLabel.setOrigin(0.5, 0.5);
    //valueLabel.setShadow(1, .5, '#E7441E', 1, true, true);

    const baseGap = this.innerGap;
    const gap = Math.max(6, Math.floor(baseGap * 0.6));

    const totalWidth =
      countLabel.displayWidth +
      gap +
      iconDW +
      gap +
      eqLabel.displayWidth +
      gap +
      valueLabel.displayWidth;

    let cursor = -totalWidth * 0.5;

    countLabel.setPosition(cursor + countLabel.displayWidth * 0.5, 0);
    cursor += countLabel.displayWidth + gap;

    icon.setPosition(cursor + iconDW * 0.5, 0);
    if (shadow) {
      shadow.setPosition(icon.x + this.shadowOffsetX, icon.y + this.shadowOffsetY);
    }
    cursor += iconDW + gap;

    eqLabel.setPosition(cursor + eqLabel.displayWidth * 0.5, 0);
    cursor += eqLabel.displayWidth + gap;

    valueLabel.setPosition(cursor + valueLabel.displayWidth * 0.5, 0);

    if (shadow) {
      itemContainer.add(shadow);
    }
    itemContainer.add(icon);
    itemContainer.add(countLabel);
    itemContainer.add(eqLabel);
    itemContainer.add(valueLabel);

    let width = totalWidth;
    try {
      const b = itemContainer.getBounds();
      if (b && b.width > 0) {
        width = b.width;
      }
    } catch { }

    return { container: itemContainer, width };
  }

  private buildSummaryFromTumbleOuts(
    outs: Array<{ symbol?: number; count?: number; win?: number }> | null,
    spinData: SpinData | null,
    tumbleWinOverride?: number
  ): Map<number, SymbolSummary> | null {
    if (!outs || outs.length === 0) return null;
    const summary = new Map<number, SymbolSummary>();
    for (const out of outs) {
      const symbolId = Number(out?.symbol);
      const count = getOutCount(out as any);
      const win = getOutWin(out as any);
      if (!isFinite(symbolId) || count < QUALIFYING_CLUSTER_COUNT || win <= 0) continue;
      const existing = summary.get(symbolId) || {
        lines: 0,
        totalWin: 0,
        multiplier: 1,
        baseValue: 0
      };
      existing.lines += count;
      existing.totalWin += win;
      summary.set(symbolId, existing);
    }
    if (summary.size === 0) return null;

    // Compute baseValue per symbol from unscaled totals.
    for (const [symbolId, data] of Array.from(summary.entries())) {
      data.baseValue = data.totalWin > 0 && data.lines > 0 ? (data.totalWin / data.lines) : 0;
      summary.set(symbolId, data);
    }

    // If we have an explicit tumble win value from SpinData, normalize per-symbol totals
    // so their sum matches this authoritative amount (used by the header \"YOU WON\" text).
    const targetTotal =
      typeof tumbleWinOverride === 'number' && Number.isFinite(tumbleWinOverride) && tumbleWinOverride > 0
        ? tumbleWinOverride
        : null;

    if (targetTotal !== null) {
      let currentTotal = 0;
      for (const [, data] of summary.entries()) {
        currentTotal += data.totalWin;
      }
      if (currentTotal > 0 && Math.abs(currentTotal - targetTotal) > 0.0001) {
        const scale = targetTotal / currentTotal;
        for (const [symbolId, data] of Array.from(summary.entries())) {
          const scaledTotal = Number((data.totalWin * scale).toFixed(2));
          data.totalWin = scaledTotal;
          summary.set(symbolId, data);
        }
      }
    }

    return summary;
  }

  private createSymbolIcon(symbolId: number): { icon: any; isSpine: boolean } {
    // Win tracker should always use static symbol textures from
    // assets/symbols/high/pastry_cub_symbols/statics.
    const key = `symbol_${symbolId}`;
    if (!this.scene.textures.exists(key)) {
      console.warn(`[WinTracker] Texture not found for symbol ${symbolId} (key: ${key}), creating placeholder`);
      const placeholder = this.scene.add.rectangle(0, 0, 40, 40, 0x888888);
      placeholder.setOrigin(0.5, 0.5);
      placeholder.setScale(this.iconScale);
      return { icon: placeholder, isSpine: false };
    }
    const img = this.scene.add.image(0, 0, key);
    img.setOrigin(0.5, 0.5);
    img.setScale(this.iconScale);
    return { icon: img, isSpine: false };
  }

  public setLayout(options: WinTrackerLayoutOptions): void {
    if (typeof options.offsetX === 'number') {
      this.offsetX = options.offsetX;
    }
    if (typeof options.offsetY === 'number') {
      this.offsetY = options.offsetY;
    }
    if (typeof options.spacing === 'number' && options.spacing > 0) {
      this.itemSpacing = options.spacing;
    }
    if (typeof options.iconScale === 'number' && options.iconScale > 0) {
      this.iconScale = options.iconScale;
    }
    if (typeof options.innerGap === 'number' && options.innerGap >= 0) {
      this.innerGap = options.innerGap;
    }

    if (this.container) {
      this.container.setPosition(
        this.baseX + this.offsetX,
        this.baseY + this.offsetY
      );
    }
  }

  public autoHideAfter(delayMs: number): void {
    if (!this.scene || !this.container) {
      return;
    }
    if (this.autoHideTimer) {
      try { this.autoHideTimer.remove(false); } catch {}
      this.autoHideTimer = null;
    }
    this.autoHideTimer = this.scene.time.delayedCall(delayMs, () => {
      this.autoHideTimer = null;
      this.fadeOut(250);
    });
  }

  /**
   * Fade the tracker out before clearing it.
   * Used by callers instead of instantly hiding to give a smoother UX.
   */
  public hideWithFade(durationMs: number = 250): void {
    this.stopPaging();
    this.fadeOut(durationMs);
  }

  private fadeOut(durationMs: number): void {
    if (!this.scene || !this.container) {
      return;
    }
    if (!this.container.visible) {
      return;
    }
    try {
      this.scene.tweens.killTweensOf(this.container);
    } catch {}
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: durationMs,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.clear();
      }
    });
  }
}

export default WinTracker;
