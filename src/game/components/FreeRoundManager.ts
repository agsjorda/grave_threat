import { Scene } from 'phaser';
import { GameAPI, SlotInitializeData } from '../../backend/GameAPI';
import { gameStateManager } from '../../managers/GameStateManager';
import { gameEventManager, GameEventType } from '../../event/EventManager';
import { SlotController } from './controller/SlotController';
import { CurrencyManager } from './CurrencyManager';
import { SoundEffectType } from '../../managers/AudioManager';
import { formatCurrencyNumber } from '../../utils/NumberPrecisionFormatter';

export class FreeRoundManager {
	private container: Phaser.GameObjects.Container | null = null;
	private sceneRef: Scene | null = null;
	private background: Phaser.GameObjects.Image | null = null;
	private countText: Phaser.GameObjects.Text | null = null;
	private labelText: Phaser.GameObjects.Text | null = null;
	private spinButton: Phaser.GameObjects.Image | null = null;
	private spinIcon: Phaser.GameObjects.Image | null = null;
	private autoplayStopIcon: Phaser.GameObjects.Image | null = null;
	private initializationData: SlotInitializeData | null = null;
	private slotControllerRef: SlotController | undefined;

	// Center panel elements (reward dialog)
	private panelContainer: Phaser.GameObjects.Container | null = null;
	private panelOverlay: Phaser.GameObjects.Rectangle | null = null;
	private panelSpinsText: Phaser.GameObjects.Text | null = null;
	private panelBetText: Phaser.GameObjects.Text | null = null;
	
	private initialFreeSpins: number = 0;
	private remainingFreeSpins: number = 0;
	private initBet: number | null = null;
	private completionPanelShown: boolean = false;
	// Tracks the real cumulative total win across all initialization freeround spins
	// started from this manager (autoplay or manual).
	private accumulatedFreeRoundWin: number = 0;
	// True while a dedicated initialization freeround session (started from this manager) is active.
	private trackingFreeRoundAutoplay: boolean = false;

