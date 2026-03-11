import { Scene, GameObjects } from "phaser";
import type { SlotInitializeData, UnresolvedSpin } from "../backend/GameAPI";
import { gameStateManager } from "./GameStateManager";

class UnresolvedSpinPopup extends GameObjects.Container {
  private background: GameObjects.Graphics;
  private messageText: GameObjects.Text;
  private buttonImage: GameObjects.Image;
  private buttonText: GameObjects.Text;
  private overlay: Phaser.GameObjects.Graphics;
  private onContinue?: () => void;
  private animationDuration: number = 300;
  private buttonOffsetY: number = 75;
  private buttonScale: number = 0.8;
  private buttonWidth: number = 364;
  private buttonHeight: number = 62;

  constructor(scene: Scene, onContinue?: () => void) {
    super(scene, 0, 0);
    this.onContinue = onContinue;

    this.overlay = new GameObjects.Graphics(scene);
    this.overlay.fillStyle(0x000000, 0.6);
    this.overlay.fillRect(0, 0, scene.scale.width, scene.scale.height);
    this.overlay.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, scene.scale.width, scene.scale.height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.overlay.setVisible(false);
    scene.add.existing(this.overlay);

    this.background = new GameObjects.Graphics(scene);
    const width = scene.scale.width * 0.8;
    const height = scene.scale.height * 0.28;
    this.background.fillStyle(0x000000, 0.8);
    this.background.fillRoundedRect(-width / 2, -height / 2, width, height, 20);

    this.messageText = new GameObjects.Text(
      scene,
      0,
      -25,
      "You have an ongoing free spin round from the last session.",
      {
        fontFamily: "Poppins-Regular",
        fontSize: "21px",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: scene.scale.width * 0.7, useAdvancedWrap: true },
      },
    );
    this.messageText.setOrigin(0.5);

    const buttonY = this.buttonOffsetY;
    this.buttonImage = new GameObjects.Image(scene, 0, buttonY, "long_button");
    this.buttonImage.setOrigin(0.5);
    this.buttonImage.setDisplaySize(
      this.buttonWidth * this.buttonScale,
      this.buttonHeight * this.buttonScale,
    );
    this.buttonImage.setScale(this.buttonScale);
    this.buttonImage.setInteractive({ useHandCursor: true });

    this.buttonText = new GameObjects.Text(scene, 0, buttonY, "Continue", {
      fontFamily: "Poppins-Bold",
      fontSize: "24px",
      color: "#000000",
      align: "center",
    });
    this.buttonText.setOrigin(0.5);

    this.buttonImage.on("pointerdown", () => {
      try {
        (window as any).audioManager?.playSoundEffect?.("button_fx");
      } catch {}
      this.hide(() => this.onContinue?.());
    });
    this.buttonImage.on("pointerover", () => this.buttonImage.setTint(0xcccccc));
    this.buttonImage.on("pointerout", () => this.buttonImage.clearTint());

    this.add([this.background, this.messageText, this.buttonImage, this.buttonText]);
    this.setPosition(scene.scale.width * 0.5, scene.scale.height * 0.5);
    this.setVisible(false);
    scene.add.existing(this);
  }

  public show(): void {
    this.overlay.setVisible(true);
    this.overlay.setDepth(100000);
    this.setVisible(true);
    this.setDepth(100001);
    this.setScale(0.5);
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: this.animationDuration,
      ease: "Back.Out",
      onStart: () => {
        try {
          (window as any).audioManager?.playSoundEffect?.("popup_open");
        } catch {}
      },
    });
  }

  public hide(callback?: () => void): void {
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.5,
      scaleY: 0.5,
      alpha: 0,
      duration: this.animationDuration * 0.8,
      ease: "Back.In",
      onComplete: () => {
        this.setVisible(false);
        this.overlay.setVisible(false);
        callback?.();
      },
    });
  }

  public override destroy(fromScene?: boolean): void {
    this.overlay?.destroy();
    super.destroy(fromScene);
  }
}

export class UnresolvedSpinManager {
  private static instance: UnresolvedSpinManager;

