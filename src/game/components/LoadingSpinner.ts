import { Scene } from 'phaser';
import { ensureSpineFactory } from '../../utils/SpineGuard';
import { LOADING_SPINNER_ALPHA, LOADING_SPINNER_SPINE_HEIGHT_RATIO, LOADING_SPINNER_SPINE_TIME_SCALE } from '../../config/GameConfig';
import { startAnimation } from '../../utils/SpineAnimationHelper';

/**
 * LoadingSpinner Component
 *
 * Uses the DI JOKER Spine animation (same as boot/StudioLoadingScreen) in the center of the symbols grid
 * when fetching spin data. Plays the Spine "animation" in a loop – no rotation.
 */
export class LoadingSpinner {
	private scene: Scene;
	private container: Phaser.GameObjects.Container | null = null;
	/** Either the di_joker Spine object or the fallback image/graphic */
	private spinnerContent: any = null;
	private showTimeout: ReturnType<typeof setTimeout> | null = null;
	private isVisible: boolean = false;
	/** When using Spine, we drive animation by calling update(delta) each frame so it runs inside a container. */
	private spineUpdateListener: ((time: number, delta: number) => void) | null = null;

	private centerX: number = 0;
	private centerY: number = 0;

	constructor(scene: Scene, centerX: number, centerY: number) {
		this.scene = scene;
		this.centerX = centerX;
		this.centerY = centerY;
		this.createSpinner();
	}

	public getContainer(): Phaser.GameObjects.Container | null {
		return this.container;
	}

	private createSpinner(): void {
		this.container = this.scene.add.container(this.centerX, this.centerY);
		this.container.setDepth(100001);
		this.container.setVisible(false);
		this.container.setAlpha(0);

		// Same as boot scene: ensure spine plugin/factory for this scene then create spine
		const hasSpine = ensureSpineFactory(this.scene, '[LoadingSpinner] createSpinner');
		if (hasSpine) {
			try {
				const spine = (this.scene.add as any).spine(0, 0, 'di_joker', 'di_joker-atlas');
				spine.setOrigin(0.5, 0.5);
				const desiredHeight = this.scene.scale.height * LOADING_SPINNER_SPINE_HEIGHT_RATIO;
				const spineH = (spine as any).height ?? 800;
				const scale = Math.max(0.05, desiredHeight / spineH);
				spine.setScale(scale);
				if (typeof spine.setAlpha === 'function') spine.setAlpha(LOADING_SPINNER_ALPHA);
				this.container.add(spine);
				this.spinnerContent = spine;
				startAnimation(spine, {
					animationName: 'animation',
					loop: true,
					trackIndex: 0,
					timeScale: LOADING_SPINNER_SPINE_TIME_SCALE,
					logWhenMissing: false
				});
				return;
			} catch (e) {
				console.warn('[LoadingSpinner] di_joker spine create failed:', e);
			}
		}

		// Fallback: image or graphic
		if (this.scene.textures.exists('dijoker_loading')) {
			const img = this.scene.add.image(0, 0, 'dijoker_loading');
			img.setOrigin(0.5, 0.5);
			img.setScale(0.4);
			img.setAlpha(LOADING_SPINNER_ALPHA);
			this.container.add(img);
			this.spinnerContent = img;
			return;
		}

		console.warn('[LoadingSpinner] Using fallback graphic');
		const g = this.scene.add.graphics();
		g.fillStyle(0x000000, 0.7);
		g.fillRoundedRect(-80, -80, 160, 160, 12);
		g.lineStyle(3, 0xffffff, 0.9);
		g.strokeRoundedRect(-80, -80, 160, 160, 12);
		const text = this.scene.add.text(0, 0, 'Loading...', { fontFamily: 'Poppins', fontSize: 18, color: '#ffffff' });
		text.setOrigin(0.5, 0.5);
		this.container.add(g);
		this.container.add(text);
		this.spinnerContent = null;
	}

	public showNow(): void {
		this.cancelDelayedShow();
		this.show();
	}

	public startDelayedShow(): void {
		this.cancelDelayedShow();
		this.showTimeout = setTimeout(() => this.show(), 2000);
	}

	public cancelDelayedShow(): void {
		if (this.showTimeout) {
			clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}
	}

	private show(): void {
		if (!this.container || this.isVisible) return;

		this.isVisible = true;
		this.container.setVisible(true);
		this.container.setDepth(100001);
		this.container.setAlpha(LOADING_SPINNER_ALPHA);
		if (this.spinnerContent) {
			if (typeof this.spinnerContent.setAlpha === 'function') this.spinnerContent.setAlpha(1);
			const skel = (this.spinnerContent as any).skeleton;
			if (skel?.color != null) skel.color.a = LOADING_SPINNER_ALPHA;
		}
		if (this.scene.children) {
			this.scene.children.bringToTop(this.container);
		}

		// Ensure DI JOKER Spine animation is playing (restart so it runs when visible)
		const playedAnimation = startAnimation(this.spinnerContent, {
			animationName: 'animation',
			loop: true,
			trackIndex: 0,
			timeScale: LOADING_SPINNER_SPINE_TIME_SCALE,
			logWhenMissing: false
		});
		if (playedAnimation) {
			// Drive spine animation manually so it advances when inside a container (spine-phaser may not update it otherwise)
			this.removeSpineUpdateListener();
			this.spineUpdateListener = (time: number, delta: number) => {
				if (this.spinnerContent?.updatePose && this.isVisible) {
					try {
						this.spinnerContent.updatePose(delta);
						const skel = (this.spinnerContent as any).skeleton;
						if (skel?.color != null) skel.color.a = LOADING_SPINNER_ALPHA;
					} catch {}
				}
			};
			this.scene.events.on('update', this.spineUpdateListener);
		}
	}

	private removeSpineUpdateListener(): void {
		if (this.spineUpdateListener) {
			this.scene.events.off('update', this.spineUpdateListener);
			this.spineUpdateListener = null;
		}
	}

	public hide(): void {
		if (!this.container) return;

		this.cancelDelayedShow();

		setTimeout(() => {
			if (this.isVisible && this.container) {
				this.scene.tweens.add({
					targets: this.container,
					alpha: 0,
					duration: 150,
					ease: 'Power2',
					onComplete: () => {
						this.removeSpineUpdateListener();
						if (this.container) {
							this.container.setVisible(false);
							this.isVisible = false;
						}
					}
				});
			} else if (this.container) {
				this.removeSpineUpdateListener();
				this.container.setVisible(false);
				this.isVisible = false;
			}
		}, 300);
	}

	public updatePosition(centerX: number, centerY: number): void {
		this.centerX = centerX;
		this.centerY = centerY;
		if (this.container) {
			this.container.setPosition(centerX, centerY);
		}
	}

	public isShowing(): boolean {
		return this.isVisible;
	}

	public destroy(): void {
		this.cancelDelayedShow();
		this.removeSpineUpdateListener();
		if (this.container) {
			this.container.destroy();
			this.container = null;
		}
		this.spinnerContent = null;
		this.isVisible = false;
	}
}
