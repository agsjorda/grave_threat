import { Scene } from 'phaser';

/**
 * Covers the whole screen with darkness, then shrinks that darkness
 * into the center as a large circle until the scene is revealed.
 */
export class CircularDarknessShrinkTransition {
	private scene: Scene;
	private overlay: Phaser.GameObjects.Graphics;
	private maskShape: Phaser.GameObjects.Graphics;
	private currentRadius: number = 0;
	private centerX: number;
	private centerY: number;
	private maxRadius: number = 0;
	private isAnimating: boolean = false;

	constructor(scene: Scene) {
		this.scene = scene;
		this.centerX = this.scene.scale.width * 0.5;
		this.centerY = this.scene.scale.height * 0.5;
		this.overlay = this.scene.add.graphics();
		this.maskShape = this.scene.make.graphics();

		this.overlay.setDepth(99999);
		this.overlay.setVisible(false);

		const mask = this.maskShape.createGeometryMask();
		this.overlay.setMask(mask);
	}

	private updateBounds(): void {
		this.maxRadius = Math.ceil(Math.hypot(this.scene.scale.width, this.scene.scale.height));
	}

	private redrawOverlay(): void {
		this.overlay.clear();
		this.overlay.fillStyle(0x000000, 1);
		this.overlay.fillRect(0, 0, this.scene.scale.width, this.scene.scale.height);
	}

	private updateMask(): void {
		this.maskShape.clear();
		this.maskShape.fillStyle(0xffffff, 1);
		this.maskShape.fillCircle(this.centerX, this.centerY, this.currentRadius);
	}

	public async playTransition(options: {
		durationMs?: number;
		centerX?: number;
		centerY?: number;
	} = {}): Promise<void> {
		if (this.isAnimating) return;
		this.isAnimating = true;

		this.centerX = options.centerX ?? this.scene.scale.width * 0.5;
		this.centerY = options.centerY ?? this.scene.scale.height * 0.5;
		this.updateBounds();

		this.currentRadius = this.maxRadius;
		this.redrawOverlay();
		this.updateMask();
		this.overlay.setVisible(true);

		const duration = Math.max(200, options.durationMs ?? 1200);
		await new Promise<void>((resolve) => {
			this.scene.tweens.add({
				targets: this,
				currentRadius: 0,
				duration,
				ease: 'Quad.easeOut',
				onUpdate: () => this.updateMask(),
				onComplete: () => resolve()
			});
		});

		this.overlay.setVisible(false);
		this.isAnimating = false;
	}

	public destroy(): void {
		try { this.overlay.clear(); } catch {}
		try { this.overlay.destroy(); } catch {}
		try { this.maskShape.clear(); } catch {}
		try { this.maskShape.destroy(); } catch {}
		this.isAnimating = false;
	}
}