  private _unresolvedSpin: UnresolvedSpin | null = null;
  private _popup: UnresolvedSpinPopup | null = null;

  private constructor() {}

  public static getInstance(): UnresolvedSpinManager {
    if (!UnresolvedSpinManager.instance) {
      UnresolvedSpinManager.instance = new UnresolvedSpinManager();
    }
    return UnresolvedSpinManager.instance;
  }

  public get hasUnresolvedSpin(): boolean {
    return this._unresolvedSpin != null;
  }

  public get unresolvedSpin(): UnresolvedSpin | null {
    return this._unresolvedSpin;
  }

  public setFromInitializationData(data: SlotInitializeData | null): void {
    if (!data) {
      this._unresolvedSpin = null;
      return;
    }
    const raw = (data as any).unresolvedSpin;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      this._unresolvedSpin = null;
      return;
    }

    const uuidRaw = (raw as any).uuid;
    const indexRaw = (raw as any).index;
    const responseRaw = (raw as any).response ?? (raw as any).spinData ?? (raw as any).data;

    const uuid = typeof uuidRaw === "string" ? uuidRaw : uuidRaw != null ? String(uuidRaw) : "";
    const parsedIndex = Number(indexRaw);
    const index = Number.isFinite(parsedIndex) ? Math.max(0, Math.floor(parsedIndex)) : 0;
    const response = responseRaw as any;
    const responseIsEmpty =
      response == null ||
      (typeof response === "object" &&
        !Array.isArray(response) &&
        Object.keys(response as Record<string, unknown>).length === 0);

    // Treat empty unresolved payload as "no unresolved spin".
    if (!uuid && index === 0 && responseIsEmpty) {
      this._unresolvedSpin = null;
      return;
    }

