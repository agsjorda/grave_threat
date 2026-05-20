import { Scene } from 'phaser';
import { gameStateManager } from '../../managers/GameStateManager';
import type { Dialogs } from './Dialogs';
import type { SlotController } from './controller/SlotController';

/**
 * Routes SPACE keydown to the same actions as the spin button:
 * dismiss win dialogs, reel-drop skip during an active spin, or start a new spin when idle.
 */
export class SpaceHotkeyManager {
	private scene: Scene;
	private dialogs: Dialogs;
	private slotController: SlotController;
	/** When true, SPACE must not trigger spin actions (panels/menus open). */
	private readonly isSpinHotkeyBlocked?: () => boolean;

	private readonly onSpace: (event: KeyboardEvent) => void;

	constructor(
		scene: Scene,
		dialogs: Dialogs,
		slotController: SlotController,
		isSpinHotkeyBlocked?: () => boolean,
	) {
		this.scene = scene;
		this.dialogs = dialogs;
		this.slotController = slotController;
		this.isSpinHotkeyBlocked = isSpinHotkeyBlocked;

		this.onSpace = (event: KeyboardEvent) => {
			if (event.repeat) {
				return;
			}
			this.handlePress();
		};
	}

	public register(): void {
		const keyboard = this.scene.input?.keyboard;
		if (!keyboard) {
			console.warn('[SpaceHotkeyManager] Keyboard input not available – SPACE hotkey disabled');
			return;
		}

		keyboard.on('keydown-SPACE', this.onSpace);
		this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());

		console.log('[SpaceHotkeyManager] SPACE hotkey registered');
	}

	public destroy(): void {
		try {
			this.scene.input?.keyboard?.off('keydown-SPACE', this.onSpace);
		} catch {
			/* scene may already be destroyed */
		}
	}

	private handlePress(): void {
		const state = gameStateManager;

		if (state.isShowingWinDialog || this.dialogs.isDialogShowing()) {
			console.log('[SpaceHotkeyManager] SPACE → dismiss win dialog');
			this.dialogs.dismissCurrentDialog(this.scene);
			return;
		}

		if (this.isSpinHotkeyBlocked?.()) {
			return;
		}

		console.log('[SpaceHotkeyManager] SPACE → spin button activation');
		void this.slotController.requestSpin('keyboard');
	}
}
