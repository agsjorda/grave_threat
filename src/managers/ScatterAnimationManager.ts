import { Scene } from 'phaser';
import { SpinData } from '../backend/SpinData';
import { gameEventManager, GameEventType } from '../event/EventManager';
import { gameStateManager } from './GameStateManager';
import { EventBus } from '../game/EventBus';
import { SCATTER_SYMBOL_ID } from '../config/GameConfig';
import { SoundEffectType } from './AudioManager';

/** Data shape for scatter animation (replaces tmp_backend Data) */
export interface ScatterData {
  symbols: number[][];
  freeSpins?: number;
  scatterIndex?: number;
}

export interface ScatterAnimationConfig {
  /** Extra delay after the FreeSpin / FreeSpinRetrigger dialog is fully displayed before switching scatters to idle. */
  scatterIdleAfterDialogDelayMs: number;
}

export class ScatterAnimationManager {
  private static instance: ScatterAnimationManager;
  private scene: Scene | null = null;
  private symbolsContainer: Phaser.GameObjects.Container | null = null;
  private dialogsComponent: any = null;
  private isAnimating: boolean = false;
  public delayedScatterData: any = null;
  private scatterSymbols: any[] = [];

  private config: ScatterAnimationConfig = {
    scatterIdleAfterDialogDelayMs: 0,
  };

  private constructor() {}

  public static getInstance(): ScatterAnimationManager {
    if (!ScatterAnimationManager.instance) {
      ScatterAnimationManager.instance = new ScatterAnimationManager();
    }
    return ScatterAnimationManager.instance;
  }

  public initialize(scene: Scene, symbolsContainer: Phaser.GameObjects.Container, dialogsComponent?: any): void {
    this.scene = scene;
    this.symbolsContainer = symbolsContainer;
    this.dialogsComponent = dialogsComponent;
  }

  public setConfig(config: Partial<ScatterAnimationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Run the unified scatter flow: mergeScatterSymbols -> playScatterWinAnimation -> (delay) -> showFreeSpinDialog
   * -> (when dialog fully displayed) playScatterIdleAnimation -> (when dialog closed) unmergeScatterSymbols.
   * Used by normal trigger, retrigger, and buy feature.
   */
  public async runScatterFlow(
    data: ScatterData,
    options?: { isRetrigger?: boolean; newSpins?: number; suppressBlackOverlay?: boolean; scatterGridsOverride?: { x: number; y: number }[] }
  ): Promise<void> {
    if (!this.scene) return;
    const symbolsModule = (this.scene as any)?.symbols;
    if (!symbolsModule?.mergeScatterSymbols || !symbolsModule?.playScatterWinAnimation) {
      console.warn('[ScatterAnimationManager] Symbols or scatter methods not available');
      return;
    }

    const scatterGrids =
      options?.scatterGridsOverride && options.scatterGridsOverride.length
        ? options.scatterGridsOverride.map((g) => ({ x: g.x, y: g.y }))
        : this.getScatterGridsFromData(data).map((g: { x: number; y: number }) => ({ x: g.x, y: g.y }));
    if (!scatterGrids.length) {
      console.warn('[ScatterAnimationManager] No scatter positions in data');
      return;
    }

    await symbolsModule.mergeScatterSymbols(scatterGrids);
    const winDurationMs: number = await symbolsModule.playScatterWinAnimation(scatterGrids);

    // Prefer waiting on the actual win animation loop completion, falling back to a timed delay if needed.
    let waitedOnAnimation = false;
    try {
      if (typeof symbolsModule.waitForScatterWinLoopComplete === 'function') {
        waitedOnAnimation = true;
        await symbolsModule.waitForScatterWinLoopComplete();
      }
    } catch (e) {
      console.warn('[ScatterAnimationManager] waitForScatterWinLoopComplete failed, falling back to timed delay', e);
      waitedOnAnimation = false;
    }

    if (!waitedOnAnimation) {
      // Fallback: if we couldn't reliably wait on the animation event, use a small delay
      // based on the reported animation duration (if available), otherwise a short fixed pause.
      let holdMs = 800;
      if (winDurationMs && winDurationMs > 0) {
        const animHold = winDurationMs * 0.7; // show ~70% of the loop
        holdMs = Math.max(600, animHold);    // minimum readable hold
      }
      await this.delay(holdMs);
    }

    this.determineFreeSpins(data);
    if (options?.isRetrigger && typeof options.newSpins === 'number') {
      this.showRetriggerFreeSpinsDialog(options.newSpins);
    } else {
      this.showFreeSpinsDialog(data, { suppressBlackOverlay: options?.suppressBlackOverlay });
    }
  }

  public async playScatterAnimation(data: ScatterData): Promise<void> {
    if (this.isAnimating || !this.scene || !this.symbolsContainer) {
      console.warn('[ScatterAnimationManager] Cannot play animation - not ready or already animating');
      return;
    }

    this.isAnimating = true;

    try {
      const gameSceneAny = this.scene as any;
      const slotController = gameSceneAny?.slotController;
      if (slotController && typeof slotController.suppressFreeSpinDisplay === 'function') {
        slotController.suppressFreeSpinDisplay();
      }
    } catch (e) {
      console.warn('[ScatterAnimationManager] Failed to suppress SlotController free spin display:', e);
    }

    if (!gameStateManager.isBonus) {
      try {
        const audioMgr = (window as any).audioManager;
        if (audioMgr?.switchToFreeSpinMusic) audioMgr.switchToFreeSpinMusic();
      } catch (e) {
        console.warn('[ScatterAnimationManager] Failed to switch to free spin music', e);
      }
    }

    const isBuyFeature = gameStateManager.isBuyFeatureSpin;
    try {
      await this.runScatterFlow(data);
      if (isBuyFeature) gameStateManager.isBuyFeatureSpin = false;
    } catch (error) {
      console.error('[ScatterAnimationManager] Error during scatter flow:', error);
    } finally {
      if (isBuyFeature && gameStateManager.isBuyFeatureSpin) gameStateManager.isBuyFeatureSpin = false;
      this.isAnimating = false;
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.scene!.time.delayedCall(ms, () => resolve());
    });
  }