	/**
	 * Create the free round button UI.
	 *
	 * This tries to match the position and scale of the existing spin button (`spin_bg`)
	 * by locating the `Image` that uses the `spin` texture key. If it cannot be found,
	 * the button is placed at the center of the screen with a scale of 1.
	 *
	 * Based on initialization data:
	 * - If hasFreeSpinRound = true AND freeSpinRound > 0:
	 *   - Show the free round button and its text with the remaining count.
	 *   - Hide the SlotController spin button (and its icon/stop icon) so only the free round UI is visible.
	 * - Otherwise, the free round button is created hidden and the normal spin button stays visible.
	 */
	public create(scene: Scene, gameAPI: GameAPI, slotController?: SlotController): void {
		// Avoid creating twice
		if (this.container) {
			return;
		}

		this.sceneRef = scene;

		// Cache initialization data from GameAPI, if available
		this.initializationData = gameAPI.getInitializationData();
		this.slotControllerRef = slotController;

		// Prefer getting the spin button and overlays directly from SlotController so the
		// free round UI appears exactly where the controller's spin button is.
		let spinButton: Phaser.GameObjects.Image | null = null;
		let spinIcon: Phaser.GameObjects.Image | null = null;
		let autoplayStopIcon: Phaser.GameObjects.Image | null = null;

		if (slotController) {
			spinButton = slotController.getSpinButton();
			spinIcon = slotController.getSpinIcon();
			autoplayStopIcon = slotController.getAutoplayStopIcon();
		}

		// Fallback: try to find them in the scene children if SlotController is not provided
		if (!spinButton) {
			spinButton = scene.children.list.find(
				(child): child is Phaser.GameObjects.Image =>
					child instanceof Phaser.GameObjects.Image && child.texture.key === 'spin'
			) || null;
		}
		if (!spinIcon) {
			spinIcon = scene.children.list.find(
				(child): child is Phaser.GameObjects.Image =>
					child instanceof Phaser.GameObjects.Image && child.texture.key === 'spin_icon'
			) || null;
		}
		if (!autoplayStopIcon) {
			autoplayStopIcon = scene.children.list.find(
				(child): child is Phaser.GameObjects.Image =>
					child instanceof Phaser.GameObjects.Image && child.texture.key === 'autoplay_stop_icon'
			) || null;
		}

		this.spinButton = spinButton;
		this.spinIcon = spinIcon;
		this.autoplayStopIcon = autoplayStopIcon;

		// Use GameAPI helper to determine how many initialization free spins remain
		// and what bet size is tied to them.
		this.initialFreeSpins = gameAPI.getRemainingInitFreeSpins();
		this.remainingFreeSpins = this.initialFreeSpins;
		this.initBet = gameAPI.getInitFreeSpinBet();
		const initialFreeSpins = this.initialFreeSpins;

		const x = spinButton ? spinButton.x : scene.scale.width * 0.5;
		// Match the SlotController spin button position exactly.
		// When free spins are active we hide the original spin button, so this
		// free round button fully replaces it in-place.
		const y = spinButton ? spinButton.y : scene.scale.height * 0.82;
		const scaleX = spinButton ? spinButton.scaleX : 1;
		const scaleY = spinButton ? spinButton.scaleY : 1;
		const depth = spinButton ? spinButton.depth + 1 : 20;

		// Main container so we can easily show/hide/move everything together.
		// Create it at (0,0) and, when possible, parent it into the same container
		// as the SlotController's spin button so local coordinates match exactly.
		this.container = scene.add.container(0, 0);

		let finalDepth = depth;
		let parentContainer: Phaser.GameObjects.Container | null = null;

		if (slotController && (slotController as any).getPrimaryControllersContainer) {
			parentContainer = slotController.getPrimaryControllersContainer();
		}

		if (parentContainer) {
			parentContainer.add(this.container);
			// Within the primary controllers, ensure we are above the base spin button.
			finalDepth = Math.max(depth, 20);
		} else {
			// Fallback: keep a reasonably high global depth so we're visible
			finalDepth = Math.max(depth, 700);
		}

		this.container.setDepth(finalDepth);

		// (Previously created a separate `freeround_bg` button here. We now reuse the
		// SlotController's own spin button and simply swap its texture during
		// free-round mode, so no extra clickable button is needed.)

		// ---------------------------------------------------------------------
		// Free spin info panel (same dimensions as SlotController balance BG)
		// ---------------------------------------------------------------------
		const infoX = scene.scale.width * 0.5;
		const infoY = scene.scale.height * 0.724;
		const infoWidth = 125; // Matches balance container width
		const infoHeight = 55; // Matches balance container height
		const infoCornerRadius = 10; // Matches balance container corner radius

		// Rounded rectangle background with a canvas-drawn vertical gradient stroke
		// that matches the provided colors (#FFFFFF → #FFD180 → #FDB832 → #B4720A).
		const borderTextureKey = `freeround_info_panel_${infoWidth}x${infoHeight}`;
		if (!scene.textures.exists(borderTextureKey)) {
			const canvasTexture = scene.textures.createCanvas(borderTextureKey, infoWidth, infoHeight);
			if (!canvasTexture) {
				// Fallback: if canvas texture creation fails, just draw a simple dark rounded rect via Graphics.
				const fallbackBg = scene.add.graphics();
				const outerX = infoX - infoWidth / 2;
				const outerY = infoY - infoHeight / 2;
				// Slightly thinner stroke for a more subtle border
				fallbackBg.lineStyle(1.5, 0xfdb832, 1.5);
				fallbackBg.strokeRoundedRect(outerX, outerY, infoWidth, infoHeight, infoCornerRadius);
				fallbackBg.fillStyle(0x000000, 0.65);
				fallbackBg.fillRoundedRect(
					outerX + 2,
					outerY + 2,
					infoWidth - 4,
					infoHeight - 4,
					infoCornerRadius - 2
				);
				fallbackBg.setDepth(finalDepth);
				this.container.add(fallbackBg);
			} else {
				const ctx = canvasTexture.context;

				// Slightly thinner border for a more subtle frame
				const lineWidth = 1;
				const radius = infoCornerRadius - 1;
				const inset = lineWidth / 2;
				const w = infoWidth - lineWidth;
				const h = infoHeight - lineWidth;

				ctx.clearRect(0, 0, infoWidth, infoHeight);

				// Border gradient (vertical)
				const borderGradient = ctx.createLinearGradient(0, 0, 0, infoHeight);
				borderGradient.addColorStop(0.0, '#ffffff');
				borderGradient.addColorStop(0.25, '#ffd180');
				borderGradient.addColorStop(0.65, '#fdb832');
				borderGradient.addColorStop(1.0, '#b4720a');
				ctx.strokeStyle = borderGradient;
				ctx.lineWidth = lineWidth;

				const drawRoundedRectPath = (x: number, y: number, width: number, height: number, r: number) => {
					const right = x + width;
					const bottom = y + height;
					ctx.beginPath();
					ctx.moveTo(x + r, y);
					ctx.lineTo(right - r, y);
					ctx.quadraticCurveTo(right, y, right, y + r);
					ctx.lineTo(right, bottom - r);
					ctx.quadraticCurveTo(right, bottom, right - r, bottom);
					ctx.lineTo(x + r, bottom);
					ctx.quadraticCurveTo(x, bottom, x, bottom - r);
					ctx.lineTo(x, y + r);
					ctx.quadraticCurveTo(x, y, x + r, y);
					ctx.closePath();
				};

				// Stroke outer border
				drawRoundedRectPath(inset, inset, w, h, radius);
				ctx.stroke();

				// Inner background – solid black to match the requested style
				const innerInset = inset + 1.5;
				const innerRadius = radius - 1.5;
				const innerW = infoWidth - innerInset * 2;
				const innerH = infoHeight - innerInset * 2;

				ctx.fillStyle = '#000000';
				drawRoundedRectPath(innerInset, innerInset, innerW, innerH, innerRadius);
				ctx.fill();

				canvasTexture.refresh();
			}
		}

		const infoBg = scene.add
			.image(infoX, infoY, borderTextureKey)
			.setOrigin(0.5, 0.5)
			.setDepth(finalDepth)
			.setAlpha(0.7);
		this.container.add(infoBg);

		// "Free\nSpin" label on the left side of the panel
		this.labelText = scene.add.text(infoX - infoWidth / 2 + 25, infoY, 'Free\nSpin', {
			fontSize: '12px',
			color: '#ffffff', // base color; will be overridden by gradient
			fontFamily: 'poppins-bold',
			align: 'left',
			// lineSpacing can be tweaked visually in the editor; we keep default here.
		});
		this.labelText.setOrigin(0, 0.5);
		this.labelText.setDepth(finalDepth + 1);
		this.container.add(this.labelText);
		this.applyFreeSpinLabelGradient();

		// Free spins count on the right side of the panel
		this.countText = scene.add.text(
			infoX + infoWidth / 2 - 43,
			infoY,
			this.remainingFreeSpins.toString(),
			{
				fontSize: '36px',
				color: '#ffffff',
				fontFamily: 'poppins-bold',
				align: 'middle',
				stroke: '#FFC45C',
				strokeThickness: 2,
				letterSpacing: 1
			}
		);
		// Anchor the count text on the left so the left edge stays fixed when
		// the number of digits changes (e.g., 10 → 1).
		this.countText.setOrigin(0.5, 0.5);
		this.countText.setDepth(finalDepth + 1);
		this.container.add(this.countText);

		// Listen for freeround autoplay remaining updates from the Game scene / SlotController.
		// This keeps the displayed count in sync with the remaining free round spins.
		scene.events.on('freeround-autoplay-remaining', (remaining: number) => {
			this.setFreeSpins(remaining);
		});

		// Listen for fsCount updates from backend (when isFs: true is posted)
		// This will update the remaining free spins display with the value from the server
		gameEventManager.on(GameEventType.FREEROUND_COUNT_UPDATE, (data: any) => {
			const fsCount = typeof data === 'number' ? data : (data?.fsCount ?? data);
			if (typeof fsCount === 'number') {
				console.log('[FreeRoundManager] Received FREEROUND_COUNT_UPDATE from backend:', fsCount);
				this.remainingFreeSpins = fsCount;
				this.setFreeSpins(fsCount);
			} else {
				console.warn('[FreeRoundManager] Invalid fsCount received:', data);
			}
		});

		// Track wins during initialization freeround autoplay so the completion panel
		// can show the actual accumulated total win.
		this.setupFreeRoundWinTracking();

		// When playing free rounds manually (no autoplay), decrement our remaining
		// free spin counter on each completed spin while the free round session
		// is active.
		this.setupManualFreeRoundSpinConsumption();

		console.log('[FreeRoundManager] Created at', {
			x,
			y,
			scaleX,
			scaleY,
			initialFreeSpins,
			hasSpinButton: !!spinButton
		});

		// Initially decide visibility based on initialization data
		const shouldUseFreeSpin =
			!!this.initializationData &&
			this.initializationData.hasFreeSpinRound &&
			initialFreeSpins > 0;

		if (shouldUseFreeSpin) {
			// Normal behavior: show the free spin start reward panel when we have free rounds,
			// but wait 1 second so the player can see the main game state first.
			scene.time.delayedCall(1500, () => {
				// Guard against the manager being destroyed in the meantime
				if (!this.sceneRef) {
					return;
				}
				this.enableFreeSpinMode();
				this.createRewardPanel(this.sceneRef);
			});
		} else {
			this.disableFreeSpinMode();
		}
	}

