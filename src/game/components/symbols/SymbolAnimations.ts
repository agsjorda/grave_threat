/**
 * SymbolAnimations - Handles Spine and sprite animations for symbols
 * 
 * Responsibilities:
 * - Play symbol animations (idle, win, drop)
 * - Stop animations
 * - Scale symbol objects
 * - Fit Spine objects to symbol box
 */

import type { Game } from '../../scenes/Game';
import type { SymbolObject, SpineTrackEntry } from './types';
import { gameStateManager } from '../../../managers/GameStateManager';
import {
  SPINE_SYMBOL_SCALES,
  DEFAULT_SPINE_SCALE,
  SPINE_SCALE_ADJUSTMENT,
  SCALE_UP_DELAY_MS,
} from '../../../config/GameConfig';

/**
 * Handles animations for symbol objects
 */
export class SymbolAnimations {
  private scene: Game;
  
  /** Width of a symbol for fitting calculations */
  private displayWidth: number;
  
  /** Height of a symbol for fitting calculations */
  private displayHeight: number;

  constructor(scene: Game, displayWidth: number, displayHeight: number) {
    this.scene = scene;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
  }

  // ============================================================================
  // SCALE CALCULATIONS
  // ============================================================================

  /**
   * Get the configured scale for a specific symbol's Spine animation
   */
  public getSpineSymbolScale(symbolValue: number): number {
    const baseScale = SPINE_SYMBOL_SCALES[symbolValue] ?? DEFAULT_SPINE_SCALE;
    return baseScale * SPINE_SCALE_ADJUSTMENT;
  }