    this._unresolvedSpin = {
      uuid,
      index,
      response: (response ?? {}) as any,
    };
  }

  public setUnresolvedSpin(spin: UnresolvedSpin | null): void {
    this._unresolvedSpin = spin;
  }

  public clear(): void {
    this._unresolvedSpin = null;
    if (this._popup) {
      this._popup.destroy(true);
      this._popup = null;
    }
  }

  public showPopupIfUnresolved(scene: Scene, onContinue?: () => void): boolean {
    if (!this.hasUnresolvedSpin) return false;
    if (this._popup) {
      this._popup.destroy(true);
      this._popup = null;
    }
    this._popup = new UnresolvedSpinPopup(scene, () => {
      this._popup = null;
      onContinue?.();
    });
    this._popup.show();
    return true;
  }

  /**
   * Resolve bonus header seed total:
   * base trigger win + sums of free-spin items before unresolved index.
   */
  public getUnresolvedBonusDisplayTotal(): number {
    const unresolved = this._unresolvedSpin;
    if (!unresolved?.response) return 0;

    const spinData: any = unresolved.response;
    const slot: any = spinData?.slot ?? {};
    const fs: any = slot.freespin ?? slot.freeSpin;
    const items: any[] = Array.isArray(fs?.items) ? fs.items : [];
    const index = typeof unresolved.index === "number" && unresolved.index >= 0 ? unresolved.index : 0;

    let baseWin = 0;
    try {
      const raw =
        (typeof slot?.baseSpinTotalWin === "number" ? slot.baseSpinTotalWin : null) ??
        (typeof slot?.triggerSpinTotalWin === "number" ? slot.triggerSpinTotalWin : null) ??
        (typeof slot?.scatterTriggerTotalWin === "number" ? slot.scatterTriggerTotalWin : null) ??
        (typeof fs?.baseSpinTotalWin === "number" ? fs.baseSpinTotalWin : null) ??
        (typeof fs?.triggerSpinTotalWin === "number" ? fs.triggerSpinTotalWin : null) ??
        (typeof fs?.triggerTotalWin === "number" ? fs.triggerTotalWin : null) ??
        (typeof slot?.scatterBaseWin === "number" ? slot.scatterBaseWin : null) ??
        (typeof fs?.scatterBaseWin === "number" ? fs.scatterBaseWin : null) ??
        (typeof fs?.baseWin === "number" ? fs.baseWin : null);
      if (typeof raw === "number" && Number.isFinite(raw)) {
        baseWin = raw;
      }
    } catch {}

    let previousItemsTotal = 0;
    for (let i = 0; i < index && i < items.length; i++) {
      const winRaw = items[i]?.totalWin ?? items[i]?.subTotalWin ?? 0;
      const win = Number(winRaw);
      if (Number.isFinite(win)) {
        previousItemsTotal += win;
      }
    }

    return baseWin + previousItemsTotal;
  }

  public applyBonusModeVisuals(scene: Scene): void {
    if (!this.hasUnresolvedSpin) return;

    // Derive base multiplier from unresolved payload when available.
    try {
      const sceneAny: any = scene as any;
      const slot: any = (this._unresolvedSpin as any)?.response?.slot ?? {};
      let derivedBase: number | null = null;

      const fs: any = slot?.freespin ?? slot?.freeSpin;
      const items: any[] = Array.isArray(fs?.items) ? fs.items : [];
      for (const item of items) {
        const tumbles: any[] =
          (Array.isArray(item?.tumbles) && item.tumbles) ||
          (Array.isArray(item?.tumble) && item.tumble) ||
          (Array.isArray(item?.tumbleSteps) && item.tumbleSteps) ||
          (Array.isArray(item?.tumbling) && item.tumbling) ||
          [];
        for (const step of tumbles) {
          const m = Number(step?.multiplier?.current);
          if (Number.isFinite(m) && m > 0) {
            derivedBase = m;
            break;
          }
        }
        if (derivedBase != null) break;
      }

      if (derivedBase == null) {
        const tumbles: any[] = Array.isArray(slot?.tumbles) ? slot.tumbles : [];
        for (const step of tumbles) {
          const m = Number(step?.multiplier?.current);
          if (Number.isFinite(m) && m > 0) {
            derivedBase = m;
            break;
          }
        }
      }

      if (derivedBase != null) {
        sceneAny.bonusBaseMultiplier = derivedBase;
        sceneAny?.bonusBackground?.syncMultiplierWheelToCurrentMultiplier?.(derivedBase);
      }
    } catch {}

    try {
      gameStateManager.isBonus = true;
      gameStateManager.isScatter = false;
    } catch {}

    try {
      const bg: any = (scene as any)?.background;
      bg?.tweenDefaultBgAlignBottom?.({ duration: 0 });
    } catch {}

    try {
      scene.events.emit("setBonusMode", true);
      scene.events.emit("showBonusBackground");
      scene.events.emit("showBonusHeader");
    } catch {}

    try {
      const sceneAny: any = scene as any;
      const header = sceneAny?.header;
      const bonusHeader = sceneAny?.bonusHeader;
      if (typeof header?.setVisible === "function") {
        header.setVisible(false);
      } else {
        header?.getContainer?.()?.setVisible?.(false);
      }
      if (typeof bonusHeader?.setVisible === "function") {
        bonusHeader.setVisible(true);
      } else {
        bonusHeader?.getContainer?.()?.setVisible?.(true);
      }

      const displayTotal = this.getUnresolvedBonusDisplayTotal();
      if (displayTotal > 0) {
        bonusHeader?.seedCumulativeWin?.(displayTotal);
        bonusHeader?.updateWinningsDisplay?.(displayTotal);
        bonusHeader?.setWinningsLabel?.("TOTAL WIN");
      }
    } catch {}

    try {
      const sceneAny: any = scene as any;
      const background = sceneAny?.background;
      const bonusBackground = sceneAny?.bonusBackground;
      if (typeof background?.setBaseUiVisible === "function") {
        background.setBaseUiVisible(false);
      } else {
        background?.getContainer?.()?.setVisible?.(false);
      }
      if (typeof bonusBackground?.setVisible === "function") {
        bonusBackground.setVisible(true);
      } else {
        bonusBackground?.getContainer?.()?.setVisible?.(true);
      }
    } catch {}
  }
}

export const unresolvedSpinManager = UnresolvedSpinManager.getInstance();