	/**
	 * Update the displayed free spin count.
	 */
	public setFreeSpins(count: number): void {
		// If our core UI has been destroyed or the manager is no longer attached to a scene,
		// ignore updates (this can happen after free rounds are fully completed).
		if (!this.sceneRef || !this.container || !this.container.scene) {
			return;
		}

		if (this.countText && this.countText.active) {
			this.countText.setText(count.toString());

			// If remaining free spins go above 2 digits (e.g., 100+), shrink the
			// number so it still fits comfortably inside the info panel.
			const digitCount = Math.abs(count).toString().length;
			const fontSize = digitCount > 2 ? 32 : 36;
			this.countText.setFontSize(fontSize);
		}
		if (this.panelSpinsText) {
			// Guard against updating a destroyed text object (e.g., after panels are rebuilt)
			if (this.panelSpinsText.active) {
				this.panelSpinsText.setText(count.toString());
				this.applySpinCountGradient();
			} else {
				// Clear stale reference so future calls don't try to update a destroyed object
				this.panelSpinsText = null;
			}
		}

		// When count drops to 0 or below, prepare to end free spin mode
		if (count <= 0) {
			// IMPORTANT: we no longer hide the FreeRoundManager spin button here.
			// We keep it visible until after the completion panel is dismissed,
			// so the transition feels smooth and the player clearly sees the summary.

			// Show completion panel once all free spin rounds are consumed,
			// but only after reels have stopped and all win dialogs/animations are done.
			if (!this.completionPanelShown && this.sceneRef) {
				this.completionPanelShown = true;

				const showWhenSafe = () => {
					// Guard on game state: wait until reels are stopped and all win flows/dialogs are done
					if (
						!gameStateManager.isReelSpinning &&
						!gameStateManager.isShowingWinDialog
					) {
						this.showCompletionCreditedPanel(this.getFinalFreeRoundTotalWin());
						return;
					}

					// Listen once for REELS_STOP, WIN_STOP, and WIN_DIALOG_CLOSED, then try again.
					// This handles both:
					//  - spins with a win dialog (WIN_DIALOG_CLOSED will fire)
					//  - spins with wins but no dialog (WIN_STOP will fire after animations)
					let reelsStopUnsub: (() => void) | null = null;
					let winStopUnsub: (() => void) | null = null;
					let winDialogClosedUnsub: (() => void) | null = null;

					const attempt = () => {
						if (reelsStopUnsub) reelsStopUnsub();
						if (winStopUnsub) winStopUnsub();
						if (winDialogClosedUnsub) winDialogClosedUnsub();

						// Re-check state; if still busy, recurse
						if (
							!gameStateManager.isReelSpinning &&
							!gameStateManager.isShowingWinDialog
						) {
							this.showCompletionCreditedPanel(this.getFinalFreeRoundTotalWin());
						} else {
							showWhenSafe();
						}
					};

					reelsStopUnsub = gameEventManager.on(GameEventType.REELS_STOP, () => attempt());
					winStopUnsub = gameEventManager.on(GameEventType.WIN_STOP, () => attempt());
					winDialogClosedUnsub = gameEventManager.on(GameEventType.WIN_DIALOG_CLOSED, () => attempt());
				};

				showWhenSafe();
			}
		}
	}

	/**
	 * Show the free round button.
	 */
	public show(): void {
		if (this.container) {
			this.container.setVisible(true);
		}
	}

	/**
	 * Hide the free round button.
	 */
	public hide(): void {
		if (this.container) {
			this.container.setVisible(false);
		}
	}

	/**
	 * Apply a vertical color gradient to the big spin count on the reward panel.
	 * Colors: #FFD180, #FDB832, #B4720A
	 */
	private applySpinCountGradient(): void {
		if (!this.panelSpinsText) {
			return;
		}

		const text = this.panelSpinsText as any;
		const ctx: CanvasRenderingContext2D | undefined = text.context;
		if (!ctx) {
			return;
		}

		// Ensure text metrics are up to date before computing gradient height
		if (typeof text.updateText === 'function') {
			text.updateText();
		}

		const h = this.panelSpinsText.height || 1;
		const gradient = ctx.createLinearGradient(0, 0, 0, h);
		gradient.addColorStop(0, '#FFD180');
		gradient.addColorStop(0.5, '#FDB832');
		gradient.addColorStop(1, '#B4720A');

		this.panelSpinsText.setFill(gradient as any);
	}

	/**
	 * Apply a vertical green gradient (#66D449 → #379557) to a given text object.
	 */
	private applyBetValueGradientToText(target: Phaser.GameObjects.Text | null): void {
		if (!target) {
			return;
		}

		const anyText = target as any;
		const ctx: CanvasRenderingContext2D | undefined = anyText.context;
		if (!ctx) {
			return;
		}

		if (typeof anyText.updateText === 'function') {
			anyText.updateText();
		}

		const h = target.height || 1;
		const gradient = ctx.createLinearGradient(0, 0, 0, h);
		gradient.addColorStop(0, '#66D449');
		gradient.addColorStop(1, '#379557');

		target.setFill(gradient as any);
	}