  /**
   * Listen for the dialog fully-displayed event and switch scatter symbols to idle,
   * optionally after the configured delay (scatterIdleAfterDialogDelayMs).
   */
  private scheduleIdleOnDialogDisplayed(expectedDialogType: string): void {
    EventBus.once('dialogFullyDisplayed', (dialogType: string) => {
      if (dialogType !== expectedDialogType) return;
      const delayMs = this.config.scatterIdleAfterDialogDelayMs ?? 0;
      const applyIdle = () => {
        const symbolsModule = (this.scene as any)?.symbols;
        if (symbolsModule?.playScatterIdleAnimation) symbolsModule.playScatterIdleAnimation();
      };
      if (delayMs > 0) {
        setTimeout(applyIdle, delayMs);
      } else {
        applyIdle();
      }
    });
  }

  private determineFreeSpins(data: ScatterData): void {
    const freeSpinsFromSpin = this.getFreeSpinsFromSpinData();
    data.scatterIndex = this.estimateScatterIndexFromGrid(data);
    data.freeSpins = freeSpinsFromSpin > 0 ? freeSpinsFromSpin : 0;
    gameStateManager.isScatter = true;
    gameStateManager.scatterIndex = data.scatterIndex || 0;
  }

  /**
   * Get free spins from SpinData using the first item's spinsLeft
   */
  private getFreeSpinsFromSpinData(): number {
    if (!this.scene) return 0;
    const gameScene = this.scene as any;
    const currentSpinData: SpinData | undefined = gameScene?.symbols?.currentSpinData;
    const fsData = currentSpinData?.slot?.freeSpin || currentSpinData?.slot?.freespin;
    const items = Array.isArray(fsData?.items) ? fsData!.items : [];
    const positiveItem = items.find((it: any) => typeof it?.spinsLeft === 'number' && it.spinsLeft > 0);
    const firstItemSpinsLeft = items.length > 0 && typeof items[0]?.spinsLeft === 'number' ? items[0].spinsLeft : 0;
    const countValue = typeof (fsData as any)?.count === 'number' ? (fsData as any).count : 0;
    const derived = Number(positiveItem?.spinsLeft ?? firstItemSpinsLeft ?? 0) || 0;
    return derived > 0 ? derived : countValue > 0 ? countValue : 0;
  }

