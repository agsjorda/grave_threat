/**
 * FreeSpinController - Manages free spin autoplay during bonus mode
 * 
 * Responsibilities:
 * - Track free spin state (active, remaining spins)
 * - Handle free spin autoplay flow
 * - Coordinate with game events for spin timing
 */

import type { Game } from '../../scenes/Game';
import type { PendingFreeSpinsData } from './types';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { TurboConfig } from '../../../config/TurboConfig';
import { getFreespinFromSlot, getFreespinFromSpinData } from '../../../backend/SpinData';

/**
 * Manages the free spin autoplay system during bonus mode
 */
export class FreeSpinController {
  private scene: Game;
  
  /** Whether free spin autoplay is currently active */
  private _isActive: boolean = false;
  
  /** Number of free spins remaining */
  private spinsRemaining: number = 0;
  
  /** Timer for scheduling next spin */
  private autoplayTimer: Phaser.Time.TimerEvent | null = null;

  /** Timer used to retry a blocked `performSpin()` call. */
  private spinRetryTimer: Phaser.Time.TimerEvent | null = null;
  
  /** Waiting for reels to stop before continuing */
  private waitingForReelsStop: boolean = false;
  
  /** Waiting for win lines to complete before continuing */
  private waitingForWinAnimation: boolean = false;
  
  /** Whether free spin autoplay has been triggered (prevents duplicates) */
  private hasTriggered: boolean = false;
  
  /** Waiting for reels to start to decrement counter */
  private awaitingReelsStart: boolean = false;
  
  /** Timestamp for when the current in-flight spin request was emitted. */
  private inFlightSpinRequestedAt: number | null = null;

  /** Pending free spins data from scatter bonus activation */
  private pendingFreeSpinsData: PendingFreeSpinsData | null = null;
  
  /** Whether dialog listener has been set up */
  private dialogListenerSetup: boolean = false;
  private lastReportedSpinsLeft: number | null = null;
  /** @deprecated kept for reset() compatibility – no longer drives retrigger logic */
  private lastReportedItemsLen: number | null = null;
  private lastReportedCount: number | null = null;

  /** Callbacks to integrate with main Symbols class */
  private callbacks: {
    onResetScatterSymbols?: () => Promise<void>;
    onShowCongratsDialog?: () => void;
    onSetTurboMode?: (enabled: boolean) => void;
    getCurrentSpinData?: () => any;
  } = {};

  constructor(scene: Game) {
    this.scene = scene;
  }

  // ============================================================================
  // PUBLIC ACCESSORS
  // ============================================================================

  /**
   * Check if free spin autoplay is currently active
   */
  public get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Get the number of spins remaining
   */
  public getSpinsRemaining(): number {
    return this.spinsRemaining;
  }

  /**
   * Synchronize the internal counter with server-reported spinsLeft
   * Used when a retrigger occurs during bonus
   */
  public setSpinsRemaining(spinsRemaining: number): void {
    const normalized = Math.max(0, Number(spinsRemaining) || 0);
    this.spinsRemaining = normalized;
  }

  /**
   * Set pending free spins data (from scatter bonus activation)
   */
  public setPendingFreeSpinsData(data: PendingFreeSpinsData): void {
    this.pendingFreeSpinsData = data;
  }