  /**
   * Fit a Spine object to the symbol box dimensions
   */
  public fitSpineToSymbolBox(spineObj: any): void {
    if (!spineObj) return;
    
    try {
      // Reset to a known baseline before measuring
      if (typeof spineObj.setScale === 'function') {
        spineObj.setScale(1);
      }
      
      // Ensure we are in setup pose before measuring
      try {
        if (spineObj.skeleton && typeof spineObj.skeleton.setToSetupPose === 'function') {
          spineObj.skeleton.setToSetupPose();
        }
        if (spineObj.updateWorldTransform) {
          spineObj.updateWorldTransform();
        }
      } catch { /* ignore */ }

      // Get bounds
      let boundsWidth = 0;
      let boundsHeight = 0;

      try {
        if (typeof spineObj.getBounds === 'function') {
          const bounds = spineObj.getBounds();
          if (bounds && bounds.size) {
            boundsWidth = Math.max(1, bounds.size.x || bounds.size.width || 0);
            boundsHeight = Math.max(1, bounds.size.y || bounds.size.height || 0);
          }
        }
      } catch { /* ignore */ }

      // Fallback to width/height properties
      if (!boundsWidth || !boundsHeight) {
        boundsWidth = Math.max(1, (spineObj.width as number) || 0);
        boundsHeight = Math.max(1, (spineObj.height as number) || 0);
      }

      // Compute uniform scale to fit within target box
      const targetWidth = Math.max(1, this.displayWidth);
      const targetHeight = Math.max(1, this.displayHeight);
      const scale = Math.min(targetWidth / boundsWidth, targetHeight / boundsHeight) * 0.98;
      
      if (isFinite(scale) && scale > 0) {
        spineObj.setScale(scale);
      } else {
        // Fallback: use existing per-symbol scale logic
        spineObj.setScale(this.getSpineSymbolScale(0));
      }
      
      // Apply additional per-symbol adjustments after fitting
      try {
        const symbolValue = (spineObj as any)?.symbolValue;
        if (symbolValue === 0) {
          // Symbol0 scale multiplier from config (SPINE_SYMBOL_SCALES[0]); applies in all modes
          const mult = SPINE_SYMBOL_SCALES[0] ?? DEFAULT_SPINE_SCALE;
          const sx = (spineObj as any)?.scaleX ?? 1;
          const sy = (spineObj as any)?.scaleY ?? 1;
          if (typeof spineObj.setScale === 'function') {
            spineObj.setScale(sx * mult, sy * mult);
          }
        }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }

  // ============================================================================
  // ANIMATION CONTROL
  // ============================================================================

  /**
   * Stop all Spine animations on symbols (without converting them)
   */
  public stopAllSpineAnimations(symbols: (SymbolObject | null)[][]): void {
    if (!symbols || symbols.length === 0) return;
    
    let stoppedCount = 0;
    
    for (const column of symbols) {
      if (!column) continue;
      
      for (const symbol of column) {
        if (symbol?.animationState) {
          try {
            if (symbol.animationState.clearTracks) {
              symbol.animationState.clearTracks();
              stoppedCount++;
            }
          } catch { /* ignore */ }
        }
      }
    }
    
    if (stoppedCount > 0) {
      console.log(`[SymbolAnimations] Stopped ${stoppedCount} Spine animations`);
    }
  }

  /**
   * Stop all active animations on symbols (tweens and Spine)
   */
  public stopAllSymbolAnimations(symbols: (SymbolObject | null)[][], container: Phaser.GameObjects.Container): void {
    if (!symbols || symbols.length === 0) return;
    
    let animationsStopped = 0;
    let spineTracksCleared = 0;
    
    for (const column of symbols) {
      if (!column) continue;
      
      for (const symbol of column) {
        if (!symbol) continue;
        
        // Kill any active tweens
        this.scene.tweens.killTweensOf(symbol);
        animationsStopped++;
        
        // Stop Spine animation tracks
        if (symbol.animationState?.clearTracks) {
          try {
            symbol.animationState.clearTracks();
            spineTracksCleared++;
          } catch { /* ignore */ }
        }
      }
    }
    
    // Also kill tweens on container
    if (container) {
      this.scene.tweens.killTweensOf(container);
    }
    
    console.log(`[SymbolAnimations] Stopped ${animationsStopped} tweens, cleared ${spineTracksCleared} Spine tracks`);
  }

  /**
   * Resume idle animations for all Spine symbols
   */
  public resumeIdleAnimationsForAllSymbols(symbols: (SymbolObject | null)[][]): void {
    if (!symbols || symbols.length === 0) return;

    let resumedCount = 0;
    
    for (const column of symbols) {
      if (!column) continue;
      
      for (const symbol of column) {
        if (!symbol) continue;
        
        const animState = symbol.animationState;
        if (!animState || typeof animState.setAnimation !== 'function') {
          continue;
        }

        // Determine idle animation name from symbol value
        let idleName: string | null = null;
        try {
          const value = typeof (symbol as any).symbolValue === 'number' 
            ? (symbol as any).symbolValue 
            : null;
          
          if (value !== null) {
            idleName = `Symbol${value}_PC_idle`;
          }
        } catch { /* ignore */ }

        // Clear any paused multiplier win state
        try {
          if ((symbol as any).__pausedMultiplierWin) {
            delete (symbol as any).__pausedMultiplierWin;
          }
        } catch { /* ignore */ }

        try {
          let entry: SpineTrackEntry | null = null;
          
          if (idleName) {
            entry = animState.setAnimation(0, idleName, true) ?? null;
          } else {
            entry = animState.getCurrent?.(0) ?? null;
          }

          // Restore timeScale with slight jitter
          const speedJitter = 0.95 + Math.random() * 0.1;
          if (entry && typeof entry.timeScale === 'number') {
            entry.timeScale = speedJitter;
          } else if (typeof animState.timeScale === 'number') {
            animState.timeScale = speedJitter;
          }

          // Randomize starting point to desync visuals
          try {
            const animName = entry?.animation?.name ?? idleName;
            const duration = (symbol as any)?.skeleton?.data?.findAnimation?.(animName)?.duration;
            if (typeof duration === 'number' && duration > 0 && entry) {
              entry.trackTime = Math.random() * duration;
            }
          } catch { /* ignore */ }

          resumedCount++;
        } catch { /* ignore */ }
      }
    }

    if (resumedCount > 0) {
      console.log(`[SymbolAnimations] Resumed idle animations on ${resumedCount} Spine symbols`);
    }
  }

  /**
   * Play the drop animation on a symbol if available
   */
  public playDropAnimation(symbol: SymbolObject): void {
    try {
      const animState = symbol.animationState;
      if (!animState || typeof animState.setAnimation !== 'function') {
        return;
      }
      
      const symbolValue = (symbol as any)?.symbolValue;
      if (typeof symbolValue !== 'number') return;
      
      const dropName = `Symbol${symbolValue}_PC_drop`;
      const idleName = `Symbol${symbolValue}_PC_idle`;
      
      const hasDrop = !!(symbol as any)?.skeleton?.data?.findAnimation?.(dropName);
      if (!hasDrop) return;
      
      animState.setAnimation(0, dropName, false);
      
      // Set up listener to transition to idle after drop
      if (animState.addListener) {
        const listener = {
          complete: (entry: SpineTrackEntry) => {
            try {
              if (entry?.animation?.name !== dropName) return;
              animState?.setAnimation?.(0, idleName, true);
            } catch { /* ignore */ }
          }
        };
        animState.addListener(listener);
      }
    } catch { /* ignore */ }
  }

  // ============================================================================
  // TWEEN EFFECTS
  // ============================================================================

  /**
   * Schedule a scale-up effect after a delay
   */
  public scheduleScaleUp(obj: any, delayMs: number = SCALE_UP_DELAY_MS, scaleFactor: number = 1.2): void {
    try {
      const baseX = obj?.scaleX ?? 1;
      const baseY = obj?.scaleY ?? 1;
      const targetX = baseX * scaleFactor;
      const targetY = baseY * scaleFactor;
      
      this.scene.time.delayedCall(delayMs, () => {
        try {
          this.scene.tweens.add({
            targets: obj,
            scaleX: targetX,
            scaleY: targetY,
            duration: 200,
            ease: Phaser.Math.Easing.Cubic.Out,
          });
        } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  }

  /**
   * Create a scale tween on a symbol
   */
  public createScaleTween(
    target: any,
    targetScaleX: number,
    targetScaleY: number,
    duration: number,
    ease: string = 'Sine.easeOut'
  ): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: target,
        scaleX: targetScaleX,
        scaleY: targetScaleY,
        duration,
        ease,
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * Create a position tween on a symbol
   */
  public createMoveTween(
    target: any,
    targetX: number,
    targetY: number,
    duration: number,
    ease: string = 'Sine.easeInOut'
  ): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: target,
        x: targetX,
        y: targetY,
        duration,
        ease,
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * Disable a symbol object (stop tweens and interactions)
   */
  public disableSymbolObject(obj: any): void {
    // Kill tweens on the main object
    try { this.scene.tweens.killTweensOf(obj); } catch { /* ignore */ }
    
    // Kill tweens on overlay and bounce tween
    try {
      const overlayObj = obj?.__overlayImage;
      const bounceTween = overlayObj?.__bounceTween;
      if (bounceTween?.stop) bounceTween.stop();
      if (overlayObj) this.scene.tweens.killTweensOf(overlayObj);
    } catch { /* ignore */ }
    
    // Disable interactive
    try { if (typeof obj.disableInteractive === 'function') obj.disableInteractive(); } catch { /* ignore */ }
    
    // Mark as inactive
    try { obj.active = false; } catch { /* ignore */ }
  }
}