  /**
   * Estimate scatter index from the current grid (scatterCount - 4, clamped to >= 0)
   */
  private estimateScatterIndexFromGrid(data: ScatterData): number {
    const scatterCount = this.getScatterGridsFromData(data).length;
    const index = Math.max(0, scatterCount - 4);
    return index;
  }

  /**
   * Get scatter (Symbol0) positions from the data.
   * API area is column-major: data.symbols[col][row] with row 0 = bottom of column, last row = top.
   * Game grid uses row 0 = top, so we convert: gameRow = rowCount - 1 - apiRow.
   */
  private getScatterGridsFromData(data: ScatterData): { x: number; y: number }[] {
    const scatterGrids: { x: number; y: number }[] = [];
    if (!Array.isArray(data.symbols)) return scatterGrids;
    for (let col = 0; col < data.symbols.length; col++) {
      const column = data.symbols[col];
      if (!Array.isArray(column)) continue;
      const rowCount = column.length;
      for (let apiRow = 0; apiRow < rowCount; apiRow++) {
        if (column[apiRow] === SCATTER_SYMBOL_ID) {
          const gameRow = rowCount - 1 - apiRow;
          scatterGrids.push({ x: col, y: gameRow });
        }
      }
    }
    return scatterGrids;
  }

  private showFreeSpinsDialog(data: ScatterData, options: { suppressBlackOverlay?: boolean } = {}): void {
    if (!this.dialogsComponent) {
      console.warn('[ScatterAnimationManager] Dialogs component not available');
      return;
    }

    let freeSpins = this.getFreeSpinsFromSpinData();

    // Fallback to backend-provided Data.freeSpins if spinData is missing or zero
    if (freeSpins <= 0 && typeof data?.freeSpins === 'number' && data.freeSpins > 0) {
      freeSpins = data.freeSpins;
    }
    
    // If we couldn't get freeSpins from spinData, log error and use 0
    if (freeSpins === 0) {
      console.error(`[ScatterAnimationManager] Could not get freeSpins from current spinData - dialog will show 0`);
    }

    // Update game state to reflect bonus mode
    gameStateManager.isBonus = true;

    this.scheduleIdleOnDialogDisplayed('FreeSpin');

    // Show the FreeSpin dialog — triggers bonus mode when clicked
    try {
      this.dialogsComponent.showDialog(this.scene, {
        type: 'FreeSpin',
        freeSpins: freeSpins,
        suppressBlackOverlay: options.suppressBlackOverlay
      });
      
      // Emit IS_BONUS event through the EventManager
      gameEventManager.emit(GameEventType.IS_BONUS, {
        scatterCount: data.scatterIndex ?? 0,
        bonusType: 'freeSpins'
      });
      
      // Emit scatter bonus activated event with scatter index and actual free spins for UI updates
      if (this.scene) {
        const eventData = {
          scatterIndex: data.scatterIndex,
          actualFreeSpins: freeSpins
        };
        this.scene.events.emit('scatterBonusActivated', eventData);
      }
      
      // Set up listener for when dialog animations complete
      this.setupDialogCompletionListener();
      
    } catch (error) {
      console.error('[ScatterAnimationManager] Error showing dialog effects:', error);
    }
  }

  /**
   * Show a retrigger dialog during an active bonus with an explicit number of new spins.
   * This bypasses SpinData parsing and uses the provided newSpins value.
   */
  public showRetriggerFreeSpinsDialog(newSpins: number): void {
    if (!this.scene) return;
    if (!this.dialogsComponent) {
      console.warn('[ScatterAnimationManager] Dialogs component not available');
      return;
    }
    
    const spins = Math.max(0, Number(newSpins) || 0);

    // Keep bonus mode active
    gameStateManager.isBonus = true;
    try {
      const audioMgr = (window as any).audioManager;
      if (audioMgr && typeof audioMgr.playSoundEffect === 'function') {
        audioMgr.playSoundEffect(SoundEffectType.DIALOG_FREESPIN);
      }
    } catch (e) {
      console.warn('[ScatterAnimationManager] Failed to play free spin dialog SFX', e);
    }
    // A retrigger explicitly means the bonus is continuing, so make sure any
    // tentative "bonus finished" state set earlier in the spin (e.g. from
    // REELS_STOP heuristics) is cleared before congrats logic can react to it.
    try {
      gameStateManager.isBonusFinished = false;
    } catch {}
    
    this.scheduleIdleOnDialogDisplayed('FreeSpinRetrigger');

    try {
      this.dialogsComponent.showDialog(this.scene, {
        type: 'FreeSpinRetrigger',
        freeSpins: spins,
        isRetrigger: true
      });
      
      const eventData = {
        scatterIndex: 0,
        actualFreeSpins: spins,
        isRetrigger: true
      };
      this.scene.events.emit('scatterBonusActivated', eventData);
      
      this.setupDialogCompletionListener();
    } catch (error) {
      console.error('[ScatterAnimationManager] Error showing retrigger dialog:', error);
    }
  }