	/**
	 * Apply the gold vertical gradient (white → #FFD180 → #FDB832 → #B4720A)
	 * to the small "Free / Spin" label in the main info panel.
	 */
	private applyFreeSpinLabelGradient(): void {
		if (!this.labelText) {
			return;
		}

		const anyText = this.labelText as any;
		const ctx: CanvasRenderingContext2D | undefined = anyText.context;
		if (!ctx) {
			return;
		}

		if (typeof anyText.updateText === 'function') {
			anyText.updateText();
		}

		const h = this.labelText.height || 1;
		const gradient = ctx.createLinearGradient(0, 0, 0, h);
		gradient.addColorStop(0.0, '#ffffff');
		gradient.addColorStop(0.25, '#ffd180');
		gradient.addColorStop(0.65, '#fdb832');
		gradient.addColorStop(1.0, '#b4720a');

		this.labelText.setFill(gradient as any);
	}

	/**
	 * Start tracking wins for the upcoming initialization freeround autoplay session.
	 * Called when the player presses the "SPIN NOW" button on the reward panel.
	 */
	private startTrackingFreeRoundAutoplayWins(): void {
		this.accumulatedFreeRoundWin = 0;
		this.trackingFreeRoundAutoplay = true;
		console.log('[FreeRoundManager] Started tracking freeround autoplay total win');
	}

	/**
	 * Stop tracking wins for initialization freeround autoplay.
	 * Safe to call multiple times.
	 */
	private stopTrackingFreeRoundAutoplayWins(): void {
		if (!this.trackingFreeRoundAutoplay) {
			return;
		}
		this.trackingFreeRoundAutoplay = false;
		console.log(
			'[FreeRoundManager] Stopped tracking freeround autoplay total win. Final accumulated value:',
			this.accumulatedFreeRoundWin
		);
	}

	/**
	 * Compute the final total win to display on the completion panel.
	 * This should always reflect the **actual** accumulated wins from the
	 * initialization freeround session. If the player had no wins at all,
	 * this will correctly return 0 instead of an estimated value.
	 */
	private getFinalFreeRoundTotalWin(): number {
		return this.accumulatedFreeRoundWin;
	}

	/**
	 * Attach listeners needed to accumulate total wins for initialization freeround
	 * autoplay sessions. This uses the Symbols component's currentSpinData and the
	 * WIN_STOP event so that all tumble/multiplier logic has completed.
	 */
	private setupFreeRoundWinTracking(): void {
		// Listen for WIN_STOP to accumulate per-spin total wins while freeround autoplay is active.
		gameEventManager.on(GameEventType.WIN_STOP, () => {
			// Only track when:
			//  - This manager is actively tracking a dedicated freeround autoplay session
			//  - We're in the initialization freeround context (isInFreeSpinRound flag)
			//  - We're NOT in bonus mode (bonus-mode free spins are handled by BonusHeader)
			if (!this.trackingFreeRoundAutoplay) {
				return;
			}
			if (!this.sceneRef) {
				return;
			}

			// Guard against bonus mode; initialization freerounds are base-game spins.
			if (gameStateManager.isBonus) {
				return;
			}

			// Optional flag set by enableFreeSpinMode; use a loose cast so we don't
			// depend on a typed property.
			const gsmAny: any = gameStateManager as any;
			if (gsmAny.isInFreeSpinRound !== true) {
				return;
			}

			try {
				const sceneAny: any = this.sceneRef as any;
				const symbolsComponent = sceneAny?.symbols;
				const spinData = symbolsComponent?.currentSpinData;
				if (!spinData || !spinData.slot) {
					return;
				}

				const slot: any = spinData.slot;
				let spinWin = 0;

				// For sugar_wonderland_v2, initialization free spins are base-game spins.
				// Prefer direct totalWin if available for most accurate value.
				if (typeof slot.totalWin === 'number') {
					spinWin = slot.totalWin;
					console.log('[FreeRoundManager] Using slot.totalWin for initialization free spin:', spinWin);
				} else if (Array.isArray(slot.tumbles) && slot.tumbles.length > 0) {
					// Fallback: calculate from tumbles (cluster wins)
					spinWin = this.calculateTotalWinFromTumbles(slot.tumbles);
					console.log('[FreeRoundManager] Calculated from tumbles:', spinWin);
				} else if (Array.isArray(slot.paylines) && slot.paylines.length > 0) {
					// Fallback: sum payline wins if present.
					for (const payline of slot.paylines) {
						const w = Number((payline as any)?.win || 0);
						spinWin += isNaN(w) ? 0 : w;
					}
					console.log('[FreeRoundManager] Calculated from paylines:', spinWin);
				}

				if (spinWin > 0) {
					this.accumulatedFreeRoundWin += spinWin;
					console.log(
						`[FreeRoundManager] WIN_STOP (freeround autoplay): added spinWin=$${spinWin}, accumulatedFreeRoundWin=$${this.accumulatedFreeRoundWin}`
					);
				} else {
					console.log('[FreeRoundManager] No win detected for this free spin (spinWin=0)');
				}
			} catch (e) {
				console.warn('[FreeRoundManager] Failed to accumulate freeround win on WIN_STOP:', e);
			}
		});
	}

	/**
	 * For manual initialization free rounds (no autoplay), decrement the remaining
	 * free spin count once per spin start while we are in the dedicated
	 * free-round context.
	 * 
	 * NOTE: Manual decrement is now DISABLED. The backend provides the fsCount
	 * in the response (when isFs: true), and we listen for FREEROUND_COUNT_UPDATE
	 * event to update the display instead.
	 */
	private setupManualFreeRoundSpinConsumption(): void {
		// DISABLED: Backend now provides fsCount in response, so no manual decrement needed
		// The FREEROUND_COUNT_UPDATE event handler (set up in create()) will update
		// the remaining free spins display with the value from the server.
		console.log('[FreeRoundManager] Manual spin consumption disabled - using backend fsCount instead');
		
		// Legacy code commented out:
		/*
		gameEventManager.on(GameEventType.REELS_START, () => {
			if (!this.trackingFreeRoundAutoplay) {
				return;
			}

			if (!this.sceneRef) {
				return;
			}

			if (gameStateManager.isBonus) {
				return;
			}

			const gsmAny: any = gameStateManager as any;
			if (gsmAny.isInFreeSpinRound !== true) {
				return;
			}

			if (this.remainingFreeSpins <= 0) {
				return;
			}

			this.remainingFreeSpins -= 1;
			this.setFreeSpins(this.remainingFreeSpins);
		});
		*/
	}