  /**
   * Register callbacks for integration with main Symbols class
   */
  public setCallbacks(callbacks: {
    onResetScatterSymbols?: () => Promise<void>;
    onShowCongratsDialog?: () => void;
    onSetTurboMode?: (enabled: boolean) => void;
    getCurrentSpinData?: () => any;
  }): void {
    this.callbacks = callbacks;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Set up event listeners for free spin autoplay
   */
  public setupEventListeners(): void {
    // Listen for reels stop to continue autoplay
    gameEventManager.on(GameEventType.REELS_STOP, () => {
      if (this._isActive && this.waitingForReelsStop) {
        this.waitingForReelsStop = false;
        this.continueAutoplay();
      }
    });
    
    // Listen for reels start to safely decrement counter
    gameEventManager.on(GameEventType.REELS_START, () => {
      if (this._isActive && this.awaitingReelsStart) {
        const before = this.spinsRemaining;

        // Prefer deriving remaining spins from the current spin data.
        // This prevents retrigger flows from desyncing the internal counter and
        // ending autoplay early (which appears as skipped spins).
        let derived: number | null = null;
        try {
          if (this.callbacks.getCurrentSpinData) {
            const spinData = this.callbacks.getCurrentSpinData();
            const info = this.getSpinsInfoFromSpinData(spinData);
            if (typeof info?.spinsLeft === 'number' && info.spinsLeft > 0) {
              derived = Math.max(0, info.spinsLeft - 1);
            }
          }
        } catch { }

        if (derived !== null) {
          this.spinsRemaining = derived;
        } else {
          if (this.spinsRemaining > 0) {
            this.spinsRemaining -= 1;
          }
        }

        this.awaitingReelsStart = false;
      }
    });
    
    // Listen for win stop to schedule next spin
    gameEventManager.on(GameEventType.WIN_STOP, () => {
      if (this._isActive && this.waitingForWinAnimation) {
        this.handleWinStop();
      }
    });
  }

  /**
   * Reset the dialog listener setup flag
   */
  public resetDialogListenerSetup(): void {
    this.dialogListenerSetup = false;
  }

  // ============================================================================
  // TRIGGER & START
  // ============================================================================

  /**
   * Trigger autoplay for free spins if available
   */
  public triggerAutoplay(): void {
    // Prevent duplicate triggering
    if (this.hasTriggered || this._isActive) {
      return;
    }

    // Apply deferred bonus-mode transition right before autoplay starts.
    try {
      const sceneAny: any = this.scene as any;
      const deferred = sceneAny?.__deferredBonusStart;
      if (typeof deferred === 'function') {
        sceneAny.__deferredBonusStart = null;
        deferred();
      }
    } catch {}
    
    // Check if we're in bonus mode
    if (!gameStateManager.isBonus) {
      return;
    }

    let freeSpinsCount = 0;
    let spinDataSpinsLeft = 0;
    

    // Prefer authoritative spinsLeft from current spin data.
    // This avoids retrigger flows (dialogs) overwriting the remaining counter with just
    // the "increment" amount (pendingFreeSpinsData.actualFreeSpins).
    if (gameStateManager.isBonus && this.callbacks.getCurrentSpinData) {
      const spinData = this.callbacks.getCurrentSpinData();
      const info = this.getSpinsInfoFromSpinData(spinData);
      spinDataSpinsLeft = info.spinsLeft;
      this.lastReportedSpinsLeft = info.spinsLeft;
      this.lastReportedItemsLen = info.itemsLen;
      try {
        const fs = getFreespinFromSpinData(spinData);
        const countValue = typeof fs?.count === 'number' ? fs.count : null;
        if (countValue !== null) {
          this.lastReportedCount = countValue;
        }
      } catch {}

      if (spinDataSpinsLeft > 0) {
        freeSpinsCount = spinDataSpinsLeft;
        // Clear any stale pending data so it cannot override the counter later.
        this.pendingFreeSpinsData = null;
      }
    }

    // Fallback: use pending data only when spin data doesn't provide spinsLeft.
    if (freeSpinsCount <= 0 && this.pendingFreeSpinsData) {
      if (this.pendingFreeSpinsData.actualFreeSpins > 0) {
        freeSpinsCount = this.pendingFreeSpinsData.actualFreeSpins;
      } else {
      }
      this.pendingFreeSpinsData = null;
    }
    
    if (freeSpinsCount > 0) {
      this.hasTriggered = true;
      this.start(freeSpinsCount);
    } else {
    }
  }

  /**
   * Start free spin autoplay
   */
  public async start(spinCount: number): Promise<void> {
    
    this._isActive = true;
    this.spinsRemaining = spinCount;
    if (this.lastReportedSpinsLeft === null) {
      this.lastReportedSpinsLeft = spinCount;
    }
    
    // Set global autoplay state
    gameStateManager.isAutoPlaying = true;
    gameStateManager.isAutoPlaySpinRequested = true;
    if (this.scene.gameData) {
      this.scene.gameData.isAutoPlaying = true;
    }
    
    // Apply turbo mode if enabled
    if (gameStateManager.isTurbo && this.callbacks.onSetTurboMode) {
      this.callbacks.onSetTurboMode(true);
    }
    
    // Reset scatter symbols before starting
    if (this.callbacks.onResetScatterSymbols) {
      try {
        await this.callbacks.onResetScatterSymbols();
      } catch (e) {
        console.warn('[FreeSpinController] Failed to reset scatter symbols:', e);
      }
    }
    
    // Perform first spin
    this.performSpin();
  }

  // ============================================================================
  // SPIN EXECUTION
  // ============================================================================

  /**
   * Perform a single free spin
   */
  private async performSpin(): Promise<void> {
    if (!this._isActive || this.spinsRemaining <= 0) {
      this.stop();
      return;
    }

		// Guard against duplicate spin requests while a spin is already in-flight.
		// If FREE_SPIN_AUTOPLAY is emitted twice, fake data free-spin items can advance twice
		// and the remaining display will jump unexpectedly (e.g. showing 12).
		if (this.awaitingReelsStart || this.waitingForReelsStop) {
			// Safety: if our "reels in-flight" flags are stale, clear them so retrigger
			// resume can proceed. We only do this after a short grace period to avoid
			// re-enabling true duplicates that arrive back-to-back.
			const now = this.scene?.time?.now ?? Date.now();
			const inFlightMs = this.inFlightSpinRequestedAt == null ? 0 : now - this.inFlightSpinRequestedAt;
			const idle = !gameStateManager.isReelSpinning && !gameStateManager.isProcessingSpin;
			const hardStaleMs = 4500;

			if (this.inFlightSpinRequestedAt == null) {
				console.warn('[FreeSpinController] performSpin clearing in-flight flags (missing inFlightSpinRequestedAt)');
				this.awaitingReelsStart = false;
				this.waitingForReelsStop = false;
			} else if (inFlightMs > hardStaleMs) {
				console.warn(`[FreeSpinController] performSpin clearing stale in-flight flags (hard timeout: ${inFlightMs}ms)`);
				this.awaitingReelsStart = false;
				this.waitingForReelsStop = false;
				this.inFlightSpinRequestedAt = null;
			} else if (idle && inFlightMs > 1500) {
				console.warn('[FreeSpinController] performSpin clearing stale in-flight flags (stalled > 1500ms, idle)');
				this.awaitingReelsStart = false;
				this.waitingForReelsStop = false;
				this.inFlightSpinRequestedAt = null;
			} else {
				console.warn('[FreeSpinController] performSpin ignored - previous spin still in progress', {
					inFlightMs,
					idle,
					awaitingReelsStart: this.awaitingReelsStart,
					waitingForReelsStop: this.waitingForReelsStop
				});
				return;
			}
		}

    
    // Check if still in bonus mode
    if (!gameStateManager.isBonus) {
      this.stop();
      return;
    }

    // Check if win dialog is showing
    if (gameStateManager.isShowingWinDialog) {
      this.scene.events.once('dialogAnimationsComplete', () => {
        const baseDelay = 0;
        const turboDelay = gameStateManager.isTurbo 
          ? baseDelay * TurboConfig.TURBO_DELAY_MULTIPLIER 
          : baseDelay;
        this.scene.time.delayedCall(turboDelay, () => this.performSpin());
      });
      return;
    }

		// Don't start a new free spin while symbols are mid-flow (tumble/reelDrop/scatter retrigger).
		// This prevents `Tumble total mismatch` from overlapping tumble state.
		try {
			const symbolsAny: any = (this.scene as any)?.symbols;
			const tumbleInProgress = !!(symbolsAny && (symbolsAny as any).tumbleInProgress);
			const tumbleDropInProgress = !!(symbolsAny && (symbolsAny as any).tumbleDropInProgress);
			const reelDropInProgress = !!(symbolsAny && (symbolsAny as any).reelDropInProgress);
			const scatterRetriggerAnimating =
				typeof symbolsAny?.isScatterRetriggerAnimationInProgress === 'function'
					? !!symbolsAny.isScatterRetriggerAnimationInProgress()
					: !!symbolsAny?.scatterRetriggerAnimationInProgress;

			if (tumbleInProgress || tumbleDropInProgress || reelDropInProgress || scatterRetriggerAnimating) {
				if (!this.spinRetryTimer) {
					this.spinRetryTimer = this.scene.time.delayedCall(120, () => {
						this.spinRetryTimer = null;
						void this.performSpin();
					});
				}
				return;
			}
		} catch {}

    try {
      gameEventManager.emit(GameEventType.FREE_SPIN_AUTOPLAY);
      
      this.awaitingReelsStart = true;
      this.waitingForReelsStop = true;
      this.inFlightSpinRequestedAt = this.scene?.time?.now ?? Date.now();
    } catch (error) {
      console.error('[FreeSpinController] Error during spin:', error);
      this.stop();
    }
  }

  /**
   * Continue autoplay after reels stop
   */
  private continueAutoplay(): void {
    this.waitingForWinAnimation = true;
  }

  /**
   * True when current spinData's free-spin item (area match) is marked isMaxWin.
   * After this spin, no further free spins should run; MaxWin dialog ends bonus.
   */
  public static isCurrentFreeSpinItemMaxWin(spinData: any): boolean {
    try {
      const slot = spinData?.slot;
      const fs = getFreespinFromSlot(slot);
      const items = fs?.items;
      const area = slot?.area;
      if (!Array.isArray(items) || !Array.isArray(area)) return false;
      const areaJson = JSON.stringify(area);
      const item = items.find(
        (it: any) => Array.isArray(it?.area) && JSON.stringify(it.area) === areaJson,
      );
      return (item as any)?.isMaxWin === true;
    } catch {
      return false;
    }
  }

  /**
   * Stop free-spin autoplay after max win: no congrats queue, no further simulateFreeSpin.
   * Call when the spin that hit isMaxWin completes (same moment as MaxWin dialog).
   */
  public stopFreeSpinsAfterMaxWin(): void {
    if (this.spinRetryTimer) {
      try { this.spinRetryTimer.destroy(); } catch {}
      this.spinRetryTimer = null;
    }
    if (this.autoplayTimer) {
      this.autoplayTimer.destroy();
      this.autoplayTimer = null;
    }
    this._isActive = false;
    this.spinsRemaining = 0;
    this.waitingForReelsStop = false;
    this.waitingForWinAnimation = false;
    this.hasTriggered = false;
    this.awaitingReelsStart = false;
    this.inFlightSpinRequestedAt = null;
    this.dialogListenerSetup = false;
    gameStateManager.bonusEndedByMaxWin = true;
    gameStateManager.isAutoPlaying = false;
    gameStateManager.isAutoPlaySpinRequested = false;
    if (this.scene.gameData) {
      this.scene.gameData.isAutoPlaying = false;
    }
    if (this.callbacks.onSetTurboMode) {
      this.callbacks.onSetTurboMode(false);
    }
    gameEventManager.emit(GameEventType.AUTO_STOP);
  }

  /**
   * Handle WIN_STOP event
   */
  private handleWinStop(): void {

    if (!this.waitingForWinAnimation) {
      return;
    }

    this.waitingForWinAnimation = false;

    try {
      const spinData =
        this.callbacks.getCurrentSpinData?.() ?? (this.scene as any)?.symbols?.currentSpinData;
      if (FreeSpinController.isCurrentFreeSpinItemMaxWin(spinData)) {
        this.stopFreeSpinsAfterMaxWin();
        return;
      }
    } catch { }

    // If a scatter retrigger is pending (grid or spin-data path), wait for the retrigger dialog to finish
    // before scheduling the next spin.
    try {
      const symbolsAny: any = this.scene as any;
      const symbols = symbolsAny?.symbols;
      const retriggerPending = !!(symbols && typeof symbols.hasAnyPendingScatterRetrigger === 'function' && symbols.hasAnyPendingScatterRetrigger());
      const retriggerAnimating = !!(symbols && typeof symbols.isScatterRetriggerAnimationInProgress === 'function' && symbols.isScatterRetriggerAnimationInProgress());
      if (retriggerPending || retriggerAnimating) {
        this.waitForAllDialogsToCloseThenResume();
        return;
      }
    } catch { }

    // Race guard: on some retrigger spins, Symbols hasn't raised retrigger flags yet when WIN_STOP is handled.
    // Detect retrigger likelihood directly from current spin data to avoid falling into the 3s bonus-total timeout path.
    if (this.isScatterRetriggerLikelyFromCurrentSpinData()) {
      this.waitForAllDialogsToCloseThenResume();
      return;
    }

    if (this.spinsRemaining <= 0) {

      let handled = false;

      const fallback = this.scene.time.delayedCall(3000, () => {
        if (handled) return;
        handled = true;
        console.warn('[FreeSpinController] TIMEOUT waiting for BONUS_TOTAL_WIN_SHOWN on last spin - stopping anyway');
        this.stop();
      });

      gameEventManager.once(GameEventType.BONUS_TOTAL_WIN_SHOWN, () => {
        if (handled) return;
        handled = true;
        if (fallback) fallback.destroy();
        this.stop();
      });
      return;
    }

    // Clear existing timer
    if (this.autoplayTimer) {
      this.autoplayTimer.destroy();
      this.autoplayTimer = null;
    }

    // Wait for BONUS_TOTAL_WIN_SHOWN event before scheduling next spin
    // This ensures the delay is measured from when "TOTAL WIN" is actually displayed on screen

    let eventHandled = false;

    // Safety timeout in case event doesn't fire (race condition prevention)
    const safetyTimeout = this.scene.time.delayedCall(3000, () => {
      if (!eventHandled) {
        eventHandled = true;
        console.warn('[FreeSpinController] TIMEOUT waiting for BONUS_TOTAL_WIN_SHOWN, proceeding anyway');

        // Schedule next spin with appropriate delay
        const baseDelay = 400;
        const turboDelay = gameStateManager.isTurbo
          ? baseDelay * TurboConfig.TURBO_DELAY_MULTIPLIER
          : baseDelay;


        this.autoplayTimer = this.scene.time.delayedCall(turboDelay, () => {
          this.performSpin();
        });
      }
    });

    gameEventManager.once(GameEventType.BONUS_TOTAL_WIN_SHOWN, () => {
      if (!eventHandled) {
        eventHandled = true;
        if (safetyTimeout) safetyTimeout.destroy();

        // Schedule next spin with appropriate delay
        const baseDelay = 300; // 300ms to allow "TOTAL WIN" to be visible
        const turboDelay = gameStateManager.isTurbo
          ? baseDelay * TurboConfig.TURBO_DELAY_MULTIPLIER
          : baseDelay;


        this.autoplayTimer = this.scene.time.delayedCall(turboDelay, () => {
          this.performSpin();
        });
      }
    });
  }

  private isScatterRetriggerLikelyFromCurrentSpinData(): boolean {
    if (!gameStateManager.isBonus) return false;
    try {
      const spinData =
        this.callbacks.getCurrentSpinData?.() ?? (this.scene as any)?.symbols?.currentSpinData;
      const area = spinData?.slot?.area;
      if (!Array.isArray(area)) return false;
      let scatterCount = 0;
      for (const col of area) {
        if (!Array.isArray(col)) continue;
        for (const symbol of col) {
          if (Number(symbol) === 0) {
            scatterCount++;
            if (scatterCount >= 3) return true;
          }
        }
      }
    } catch { }
    return false;
  }

  /**
   * Wait for all dialogs to close then resume autoplay
   */
  public waitForAllDialogsToCloseThenResume(): void {
    const gameScene = this.scene as any;
    const dialogs = gameScene?.dialogs;

    this.scene.time.delayedCall(0, () => {
      const anyDialogShowing = !!(dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing());
      const winDialogShowing = !!gameStateManager.isShowingWinDialog;

      if (anyDialogShowing || winDialogShowing) {
        this.scene.events.once('dialogAnimationsComplete', () => {
          this.waitForAllDialogsToCloseThenResume();
        });
        return;
      }

      // Grace window for new dialogs
      let settled = false;
      const onDialogShown = () => {
        if (settled) return;
        settled = true;
        this.scene.events.once('dialogAnimationsComplete', () => {
          this.waitForAllDialogsToCloseThenResume();
        });
      };

      this.scene.events.once('dialogShown', onDialogShown);

      this.scene.time.delayedCall(0, () => {
        if (settled) return;

        // When a retrigger is pending or animating, the win dialog may have just closed
        // but the retrigger sequence/dialog has not run yet. Do NOT schedule the next spin
        // here — wait for the retrigger dialog to close (next dialogAnimationsComplete).
        try {
          const symbolsAny: any = gameScene?.symbols;
          const retriggerPending = !!(symbolsAny && typeof symbolsAny.hasAnyPendingScatterRetrigger === 'function' && symbolsAny.hasAnyPendingScatterRetrigger());
          const retriggerAnimating = !!(symbolsAny && typeof symbolsAny.isScatterRetriggerAnimationInProgress === 'function' && symbolsAny.isScatterRetriggerAnimationInProgress());
          if (retriggerPending || retriggerAnimating) {
            this.scene.events.once('dialogAnimationsComplete', () => {
              this.waitForAllDialogsToCloseThenResume();
            });
            return;
          }
          const scatterResetAnimating = !!(symbolsAny && typeof symbolsAny.isScatterResetAnimationInProgress === 'function' && symbolsAny.isScatterResetAnimationInProgress());
          if (scatterResetAnimating) {
            this.scene.time.delayedCall(100, () => {
              this.waitForAllDialogsToCloseThenResume();
            });
            return;
          }
        } catch { }

        const showingNow = !!(dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing());
        const winNow = !!gameStateManager.isShowingWinDialog;

        if (showingNow || winNow) {
          settled = true;
          this.waitForAllDialogsToCloseThenResume();
          return;
        }

        settled = true;
        this.scene.time.delayedCall(120, () => this.performSpin());
      });
    });
  }

  // ============================================================================
  // STOP & CLEANUP
  // ============================================================================

  /**
   * Stop free spin autoplay
   */
  public stop(): void {
    if (this.spinRetryTimer) {
      try { this.spinRetryTimer.destroy(); } catch {}
      this.spinRetryTimer = null;
    }
    
    // Clear timer
    if (this.autoplayTimer) {
      this.autoplayTimer.destroy();
      this.autoplayTimer = null;
    }
    
    // Reset state
    this._isActive = false;
    this.spinsRemaining = 0;
    this.waitingForReelsStop = false;
    this.waitingForWinAnimation = false;
    this.hasTriggered = false;
    this.awaitingReelsStart = false;
    this.inFlightSpinRequestedAt = null;
    this.dialogListenerSetup = false;
    this.lastReportedSpinsLeft = null;
    this.lastReportedItemsLen = null;

    // Mark bonus finished once free spins fully complete (no retrigger pending).
    if (gameStateManager.isBonus && !gameStateManager.isBonusFinished) {
      let hasPendingRetrigger = false;
      try {
        const symbolsAny: any = this.scene as any;
        const symbols = symbolsAny?.symbols;
        if (symbols && typeof symbols.hasAnyPendingScatterRetrigger === 'function') {
          hasPendingRetrigger = symbols.hasAnyPendingScatterRetrigger();
        }
      } catch { }
      if (!hasPendingRetrigger) {
        gameStateManager.isBonusFinished = true;
      }
    }
    
    // Reset global autoplay state
    // Only reset base-game autoplay flags if there are no paused base-game autoplay spins
    // waiting to resume after the bonus. If base-game autoplay was paused (e.g. scatter triggered
    // during autoplay with N spins remaining), we must NOT clobber those flags here because
    // resumeAutoplayFromPause() in SlotController needs them intact to restart autoplay correctly.
    const slotController: any = (this.scene as any)?.slotController;
    const hasPausedBaseAutoplay = (slotController?.getPausedAutoplaySpinsRemaining?.() ?? 0) > 0;
    if (!hasPausedBaseAutoplay) {
      gameStateManager.isAutoPlaying = false;
      gameStateManager.isAutoPlaySpinRequested = false;
      if (this.scene.gameData) {
        this.scene.gameData.isAutoPlaying = false;
      }
    }
    
    // Restore win animation timing
    if (this.callbacks.onSetTurboMode) {
      this.callbacks.onSetTurboMode(false);
    }
    
    // Schedule congrats dialog
    this.scheduleCongratsDialog();
    
    // Emit AUTO_STOP event
    gameEventManager.emit(GameEventType.AUTO_STOP);
    
  }

  public getRetriggerIncrementFromSpinData(spinData: any): { added: number; spinsLeft: number } {
    const info = this.getSpinsInfoFromSpinData(spinData);
    const fs = getFreespinFromSpinData(spinData);
    const items = Array.isArray(fs?.items) ? fs.items : [];
    const slotArea = spinData?.slot?.area;
    const countValue = typeof fs?.count === 'number' ? fs.count : null;
    let added = 0;
    let nextSpinsLeft: number | null = null;

    // Prefer area-based: added = next - current, display = next item's spinsLeft
    try {
      if (Array.isArray(slotArea)) {
        const areaJson = JSON.stringify(slotArea);
        const idx = items.findIndex((it: any) => Array.isArray(it?.area) && JSON.stringify(it.area) === areaJson);
        if (idx >= 0) {
          const currentSpinsLeft = Number(items[idx]?.spinsLeft ?? 0);
          const nextItemSpinsLeft = Number(items[idx + 1]?.spinsLeft ?? 0);
          if (nextItemSpinsLeft > 0) {
            added = nextItemSpinsLeft - currentSpinsLeft + 1; // added = next - current + 1
            nextSpinsLeft = nextItemSpinsLeft;
          }
        }
      }
    } catch { }

    // Fallback: use spinsRemaining to find the current item when area match fails.
    if (added === 0 && items.length > 0 && this.spinsRemaining > 0) {
      try {
        const targetSpinsLeft = this.spinsRemaining + 1; // display is spinsLeft - 1
        for (let i = 0; i < items.length - 1; i++) {
          const it = items[i];
          if (typeof it?.spinsLeft === 'number' &&
              (it.spinsLeft === this.spinsRemaining || it.spinsLeft === targetSpinsLeft)) {
            const nextItem = items[i + 1];
            const nextVal = Number(nextItem?.spinsLeft ?? 0);
            if (nextVal > it.spinsLeft) {
              added = nextVal - it.spinsLeft;
              nextSpinsLeft = nextVal;
              break;
            }
          }
        }
      } catch { }
    }

    // Fallback: count delta (total free spins may increase on retrigger).
    if (added === 0 && countValue !== null && this.lastReportedCount !== null && countValue > this.lastReportedCount) {
      added = countValue - this.lastReportedCount;
      nextSpinsLeft = info.spinsLeft;
    }

    this.lastReportedSpinsLeft = nextSpinsLeft ?? info.spinsLeft;
    this.lastReportedItemsLen = info.itemsLen;
    if (countValue !== null) {
      this.lastReportedCount = countValue;
    }
    return { added: Math.max(0, added), spinsLeft: nextSpinsLeft ?? info.spinsLeft };
  }

  private getSpinsInfoFromSpinData(spinData: any): { spinsLeft: number; itemsLen: number } {
    try {
      const fs = getFreespinFromSpinData(spinData);
      const items = Array.isArray(fs?.items) ? fs.items : [];
      const itemsLen = items.length;

      // Prefer area matching to find the current item's spinsLeft (most reliable).
      const slotArea = spinData?.slot?.area;
      if (Array.isArray(slotArea) && items.length > 0) {
        const areaJson = JSON.stringify(slotArea);
        const match = items.find((it: any) => Array.isArray(it?.area) && JSON.stringify(it.area) === areaJson);
        if (match && typeof match.spinsLeft === 'number' && match.spinsLeft > 0) {
          let spinsLeft = match.spinsLeft;
          // If this item is MaxWin, adjust spinsLeft based on the previous item's spinsLeft
          // so that the controller display matches "previousSpinsLeft - 1" on the MaxWin spin.
          try {
            const idx = items.indexOf(match);
            const prev = idx > 0 ? items[idx - 1] : null;
            if ((match as any)?.isMaxWin === true && prev && typeof prev.spinsLeft === 'number') {
              const prevSpinsLeft = Number(prev.spinsLeft) || 0;
              const adjusted = Math.max(0, prevSpinsLeft - 1);
              spinsLeft = adjusted;
            }
          } catch { }
          return { spinsLeft, itemsLen };
        }
      }

      // Fallback: use spinsRemaining to locate the current item.
      if (items.length > 0 && this.spinsRemaining > 0) {
        const bySpins = items.find((it: any) =>
          typeof it?.spinsLeft === 'number' &&
          (it.spinsLeft === this.spinsRemaining || it.spinsLeft === this.spinsRemaining + 1)
        );
        if (bySpins) {
          let spinsLeft = bySpins.spinsLeft;
          try {
            const idx = items.indexOf(bySpins);
            const prev = idx > 0 ? items[idx - 1] : null;
            if ((bySpins as any)?.isMaxWin === true && prev && typeof prev.spinsLeft === 'number') {
              spinsLeft = Math.max(0, Number(prev.spinsLeft) - 1);
            }
          } catch { }
          return { spinsLeft, itemsLen };
        }
      }

      // Last resort: first positive item or count.
      const positiveItem = items.find((it: any) => typeof it?.spinsLeft === 'number' && it.spinsLeft > 0);
      const firstItemSpinsLeft = itemsLen > 0 && typeof items[0]?.spinsLeft === 'number'
        ? items[0].spinsLeft
        : 0;
      const countValue = typeof fs?.count === 'number' ? fs.count : 0;
      const derivedSpinsLeft = Math.max(positiveItem?.spinsLeft ?? 0, firstItemSpinsLeft, 0);
      const spinsLeft = derivedSpinsLeft > 0 ? derivedSpinsLeft : Math.max(countValue, 0);
      return { spinsLeft, itemsLen };
    } catch {
      return { spinsLeft: 0, itemsLen: 0 };
    }
  }

  /**
   * Reset all state (called on bonus end)
   */
  public reset(): void {
    if (this.autoplayTimer) {
      this.autoplayTimer.destroy();
      this.autoplayTimer = null;
    }

    if (this.spinRetryTimer) {
      try { this.spinRetryTimer.destroy(); } catch {}
      this.spinRetryTimer = null;
    }
    
    this._isActive = false;
    this.spinsRemaining = 0;
    this.waitingForReelsStop = false;
    this.waitingForWinAnimation = false;
    this.hasTriggered = false;
    this.awaitingReelsStart = false;
    this.inFlightSpinRequestedAt = null;
    this.dialogListenerSetup = false;
    this.pendingFreeSpinsData = null;
    this.lastReportedCount = null;
  }

  // ============================================================================
  // CONGRATS DIALOG
  // ============================================================================

  /**
   * Schedule the congrats dialog after autoplay ends
   */
  private scheduleCongratsDialog(): void {

    const gameScene = this.scene as any;
    const dialogs = gameScene.dialogs;

    const isWinDialogActive = (): boolean => {
      try {
        const hasDialog = dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing();
        const isWin = hasDialog && typeof dialogs.isWinDialog === 'function' && dialogs.isWinDialog();
        return (!!isWin) || !!gameStateManager.isShowingWinDialog;
      } catch {
        return !!gameStateManager.isShowingWinDialog;
      }
    };

    // If win dialog already active, defer to WIN_DIALOG_CLOSED handler
    if (isWinDialogActive()) {
      gameEventManager.once(GameEventType.WIN_DIALOG_CLOSED, () => {
        this.scheduleCongratsDialog();
      });
      return;
    }

    // Grace window to catch win dialogs
    let settled = false;

    const onDialogShown = (dialogType?: string) => {
      if (settled) return;

      const type = String(dialogType || '');
			const isWinDialog = ['BigWin', 'MegaWin', 'EpicWin', 'SuperWin'].includes(type);

      if (!isWinDialog) return;

      settled = true;
      this.scene.events.off('dialogShown', onDialogShown);
      gameEventManager.once(GameEventType.WIN_DIALOG_CLOSED, () => {
        this.scheduleCongratsDialog();
      });
    };

    this.scene.events.on('dialogShown', onDialogShown);

    const graceMs = 1200;

    this.scene.time.delayedCall(graceMs, () => {
      if (settled) return;

      this.scene.events.off('dialogShown', onDialogShown);

      if (isWinDialogActive()) {
        gameEventManager.once(GameEventType.WIN_DIALOG_CLOSED, () => {
          this.scheduleCongratsDialog();
        });
        return;
      }

      if (gameStateManager.isBonusFinished && this.callbacks.onShowCongratsDialog) {
        this.callbacks.onShowCongratsDialog();
      }
    });
  }
}