  public isAnimationInProgress(): boolean {
    return this.isAnimating;
  }

  /**
   * Set delayed scatter animation data (called when win dialogs need to show first)
   */
  public setDelayedScatterAnimation(data: any): void {
    this.delayedScatterData = data;
  }

  /**
   * If delayed scatter data was set (deferred for win dialogs), play it now.
   * Call from Game after win dialogs close (e.g. dialogAnimationsComplete handler).
   */
  public tryPlayDelayedScatterAnimation(): void {
    if (!this.delayedScatterData) return;
    const raw = this.delayedScatterData;
    this.delayedScatterData = null;
    if (!this.scene) return;
    const data: ScatterData = (raw && Array.isArray((raw as ScatterData).symbols))
      ? (raw as ScatterData)
      : { symbols: (raw as any)?.slot?.area ?? (raw as any)?.area ?? [] };
    this.scene.time.delayedCall(100, () => {
      this.playScatterAnimation(data);
    });
  }

  private setupDialogCompletionListener(): void {
    if (!this.scene) return;
    
    let completionHandled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (completionHandled) return;
      completionHandled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      this.resetAllSymbolsAndAnimations();
    };

    this.scene.events.once('dialogAnimationsComplete', finish);

    // Fallback poll: recover after dialog is actually gone
    const pollUntilDialogClosed = () => {
      fallbackTimer = setTimeout(() => {
        if (completionHandled) return;
        const dialogsAny = this.dialogsComponent as any;
        const dialogShowing = typeof dialogsAny?.isDialogShowing === 'function' && dialogsAny.isDialogShowing();
        const radialLightRunning = typeof dialogsAny?.isRadialLightTransitionInProgress === 'function'
          && dialogsAny.isRadialLightTransitionInProgress();
        if (dialogShowing || radialLightRunning) {
          pollUntilDialogClosed();
          return;
        }
        finish();
      }, 1000);
    };
    pollUntilDialogClosed();
  }

  private isInActiveBonusMode(): boolean {
    const freespinCount = (this.scene as any)?.symbols?.currentSpinData?.slot?.freespin?.count ?? 0;
    return freespinCount > 0 || gameStateManager.isBonus;
  }

  private async resetAllSymbolsAndAnimations(): Promise<void> {
    try {
      gameStateManager.isScatter = false;
      if (!this.isInActiveBonusMode()) {
        gameStateManager.isBonus = false;
      }
      gameStateManager.scatterIndex = 0;

      if (this.symbolsContainer) {
        this.symbolsContainer.setAlpha(1);
        this.symbolsContainer.setVisible(true);
      }

      this.showScatterSymbols();

      if (this.scene) {
        this.scene.events.emit('scatterBonusCompleted');
      }
    } catch (error) {
      console.error('[ScatterAnimationManager] Error resetting symbols and animations:', error);
    }
  }

  private showScatterSymbols(): void {
    if (!this.scene) return;
    this.scatterSymbols.forEach(symbol => {
      if (symbol && !symbol.destroyed) symbol.setVisible(true);
    });
  }

  /**
   * Register a scatter symbol for management
   */
  public registerScatterSymbol(symbol: any): void {
    if (symbol && !this.scatterSymbols.includes(symbol)) {
      this.scatterSymbols.push(symbol);
    }
  }

  public unregisterScatterSymbol(symbol: any): void {
    const index = this.scatterSymbols.indexOf(symbol);
    if (index !== -1) {
      this.scatterSymbols.splice(index, 1);
    }
  }

  public clearScatterSymbols(): void {
    this.scatterSymbols = [];
  }

  public destroy(): void {
    this.scene = null;
    this.symbolsContainer = null;
    this.isAnimating = false;
  }
} 