	/**
	 * Calculate total win amount from tumbles array (cluster wins), mirroring the
	 * logic used in the main Game scene.
	 */
	private calculateTotalWinFromTumbles(tumbles: any[]): number {
		if (!Array.isArray(tumbles) || tumbles.length === 0) {
			return 0;
		}
		let totalWin = 0;
		for (const tumble of tumbles) {
			const w = Number(tumble?.win || 0);
			totalWin += isNaN(w) ? 0 : w;
		}
		return totalWin;
	}

	/**
	 * Rough estimate of total free-round value; can be replaced later with actual total win.
	 */
	private estimateFreeRoundTotalWin(): number {
		const bet =
			this.initBet != null
				? this.initBet
				: (this.slotControllerRef && (this.slotControllerRef as any).getBaseBetAmount)
					? (this.slotControllerRef as any).getBaseBetAmount()
					: 0;
		return this.initialFreeSpins * bet;
	}

	/**
	 * Animate a panel container popping into view.
	 */
	private animatePanelIn(scene: Scene, container: Phaser.GameObjects.Container | null): void {
		if (!container) return;
		container.setScale(0.8);
		container.setAlpha(0);

		scene.tweens.add({
			targets: container,
			scaleX: 1,
			scaleY: 1,
			alpha: 1,
			duration: 280,
			ease: 'Back.Out'
		});
	}

	/**
	 * Animate a panel container popping out of view, then run the callback.
	 */
	private animatePanelOut(scene: Scene, container: Phaser.GameObjects.Container | null, onComplete: () => void): void {
		if (!container) {
			onComplete();
			return;
		}

		scene.tweens.add({
			targets: container,
			scaleX: 0.8,
			scaleY: 0.8,
			alpha: 0,
			duration: 220,
			ease: 'Back.In',
			onComplete: () => {
				onComplete();
			}
		});
	}

	/**
	 * Create and display the central "Free Spin Reward" panel as per design reference.
	 * Panel size target: ~397w x 442h, centered on screen.
	 */
	private createRewardPanel(scene: Scene): void {
		// Only create if we actually have free spins
		if (this.panelContainer || this.initialFreeSpins <= 0) {
			return;
		}

		const panelWidth = 397;
		const panelHeight = 442;
		const centerX = scene.scale.width * 0.5;
		const centerY = scene.scale.height * 0.5;

		// Create a full-screen transparent overlay to block interactions behind the panel
		this.panelOverlay = scene.add.rectangle(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			scene.scale.width,
			scene.scale.height,
			0x000000,
			0
		);
		this.panelOverlay.setOrigin(0.5, 0.5);
		this.panelOverlay.setScrollFactor(0);
		this.panelOverlay.setDepth(9999);
		this.panelOverlay.setInteractive({ useHandCursor: false });

		this.panelContainer = scene.add.container(centerX, centerY);
		this.panelContainer.setDepth(10000);
		this.animatePanelIn(scene, this.panelContainer);

		// Background panel with rounded corners
		const bg = scene.add.graphics();
		bg.setAlpha(0.85);
		bg.fillStyle(0x000000, 0.95);
		bg.lineStyle(2, 0xffffff, 0.12);
		const panelRadius = 16;
		bg.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, panelRadius);
		bg.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, panelRadius);
		this.panelContainer.add(bg);

		// Title: "Free Spin Reward"
		const titleText = scene.add.text(
			0,
			-panelHeight / 2 + 60,
			'Free Spin Reward',
			{
				fontSize: '24px',
				color: '#00ff00',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.applyBetValueGradientToText(titleText);
		this.panelContainer.add(titleText);

		// Subtitle: "You have been Granted"
		const subtitleText = scene.add.text(
			0,
			-panelHeight / 2 + 110,
			'You have been Granted',
			{
				fontSize: '24px',
				color: '#ffffff',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.panelContainer.add(subtitleText);

		// Inner card for spins + bet
		const cardWidth = 144;
		const cardHeight = 135;
		const cardY = 0;
		const cardBg = scene.add.graphics();
		cardBg.fillStyle(0x212121, 1);
		cardBg.lineStyle(3, 0x4d4d4d, 1);
		const cardRadius = 12;
		cardBg.fillRoundedRect(-cardWidth / 2, cardY - cardHeight / 2, cardWidth, cardHeight, cardRadius);
		cardBg.strokeRoundedRect(-cardWidth / 2, cardY - cardHeight / 2, cardWidth, cardHeight, cardRadius);
		this.panelContainer.add(cardBg);

		// Big spins number
		this.panelSpinsText = scene.add.text(
			0,
			cardY - 25,
			this.initialFreeSpins.toString(),
			{
				fontSize: '64px',
				color: '#ffcc33',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.applySpinCountGradient();
		this.panelContainer.add(this.panelSpinsText);

		// Gentle scaling animation (pulse) for the spin count
		if (this.panelSpinsText) {
			this.panelSpinsText.setScale(1);
			scene.tweens.add({
				targets: this.panelSpinsText,
				scaleX: 1.08,
				scaleY: 1.08,
				duration: 500,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.easeInOut'
			});
		}

		// "Spins" label
		const spinsLabel = scene.add.text(
			0,
			cardY + 15,
			'Spins',
			{
				fontSize: '20px',
				color: '#ffffff',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.panelContainer.add(spinsLabel);

		// "With $X.XX" line
		const isDemo = (scene as any).gameAPI?.getDemoState();
		const currencyPrefix = isDemo ? '' : CurrencyManager.getCurrencyCode();
		const betValue =
			this.initBet != null
				? this.initBet
				: (this.slotControllerRef && (this.slotControllerRef as any).getBaseBetAmount)
					? (this.slotControllerRef as any).getBaseBetAmount()
					: 0;

		const betDisplay = formatCurrencyNumber(betValue);

		// "With" (white) and bet value (green) as separate texts so styles can differ
		const withText = scene.add.text(
			0,
			0,
			'With',
			{
				fontSize: '14px',
				color: '#ffffff',
				fontFamily: 'poppins-regular'
			}
		);

		this.panelBetText = scene.add.text(
			0,
			0,
			`${currencyPrefix} ${betDisplay}`,
			{
				fontSize: '20px',
				color: '#379557',
				fontFamily: 'poppins-bold'
			}
		);

		// Center the combined "With $X.XX" group horizontally
		const spacing = 6;
		const totalWidth = withText.width + spacing + this.panelBetText.width;
		const baseX = -totalWidth / 2;
		const betY = cardY + 45;

		withText.setPosition(baseX + withText.width / 2, betY);
		this.panelBetText.setPosition(
			baseX + withText.width + spacing + this.panelBetText.width / 2,
			betY
		);

		withText.setOrigin(0.5, 0.5);
		this.panelBetText.setOrigin(0.5, 0.5);

		this.panelContainer.add(withText);
		this.panelContainer.add(this.panelBetText);
		// Apply gradient to the bet value text
		this.applyBetValueGradientToText(this.panelBetText);

		// "SPIN NOW" button using provided image asset
		const buttonY = panelHeight / 2 - 85;
		const buttonImage = scene.add.image(0, buttonY, 'spin_now_button')
			.setOrigin(0.5, 0.5);
		this.panelContainer.add(buttonImage);

		// Overlay "SPIN NOW" text on top of the button image
		const buttonLabel = scene.add.text(
			0,
			buttonY,
			'SPIN NOW',
			{
				fontSize: '24px',
				color: '#000000',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.panelContainer.add(buttonLabel);

		// Make button interactive
		buttonImage.setInteractive({ useHandCursor: true });
		buttonImage.on('pointerdown', () => {
			const audioManager =
				(this.sceneRef as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}
			if (!this.sceneRef) {
				// Fallback: no scene reference, hide immediately
				if (this.panelContainer) {
					this.panelContainer.setVisible(false);
				}
				if (this.panelOverlay) {
					this.panelOverlay.setVisible(false);
					this.panelOverlay.disableInteractive();
				}
				if (this.slotControllerRef && this.initialFreeSpins > 0) {
					// Start tracking real wins for this dedicated free-round session.
					// The player will trigger each free spin manually using the
					// dedicated free round spin button; we no longer start autoplay
					// when "SPIN NOW" is clicked.
					this.startTrackingFreeRoundAutoplayWins();
					this.remainingFreeSpins = this.initialFreeSpins;
					this.setFreeSpins(this.remainingFreeSpins);
				}
				return;
			}

			// Pop-out animation, then hide and start freeround autoplay
			this.animatePanelOut(this.sceneRef, this.panelContainer, () => {
				if (this.panelContainer) {
					this.panelContainer.setVisible(false);
				}
				if (this.panelOverlay) {
					this.panelOverlay.setVisible(false);
					this.panelOverlay.disableInteractive();
				}

				if (this.slotControllerRef && this.initialFreeSpins > 0) {
					// Start tracking real wins for this dedicated free-round session.
					// The player will trigger each free spin manually using the
					// dedicated free round spin button; we no longer start autoplay
					// when "SPIN NOW" is clicked.
					this.startTrackingFreeRoundAutoplayWins();
					this.remainingFreeSpins = this.initialFreeSpins;
					this.setFreeSpins(this.remainingFreeSpins);
				}
			});
		});
	}

	/**
	 * Show a completion panel after all free spins are consumed.
	 * Layout: 397w x 318h, text styles/color schemes matching the reward panel.
	 */
	private showCompletionPanel(totalWin: number): void {
		if (!this.sceneRef) {
			return;
		}

		const scene = this.sceneRef;
		const panelWidth = 397;
		const panelHeight = 318;
		const centerX = scene.scale.width * 0.5;
		const centerY = scene.scale.height * 0.5;

		// Ensure overlay exists and is active (transparent but interactive)
		if (!this.panelOverlay) {
			this.panelOverlay = scene.add.rectangle(
				scene.scale.width * 0.5,
				scene.scale.height * 0.5,
				scene.scale.width,
				scene.scale.height,
				0x000000,
				0
			);
			this.panelOverlay.setOrigin(0.5, 0.5);
			this.panelOverlay.setScrollFactor(0);
			this.panelOverlay.setDepth(9999);
		}
		this.panelOverlay.setVisible(true);
		this.panelOverlay.setInteractive({ useHandCursor: false });

		// Reuse existing panel container if available, otherwise create new
		if (!this.panelContainer) {
			this.panelContainer = scene.add.container(centerX, centerY);
		}
		this.panelContainer.removeAll(true);
		this.panelContainer.setPosition(centerX, centerY);
		this.panelContainer.setDepth(10000);
		this.panelContainer.setVisible(true);
		this.animatePanelIn(scene, this.panelContainer);

		// Background panel with rounded corners
		const bg = scene.add.graphics();
		bg.fillStyle(0x000000, 0.95);
		bg.setAlpha(0.85);
		bg.lineStyle(2, 0xffffff, 0.12);
		const panelRadius = 16;
		bg.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, panelRadius);
		bg.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, panelRadius);
		this.panelContainer.add(bg);

		// Title: "Free Spin Reward"
		const titleText = scene.add.text(
			0,
			-panelHeight / 2 + 50,
			'Free Spin Reward',
			{
				fontSize: '24px',
				color: '#00ff00',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.applyBetValueGradientToText(titleText);
		this.panelContainer.add(titleText);

		// Line 1: "You won $XX.XX with"
		const totalWinDisplay = formatCurrencyNumber(totalWin);
		const isDemo = (scene as any).gameAPI?.getDemoState();
		const currencyPrefix = isDemo ? '' : CurrencyManager.getCurrencyCode();

		const line1Y = -40;
		const line1Parts = [
			{
				text: 'You won ',
				style: { fontSize: '24px', color: '#ffffff', fontFamily: 'poppins-bold' }
			},
			{
				text: `${currencyPrefix} ${totalWinDisplay}`,
				style: { fontSize: '32px', color: '#00ff00', fontFamily: 'poppins-bold' }
			},
			{
				text: ' with',
				style: { fontSize: '24px', color: '#ffffff', fontFamily: 'poppins-bold' }
			}
		];

		let line1Width = 0;
		const line1TextObjects: Phaser.GameObjects.Text[] = [];
		line1Parts.forEach((part, index) => {
			const t = scene.add.text(0, 0, part.text, part.style);
			// Apply green gradient to the winnings value segment
			if (!isDemo && index === 1) {
				this.applyBetValueGradientToText(t);
			}
			line1Width += t.width;
			line1TextObjects.push(t);
		});
		let cursorX = -line1Width / 2;
		for (const t of line1TextObjects) {
			t.setPosition(cursorX + t.width / 2, line1Y);
			t.setOrigin(0.5, 0.5);
			this.panelContainer.add(t);
			cursorX += t.width;
		}

		// Line 2: "NN spins with $XX"
		const spinsText = `${this.initialFreeSpins}`;
		const betValue =
			this.initBet != null
				? this.initBet
				: (this.slotControllerRef && (this.slotControllerRef as any).getBaseBetAmount)
					? (this.slotControllerRef as any).getBaseBetAmount()
					: 0;
		const betDisplay = formatCurrencyNumber(betValue);

		const line2Y = 0;
		const spinsCountText = scene.add.text(
			0,
			0,
			spinsText,
			{
				fontSize: '24px',
				color: '#ffcc33',
				fontFamily: 'poppins-bold'
			}
		);
		// Reuse spin-count gradient on smaller text
		const spinsCtx: any = spinsCountText as any;
		const ctx2: CanvasRenderingContext2D | undefined = spinsCtx.context;
		if (ctx2 && typeof spinsCtx.updateText === 'function') {
			spinsCtx.updateText();
			const h2 = spinsCountText.height || 1;
			const grad2 = ctx2.createLinearGradient(0, 0, 0, h2);
			grad2.addColorStop(0, '#FFD180');
			grad2.addColorStop(0.5, '#FDB832');
			grad2.addColorStop(1, '#B4720A');
			spinsCountText.setFill(grad2 as any);
		}

		const line2Static1 = scene.add.text(
			0,
			0,
			' spins with ',
			{
				fontSize: '22px',
				color: '#ffffff',
				fontFamily: 'poppins-bold'
			}
		);

		const betValueText = scene.add.text(
			0,
			0,
			`${currencyPrefix} ${betDisplay}`,
			{
				fontSize: '22px',
				color: '#379557',
				fontFamily: 'poppins-bold'
			}
		);
		// Apply green gradient to bet value
		const betCtx: any = betValueText as any;
		const ctx3: CanvasRenderingContext2D | undefined = betCtx.context;
		if (ctx3 && typeof betCtx.updateText === 'function') {
			betCtx.updateText();
			const h3 = betValueText.height || 1;
			const grad3 = ctx3.createLinearGradient(0, 0, 0, h3);
			grad3.addColorStop(0, '#66D449');
			grad3.addColorStop(1, '#379557');
			betValueText.setFill(grad3 as any);
		}

		const line2Width = spinsCountText.width + line2Static1.width + betValueText.width;
		let cursor2X = -line2Width / 2;

		spinsCountText.setPosition(cursor2X + spinsCountText.width / 2, line2Y);
		spinsCountText.setOrigin(0.5, 0.5);
		this.panelContainer.add(spinsCountText);
		cursor2X += spinsCountText.width;

		line2Static1.setPosition(cursor2X + line2Static1.width / 2, line2Y);
		line2Static1.setOrigin(0.5, 0.5);
		this.panelContainer.add(line2Static1);
		cursor2X += line2Static1.width;

		betValueText.setPosition(cursor2X + betValueText.width / 2, line2Y);
		betValueText.setOrigin(0.5, 0.5);
		this.panelContainer.add(betValueText);

		// "CLAIM NOW" button using the same image
		const buttonY = panelHeight / 2 - 85;
		const buttonImage = scene.add.image(0, buttonY, 'spin_now_button')
			.setOrigin(0.5, 0.5);
		this.panelContainer.add(buttonImage);

		const buttonLabel = scene.add.text(
			0,
			buttonY,
			'CLAIM NOW',
			{
				fontSize: '24px',
				color: '#000000',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.panelContainer.add(buttonLabel);

		buttonImage.setInteractive({ useHandCursor: true });
		buttonImage.on('pointerdown', () => {
			if (!this.sceneRef) {
				// Fallback: no scene reference, hide immediately
				if (this.panelContainer) {
					this.panelContainer.setVisible(false);
				}
				if (this.panelOverlay) {
					this.panelOverlay.setVisible(false);
					this.panelOverlay.disableInteractive();
				}
				// Optionally emit an event here if the game needs to react to the claim.
				return;
			}

			// Pop-out animation, then hide completion panel and overlay
			this.animatePanelOut(this.sceneRef, this.panelContainer, () => {
				if (this.panelContainer) {
					this.panelContainer.setVisible(false);
				}
				if (this.panelOverlay) {
					this.panelOverlay.setVisible(false);
					this.panelOverlay.disableInteractive();
				}
				// Optionally emit an event here if the game needs to react to the claim.
			});
		});
	}

	/**
	 * Alternate completion panel variant:
	 * Line 1: "[winnings] has been credited"
	 * Line 2: "to your balance"
	 * Button: "OK"
	 * Title: "Free Spin Done"
	 */
	private showCompletionCreditedPanel(totalWin: number): void {
		if (!this.sceneRef) {
			return;
		}

		const scene = this.sceneRef;
		const panelWidth = 397;
		const panelHeight = 318;
		const centerX = scene.scale.width * 0.5;
		const centerY = scene.scale.height * 0.5;

		// Ensure overlay exists and is active
		if (!this.panelOverlay) {
			this.panelOverlay = scene.add.rectangle(
				scene.scale.width * 0.5,
				scene.scale.height * 0.5,
				scene.scale.width,
				scene.scale.height,
				0x000000,
				0.6
			);
			this.panelOverlay.setOrigin(0.5, 0.5);
			this.panelOverlay.setScrollFactor(0);
			this.panelOverlay.setDepth(9999);
		}
		this.panelOverlay.setVisible(true);
		this.panelOverlay.setInteractive({ useHandCursor: false });

		// Reuse existing panel container if available, otherwise create new
		if (!this.panelContainer) {
			this.panelContainer = scene.add.container(centerX, centerY);
		}
		this.panelContainer.removeAll(true);
		this.panelContainer.setPosition(centerX, centerY);
		this.panelContainer.setDepth(10000);
		this.panelContainer.setVisible(true);
		this.animatePanelIn(scene, this.panelContainer);

		// Background panel with rounded corners
		const bg = scene.add.graphics();
		bg.fillStyle(0x000000, 0.95);
		bg.setAlpha(0.85);
		bg.lineStyle(2, 0xffffff, 0.12);
		const panelRadius = 16;
		bg.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, panelRadius);
		bg.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, panelRadius);
		this.panelContainer.add(bg);

		// Title: "Free Spin Done" with green gradient
		const titleText = scene.add.text(
			0,
			-panelHeight / 2 + 50,
			'Free Spin Done',
			{
				fontSize: '24px',
				color: '#00ff00',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.applyBetValueGradientToText(titleText);
		this.panelContainer.add(titleText);

		// Line 1: "$XX.XX" (winnings only, on its own line)
		const totalWinDisplay = formatCurrencyNumber(totalWin);
		const isDemo = (scene as any).gameAPI?.getDemoState();
		const currencyPrefix = isDemo ? '' : CurrencyManager.getCurrencyCode();
		const winningsY = -50;

		const winningsText = scene.add.text(
			0,
			winningsY,
			`${currencyPrefix} ${totalWinDisplay}`,
			{
				fontSize: '32px',
				color: '#00ff00',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.applyBetValueGradientToText(winningsText);
		this.panelContainer.add(winningsText);

		// Line 2: "has been credited"
		const creditedStatic = scene.add.text(
			0,
			-15,
			'has been credited',
			{
				fontSize: '24px',
				color: '#ffffff',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.panelContainer.add(creditedStatic);

		// Line 3: "to your balance"
		const line2 = scene.add.text(
			0,
			10,
			'to your balance',
			{
				fontSize: '22px',
				color: '#ffffff',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.panelContainer.add(line2);

		// "OK" button using the same image
		const buttonY = panelHeight / 2 - 70;
		const buttonImage = scene.add.image(0, buttonY, 'spin_now_button')
			.setOrigin(0.5, 0.5);
		this.panelContainer.add(buttonImage);

		const buttonLabel = scene.add.text(
			0,
			buttonY,
			'OK',
			{
				fontSize: '24px',
				color: '#000000',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5);
		this.panelContainer.add(buttonLabel);

		buttonImage.setInteractive({ useHandCursor: true });
		buttonImage.on('pointerdown', () => {
			// Hide credited completion panel and overlay
			if (!this.sceneRef) {
				// Fallback: no scene reference, hide immediately
				if (this.panelContainer) {
					this.panelContainer.setVisible(false);
				}
				if (this.panelOverlay) {
					this.panelOverlay.setVisible(false);
					this.panelOverlay.disableInteractive();
				}
				// Now that free rounds are fully finished and acknowledged:
				// 1) Hide FreeRoundManager UI & restore normal spin button
				// 2) Re-enable the SlotController controls.
				this.stopTrackingFreeRoundAutoplayWins();
				this.disableFreeSpinMode();
				if (this.slotControllerRef && (this.slotControllerRef as any).enableControlsAfterFreeRounds) {
					this.slotControllerRef.enableControlsAfterFreeRounds();
				}
				return;
			}

			// Pop-out animation, then hide credited completion panel and overlay,
			// and finally restore normal controls.
			this.animatePanelOut(this.sceneRef, this.panelContainer, () => {
				if (this.panelContainer) {
					this.panelContainer.setVisible(false);
				}
				if (this.panelOverlay) {
					this.panelOverlay.setVisible(false);
					this.panelOverlay.disableInteractive();
				}

				// Now that free rounds are fully finished and acknowledged:
				// 1) Hide FreeRoundManager UI & restore normal spin button
				// 2) Re-enable the SlotController controls.
				this.stopTrackingFreeRoundAutoplayWins();
				this.disableFreeSpinMode();
				if (this.slotControllerRef && (this.slotControllerRef as any).enableControlsAfterFreeRounds) {
					this.slotControllerRef.enableControlsAfterFreeRounds();
				}
			});
		});
	}

	/**
	 * Enable free spin mode:
	 * - Show the free round button (and its text)
	 * - Hide the regular spin button and related icons
	 * - Sync game state so logic treats this as free spin context
	 */
	public enableFreeSpinMode(): void {
		if (this.container) {
			this.container.setVisible(true);
		}

		console.log('[FreeRoundManager] Enabling free spin mode (re-skinning SlotController spin button for free rounds)');

		// Re-skin the SlotController's spin button to use the freeround background,
		// but keep its interaction and core behavior intact.
		if (this.spinButton) {
			try {
				this.spinButton.setTexture('freeround_bg');
				this.spinButton.setVisible(true);
				this.spinButton.setInteractive();
			} catch (e) {
				console.warn('[FreeRoundManager] Failed to set freeround_bg texture on spin button:', e);
			}
		}
		// Hide autoplay stop icon during initialization free rounds; spin icon can
		// remain as-is so existing animation/UX is preserved.
		if (this.autoplayStopIcon) {
			this.autoplayStopIcon.setVisible(false);
		}

		// Disable other controls while free rounds are active
		if (this.slotControllerRef && (this.slotControllerRef as any).disableControlsForFreeRounds) {
			this.slotControllerRef.disableControlsForFreeRounds();
		}

		// Optionally mark free spin mode in game state if such a flag exists
		// (use a loose cast so we don't depend on a typed property).
		try {
			(gameStateManager as any).isInFreeSpinRound = true;
		} catch {
			// If flag is not defined in GameStateManager, fail silently
		}
	}

	/**
	 * Disable free spin mode and restore the normal spin button.
	 * Note: this does NOT re-enable other SlotController controls; those are
	 * restored explicitly after the completion panel is dismissed.
	 */
	public disableFreeSpinMode(): void {
		// Hide the free round button UI
		if (this.container) {
			this.container.setVisible(false);
		}

		console.log('[FreeRoundManager] Disabling free spin mode (restoring normal spin button visuals)');

		// Restore the SlotController spin button texture and overlays.
		if (this.spinButton) {
			try {
				this.spinButton.setTexture('spin');
				this.spinButton.setVisible(true);
				this.spinButton.setInteractive();
			} catch (e) {
				console.warn('[FreeRoundManager] Failed to restore spin texture on spin button:', e);
			}
		}
		if (this.spinIcon) {
			this.spinIcon.setVisible(true);
		}
		if (this.autoplayStopIcon) {
			this.autoplayStopIcon.setVisible(true);
		}

		try {
			(gameStateManager as any).isInFreeSpinRound = false;
		} catch {
			// Optional flag
		}
	}

	/**
	 * Clean up all created game objects.
	 */
	public destroy(): void {
		if (this.container) {
			this.container.destroy(true);
			this.container = null;
		}
		if (this.panelOverlay) {
			this.panelOverlay.destroy();
			this.panelOverlay = null;
		}
		this.background = null;
		this.countText = null;
		this.labelText = null;
	}
}


