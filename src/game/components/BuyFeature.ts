import { Scene } from 'phaser';
import { SlotController } from './controller/SlotController';
import { ensureSpineFactory } from '../../utils/SpineGuard';
import { CurrencyManager } from './CurrencyManager';
import { formatCurrencyNumber } from '../../utils/NumberPrecisionFormatter';
import { SoundEffectType } from '../../managers/AudioManager';
import { SPINE_SYMBOL_SCALES } from '../../config/GameConfig';
import { localizationManager } from '../../managers/LocalizationManager';
import {
  LOCALIZATION_DEFAULTS,
  POPUP_BUYFEAT_CARD_TITLE,
  POPUP_BUYFEAT_RANDOM_SCATTER,
  POPUP_BUYFEAT_START_MULTIPLIER,
} from '../../backend/LocalizationData';

export interface BuyFeatureConfig {
	position?: { x: number; y: number };
	scale?: number;
	onClose?: () => void;
	onConfirm?: () => void;
	featurePrice?: number;
}

/** Data for each buy feature card (localized title version, scatter, start multiplier) */
export interface BuyFeatureCardItem {
	titleVersion: number;
	scatterCount?: string;
	startMultiplier?: number;
	decriptionOverride? : string;
}

export class BuyFeature {
  private container!: Phaser.GameObjects.Container;
  private background!: Phaser.GameObjects.Graphics;
  private confirmButtonMask!: Phaser.GameObjects.Graphics;
  private featurePrice: number = 24000.0;
  private currentBet: number = 0.2; // Start with first bet option
  private slotController: SlotController | null = null;
  private readonly BET_MULTIPLIER: number = 100; // Multiplier for price display
  private betOptions: number[] = [
    0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 3.6, 4, 5, 6, 8, 10, 14,
    18, 24, 32, 40, 60, 80, 100, 110, 120, 130, 140, 150,
  ];
  // Index in betOptions array; -1 means "not initialized from base bet yet"
  private currentBetIndex: number = -1;
  private closeButton!: Phaser.GameObjects.Text;
  private confirmButton!: Phaser.GameObjects.Text;
  private betDisplay!: Phaser.GameObjects.Text;
  private minusButton!: Phaser.GameObjects.Text;
  private plusButton!: Phaser.GameObjects.Text;

  // Continuous button press functionality
  private minusButtonTimer: Phaser.Time.TimerEvent | null = null;
  private plusButtonTimer: Phaser.Time.TimerEvent | null = null;
  private readonly CONTINUOUS_DELAY: number = 500; // 1 second initial delay
  private readonly CONTINUOUS_INTERVAL: number = 200; // 150ms interval for continuous press
  private priceDisplay!: Phaser.GameObjects.Text;
  private featureLogo!: Phaser.GameObjects.Image;
  private backgroundImage!: Phaser.GameObjects.Image;
  private onCloseCallback?: () => void;
  private onConfirmCallback?: () => void;
  private lastExternalBaseBet: number | null = null;
  private scatterSpine?: any;
  private scatterFallbackSprite?: Phaser.GameObjects.Image;
  private scatterRetryCount: number = 0;
  private readonly SCATTER_MAX_RETRIES: number = 5;
  private selectedBuyFeatureType: 1 | 2 = 1;

  private buyFeatureTypeContainer!: Phaser.GameObjects.Container;
  private buyFeatureTypeCardsContainer!: Phaser.GameObjects.Container;
  private buyFeatureTypeCardsWrapper!: Phaser.GameObjects.Container;
  private buyFeatureScrollOffset: number = 0;
  private buyFeatureScrollMax: number = 0;
  private buyFeatureDragStartY: number = 0;
  private buyFeatureScrollStartOffset: number = 0;
  private buyFeatureDragActive: boolean = false;
  private buyFeaturePointerDownY: number = 0;
  private buyFeaturePointerDownCardIndex: number = -1;
  private buyFeaturePointerOutReleaseTimer: Phaser.Time.TimerEvent | null =
    null;
  private static readonly BUY_FEATURE_TAP_THRESHOLD = 12;
  private static readonly BUY_FEATURE_POINTER_OUT_RELEASE_DELAY = 200;
  private buyFeatureScrollZone!: Phaser.GameObjects.Zone;
  private buyFeatureScrollDisplay: number = 0;
  private buyFeatureScrollVelocity: number = 0;
  private buyFeatureScrollPrevOffset: number = 0;

  private static readonly BUY_FEATURE_SCROLL_SMOOTH = 0.2;
  private static readonly BUY_FEATURE_SCROLL_FRICTION = 0.92;
  private static readonly BUY_FEATURE_SCROLL_ELASTIC_RETURN = 0.18;
  private static readonly BUY_FEATURE_SCROLL_MAX_OVERSCROLL = 50;
  private static readonly BUY_FEATURE_TYPE_WIDTH = 380;
  private static readonly BUY_FEATURE_TYPE_HEIGHT = 460;

  // Card layout inside buyfeaturetypecontainer (populate downwards from top)
  private static readonly CARD_PADDING = 5;
  private static readonly CARD_GAP = 12;
  private static readonly CARD_HEIGHT = 100;
  private static readonly CARD_RADIUS = 20;
  private static readonly CARD_OUTLINE_NORMAL = 1;
  private static readonly CARD_OUTLINE_SELECTED = 3;

  /** Running gradient border: path points (higher = smoother), colors, pulse width range, speed */
  private static readonly BORDER_ANIM_PATH_POINTS = 320;
  private static readonly BORDER_ANIM_STREAK_FRACTION = 1.8;
  private static readonly BORDER_ANIM_DARK = 0x004400;
  private static readonly BORDER_ANIM_BRIGHT = 0x00ff00;
  private static readonly BORDER_ANIM_WIDTH_MIN = 3;
  private static readonly BORDER_ANIM_WIDTH_MAX = 5;
  /** Speed of the moving highlight along the border (higher = faster). */
  private static readonly BORDER_ANIM_SPEED = 10;
  /** Speed of the border pulse (enlarge/shrink). Higher = faster pulse; one full cycle â‰ˆ 2Ï€ / this value seconds. */
  private static readonly BORDER_ANIM_PULSE_SPEED = 4;

  /** Card configuration */
  private static readonly CARD_ICON_SIZE = 140;
  private static readonly CARD_ICON_INSET = 4;
  private static readonly CARD_SELECTED_ICON_SIZE = 18;
  private static readonly CARD_SELECTED_ICON_INSET = 12;
  /** Gap between icon and text (px). Decrease to move text left. */
  private static readonly CARD_TEXT_OFFSET_FROM_ICON = -40;
  /** Base font size (px) for card title text. Adjust to scale the title. */
  private static readonly CARD_TITLE_FONT_SIZE = 14;
  /** Idle scatter size as fraction of icon size. */
  private static readonly CARD_SCATTER_SIZE_RATIO = 0.45;
  /** Horizontal offset for the card icon center position (buy_feature_logo). */
  private static readonly CARD_ICON_OFFSET_X = -20;
  /** Additional per-axis scale for popup card scatter (applied after SPINE_SYMBOL_SCALES[0]). */
  private static readonly CARD_SCATTER_SCALE_OFFSET_X = 1;
  private static readonly CARD_SCATTER_SCALE_OFFSET_Y = 1;
  private static readonly SCATTER_SPINE_KEY = "symbol_0_spine";
  private static readonly SCATTER_SPINE_ATLAS_KEY = "symbol_0_spine-atlas";
  private static readonly SCATTER_IDLE_ANIM = "Symbol0_GT_idle";
  /** Multiplier digit display: scale and spacing (uses number_0..9 textures from numbers/Number0..9.webp) */
  private static readonly CARD_MULT_DIGIT_SCALE = 0.08;
  private static readonly CARD_MULT_DIGIT_SPACING = 0.5;
  private static readonly CURRENCY_LABEL = CurrencyManager.getInlinePrefix();
  private static readonly CARD_ITEMS: BuyFeatureCardItem[] = [
    {
      titleVersion: 1,
      scatterCount: "3-7",
      startMultiplier: 1,
    },
    {
      titleVersion: 2,
      scatterCount: "3-7",
      startMultiplier: 2,
    },
  ];

  private static getLocalizedCardTitle(titleVersion: number): string {
    const baseTitle =
      localizationManager.getTextByKey(POPUP_BUYFEAT_CARD_TITLE) ??
      LOCALIZATION_DEFAULTS[POPUP_BUYFEAT_CARD_TITLE] ??
      "Nathan's Goolish Gold bonus v";

    return `${baseTitle}.${titleVersion}`;
  }

  // -1 means "no card selected yet this session"; we keep the last choice otherwise.
  private buyFeatureSelectedCardIndex: number = -1;

  /**
   * Set the SlotController reference for accessing current bet
   */
  public setSlotController(slotController: SlotController): void {
    this.slotController = slotController;
  }

  /**
   * Get the current bet value multiplied by the multiplier (for price display)
   */
  private getCurrentBetValue(): number {
    return this.currentBet * this.BET_MULTIPLIER;
  }

  /**
   * Get the current bet value (for bet display)
   */
  private getCurrentBet(): number {
    return this.currentBet;
  }

  /**
   * Bet amount to show in the popup input between -/+.
   * This always reflects the base bet ladder value (currentBet), regardless of
   * which buy feature option is selected. Option 2 still uses 5x for its card
   * price and spin price, but the editable bet field stays at the base bet.
   */
  private getDisplayBetAmount(): number {
    return this.currentBet;
  }

  /**
   * Get the current bet value (public method for external access)
   */
  public getCurrentBetAmount(): number {
    return this.currentBet;
  }

  public getSelectedBuyFeatureType(): 1 | 2 {
    return this.selectedBuyFeatureType;
  }

  /**
   * Re-seed the buy feature bet from an external base bet (e.g., autoplay or bet options).
   * This updates the internal ladder index and currentBet so that option 1 matches
   * the given base bet and option 2 remains 5x that base.
   */
  public resetBetFromExternal(baseBet: number): void {
    if (!Number.isFinite(baseBet) || baseBet <= 0) return;
    let closestIndex = 0;
    let closestDifference = Math.abs(this.betOptions[0] - baseBet);
    for (let i = 1; i < this.betOptions.length; i++) {
      const difference = Math.abs(this.betOptions[i] - baseBet);
      if (difference < closestDifference) {
        closestDifference = difference;
        closestIndex = i;
      }
    }
    this.currentBetIndex = closestIndex;
    this.currentBet = this.betOptions[closestIndex];
    this.lastExternalBaseBet = this.currentBet;
  }

  /**
   * Initialize bet index based on current bet from SlotController
   */
  private initializeBetIndex(): void {
    // Only initialize once per session; afterwards we keep the user's last bet choice.
    if (this.currentBetIndex >= 0) {
      return;
    }
    if (this.slotController) {
      const currentBaseBet = this.slotController.getBaseBetAmount();

      // Find the closest bet option
      let closestIndex = 0;
      let closestDifference = Math.abs(this.betOptions[0] - currentBaseBet);

      for (let i = 1; i < this.betOptions.length; i++) {
        const difference = Math.abs(this.betOptions[i] - currentBaseBet);
        if (difference < closestDifference) {
          closestDifference = difference;
          closestIndex = i;
        }
      }

      this.currentBetIndex = closestIndex;
      this.currentBet = this.betOptions[closestIndex];
      this.lastExternalBaseBet = this.currentBet;
    }
  }

  create(scene: Scene): void {

    // Create main container
    this.container = scene.add.container(0, 0);
    this.container.setDepth(9502); // Above dialogs (9501) and header/background

    // Create background
    this.createBackground(scene);

    // Create title
    this.createTitle(scene);

    // Create buy feature type container (centered rectangle)
    this.createBuyFeatureTypeContainer(scene);

    // Create bet input
    this.createBetInput(scene);

    // Create buy button
    this.createBuyButton(scene);

    // Create close button
    this.createCloseButton(scene);

    // Initially hide the component immediately (no animation/flicker)
    if (this.container) {
      this.container.setVisible(false);
      this.container.setY(scene.scale.height);
    }
  }

  private createBackground(scene: Scene): void {
    const screenWidth = scene.cameras.main.width;
    const screenHeight = scene.cameras.main.height;

    // Create semi-transparent overlay with rounded top corners
    this.background = scene.add.graphics();
    this.background.fillStyle(0x000000, 0.8);
    this.background.fillRoundedRect(
      0,
      screenHeight - 736,
      screenWidth,
      736,
      20,
    );

    // Make the background interactive to block clicks behind it
    this.background.setInteractive(
      new Phaser.Geom.Rectangle(0, screenHeight - 736, screenWidth, 736),
      Phaser.Geom.Rectangle.Contains,
    );

    this.container.add(this.background);

    // Create background image to fill the background area
    const backgroundTop = screenHeight - 736;
    this.backgroundImage = scene.add.image(
      screenWidth / 2,
      backgroundTop + 368,
      "buy_feature_bg",
    );

    // Scale the image to fill the background area (736px height)
    const scaleY = 736 / this.backgroundImage.height;
    const scaleX = screenWidth / this.backgroundImage.width;
    const scale = Math.max(scaleX, scaleY); // Use the larger scale to ensure full coverage
    this.backgroundImage.setScale(scale);

    this.container.add(this.backgroundImage);
  }

  private createTitle(scene: Scene): void {
    const screenWidth = scene.cameras.main.width;
    const screenHeight = scene.cameras.main.height;
    const backgroundTop = screenHeight - 736;

    const title = scene.add.text(
      screenWidth / 2 - 110,
      backgroundTop + 40,
      "Buy Feature",
      {
        fontSize: "24px",
        fontFamily: "Poppins-Regular",
        color: "#00ff00",
        fontStyle: "bold",
      },
    );
    title.setOrigin(0.5);
    this.container.add(title);
  }

  private createBuyFeatureTypeContainer(scene: Scene): void {
    const screenWidth = scene.cameras.main.width;
    const screenHeight = scene.cameras.main.height;
    const backgroundTop = screenHeight - 736;
    const centerX = screenWidth / 2;
    const centerY = backgroundTop + 300;

    const w = BuyFeature.BUY_FEATURE_TYPE_WIDTH;
    const h = BuyFeature.BUY_FEATURE_TYPE_HEIGHT;

    this.buyFeatureTypeContainer = scene.add.container(centerX, centerY);
    this.buyFeatureTypeContainer.setName("buyfeaturetypecontainer");

    // const outline = scene.add.graphics();
    // outline.lineStyle(2, 0xffffff, 1);
    // outline.strokeRect(-w / 2, -h / 2, w, h);
    // this.buyFeatureTypeContainer.add(outline);

    // Scroll zone added first so cards (added later) are on top and receive clicks
    this.setupBuyFeatureScrollInput(scene, w, h);
    // Cards in their own container so only cards are masked to the bounds
    this.buyFeatureTypeCardsContainer = scene.add.container(0, 0);
    this.buyFeatureTypeCardsWrapper = scene.add.container(0, 0);
    this.buyFeatureTypeCardsContainer.add(this.buyFeatureTypeCardsWrapper);
    this.populateBuyFeatureTypeCards(scene);
    this.updateCardPrices();
    this.updateBuyFeatureScrollMax();
    this.buyFeatureTypeContainer.add(this.buyFeatureTypeCardsContainer);

    // Mask in panel space at same position as type container so it aligns with cards
    const maskGraphics = scene.add.graphics();
    maskGraphics.setPosition(centerX, centerY);
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(-w / 2, -h / 2, w, h);
    this.buyFeatureTypeCardsContainer.setMask(
      maskGraphics.createGeometryMask(),
    );
    maskGraphics.setVisible(false);
    this.container.add(maskGraphics);

    this.container.add(this.buyFeatureTypeContainer);
  }

  private getCardCenterY(index: number): number {
    const h = BuyFeature.BUY_FEATURE_TYPE_HEIGHT;
    const topY = -h / 2 + BuyFeature.CARD_PADDING;
    return (
      topY +
      BuyFeature.CARD_HEIGHT / 2 +
      index * (BuyFeature.CARD_HEIGHT + BuyFeature.CARD_GAP)
    );
  }

  private populateBuyFeatureTypeCards(scene: Scene): void {
    const cardWidth =
      BuyFeature.BUY_FEATURE_TYPE_WIDTH - BuyFeature.CARD_PADDING * 2;
    for (let i = 0; i < BuyFeature.CARD_ITEMS.length; i++) {
      const cardY = this.getCardCenterY(i);
      const cardContainer = this.generateBuyFeatureTypeCard(
        scene,
        cardY,
        i,
        i === this.buyFeatureSelectedCardIndex,
      );
      cardContainer.setData("index", i);
      // Hit area in container LOCAL space (container is at (0, cardCenterY))
      const hitArea = new Phaser.Geom.Rectangle(
        -cardWidth / 2,
        -BuyFeature.CARD_HEIGHT / 2,
        cardWidth,
        BuyFeature.CARD_HEIGHT,
      );
      cardContainer.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
      cardContainer.on("pointerdown", (ptr: Phaser.Input.Pointer) =>
        this.onBuyFeatureAreaPointerDown(ptr, i),
      );
      this.buyFeatureTypeCardsWrapper.add(cardContainer);
    }
  }

  private selectBuyFeatureCard(index: number): void {
    if (index < 0 || index >= BuyFeature.CARD_ITEMS.length) return;
    if (this.buyFeatureSelectedCardIndex === index) return;
    this.buyFeatureSelectedCardIndex = index;
    this.selectedBuyFeatureType = index === 1 ? 2 : 1;
    this.refreshBuyFeatureCardOutlines();
    this.updateBetDisplay();
  }

  private refreshBuyFeatureCardOutlines(): void {
    if (!this.buyFeatureTypeCardsWrapper) return;
    const list = this.buyFeatureTypeCardsWrapper
      .list as Phaser.GameObjects.Container[];
    for (let i = 0; i < list.length; i++) {
      const cardContainer = list[i];
      const idx = cardContainer.getData("index") as number;
      const cardBg = cardContainer.getData(
        "cardBg",
      ) as Phaser.GameObjects.Graphics;
      const selectedIcon = cardContainer.getData("selectedIcon") as
        | Phaser.GameObjects.Image
        | undefined;
      if (cardBg)
        this.drawCardBackground(
          cardBg,
          idx === this.buyFeatureSelectedCardIndex,
        );
      if (selectedIcon)
        selectedIcon.setVisible(idx === this.buyFeatureSelectedCardIndex);
    }
  }

  /** Returns points along a sharp rectangle (rounded rect bounds, no corner arcs). For highlight so it turns 90Â° at corners. */
  private static getSharpRectBorderPoints(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    numPoints: number,
  ): { x: number; y: number }[] {
    const r = Math.min(radius, w / 2, h / 2);
    const top = y,
      bottom = y + h,
      left = x,
      right = x + w;
    const edgeW = w - 2 * r,
      edgeH = h - 2 * r;
    const len = 2 * edgeW + 2 * edgeH;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < numPoints; i++) {
      let t = (i / Math.max(1, numPoints - 1)) * len;
      if (t >= len) t = 0;
      let px: number, py: number;
      if (t < edgeW) {
        px = left + r + t;
        py = top;
      } else if (t < edgeW + edgeH) {
        px = right;
        py = top + r + (t - edgeW);
      } else if (t < edgeW + edgeH + edgeW) {
        px = right - r - (t - edgeW - edgeH);
        py = bottom;
      } else {
        px = left;
        py = bottom - r - (t - edgeW - edgeH - edgeW);
      }
      points.push({ x: px, y: py });
    }
    return points;
  }

  /** Returns points along the perimeter of a rounded rect (closed path). numPoints = n+1 for n segments so last point = first. */
  private static getRoundedRectBorderPoints(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    numPoints: number,
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    const r = Math.min(radius, w / 2, h / 2);
    const top = y,
      bottom = y + h,
      left = x,
      right = x + w;
    const edgeW = w - 2 * r,
      edgeH = h - 2 * r;
    const quarter = (Math.PI / 2) * r;
    const len = 2 * edgeW + 2 * edgeH + 4 * quarter;
    for (let i = 0; i < numPoints; i++) {
      let t = (i / Math.max(1, numPoints - 1)) * len;
      if (t >= len) t = 0;
      let px: number, py: number;
      if (t < edgeW) {
        px = left + r + t;
        py = top;
      } else if (t < edgeW + quarter) {
        const u = (t - edgeW) / quarter;
        // Top-right arc: center (right-r, top+r), 270Â° -> 360Â°
        px = right - r + r * Math.sin(u * (Math.PI / 2));
        py = top + r - r * Math.cos(u * (Math.PI / 2));
      } else if (t < edgeW + quarter + edgeH) {
        px = right;
        py = top + r + (t - edgeW - quarter);
      } else if (t < edgeW + quarter + edgeH + quarter) {
        const u = (t - edgeW - quarter - edgeH) / quarter;
        // Bottom-right arc: center (right-r, bottom-r), 0Â° -> 90Â°
        px = right - r + r * Math.cos(u * (Math.PI / 2));
        py = bottom - r + r * Math.sin(u * (Math.PI / 2));
      } else if (t < edgeW + quarter + edgeH + quarter + edgeW) {
        px = right - r - (t - edgeW - quarter - edgeH - quarter);
        py = bottom;
      } else if (t < edgeW + quarter + edgeH + quarter + edgeW + quarter) {
        const u = (t - edgeW - quarter - edgeH - quarter - edgeW) / quarter;
        // Bottom-left arc: center (left+r, bottom-r), 90Â° -> 180Â°
        px = left + r - r * Math.sin(u * (Math.PI / 2));
        py = bottom - r + r * Math.cos(u * (Math.PI / 2));
      } else if (t < len - quarter) {
        px = left;
        py =
          bottom -
          r -
          (t - edgeW - quarter - edgeH - quarter - edgeW - quarter);
      } else {
        const u = (t - (len - quarter)) / quarter;
        // Top-left arc: center (left+r, top+r), 180Â° -> 270Â°
        px = left + r - r * Math.cos(u * (Math.PI / 2));
        py = top + r - r * Math.sin(u * (Math.PI / 2));
      }
      points.push({ x: px, y: py });
    }
    return points;
  }

  private drawCardBackground(
    graphics: Phaser.GameObjects.Graphics,
    selected: boolean,
    animationTime?: number,
  ): void {
    const cardWidth =
      BuyFeature.BUY_FEATURE_TYPE_WIDTH - BuyFeature.CARD_PADDING * 2;
    const x = -cardWidth / 2;
    const y = -BuyFeature.CARD_HEIGHT / 2;
    graphics.clear();
    graphics.fillStyle(0x0a0a0a, 0.95);
    graphics.fillRoundedRect(
      x,
      y,
      cardWidth,
      BuyFeature.CARD_HEIGHT,
      BuyFeature.CARD_RADIUS,
    );
    if (selected && animationTime !== undefined) {
      this.drawRunningGradientBorder(
        graphics,
        x,
        y,
        cardWidth,
        BuyFeature.CARD_HEIGHT,
        BuyFeature.CARD_RADIUS,
        animationTime,
      );
    } else {
      const lineW = selected
        ? BuyFeature.CARD_OUTLINE_SELECTED
        : BuyFeature.CARD_OUTLINE_NORMAL;
      const color = 0x00ff00;
      const alpha = selected ? 1 : 0.5;
      graphics.lineStyle(lineW, color, alpha);
      graphics.strokeRoundedRect(
        x,
        y,
        cardWidth,
        BuyFeature.CARD_HEIGHT,
        BuyFeature.CARD_RADIUS,
      );
    }
  }

  private drawRunningGradientBorder(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    time: number,
  ): void {
    const pulse =
      0.5 + 0.5 * Math.sin(time * BuyFeature.BORDER_ANIM_PULSE_SPEED);
    const lineW =
      BuyFeature.BORDER_ANIM_WIDTH_MIN +
      (BuyFeature.BORDER_ANIM_WIDTH_MAX - BuyFeature.BORDER_ANIM_WIDTH_MIN) *
        pulse;
    // Single smooth stroke for the full border (smooth edges, no segments)
    graphics.lineStyle(lineW, BuyFeature.BORDER_ANIM_DARK, 0.9);
    graphics.strokeRoundedRect(x, y, w, h, radius);
    // Running highlight with gradient: bright at leading edge, fading to dark at trailing edge
    const pathPoints = BuyFeature.getRoundedRectBorderPoints(
      x,
      y,
      w,
      h,
      radius,
      BuyFeature.BORDER_ANIM_PATH_POINTS + 1,
    );
    const pathLen = pathPoints.length - 1;
    const streakLength = Math.floor(
      pathLen * BuyFeature.BORDER_ANIM_STREAK_FRACTION,
    );
    const t0 =
      ((Math.floor(time * BuyFeature.BORDER_ANIM_SPEED * 12) % pathLen) +
        pathLen) %
      pathLen;
    const dark = BuyFeature.BORDER_ANIM_DARK;
    const bright = BuyFeature.BORDER_ANIM_BRIGHT;
    for (let i = 0; i < streakLength; i++) {
      const t = i / streakLength;
      const r = Math.round(
        (1 - t) * ((dark >> 16) & 0xff) + t * ((bright >> 16) & 0xff),
      );
      const g = Math.round(
        (1 - t) * ((dark >> 8) & 0xff) + t * ((bright >> 8) & 0xff),
      );
      const b = Math.round((1 - t) * (dark & 0xff) + t * (bright & 0xff));
      const color = (r << 16) | (g << 8) | b;
      const alpha = 0.35 + 0.65 * t;
      graphics.lineStyle(lineW + 0.5, color, alpha);
      graphics.beginPath();
      graphics.moveTo(
        pathPoints[(t0 + i) % pathLen].x,
        pathPoints[(t0 + i) % pathLen].y,
      );
      graphics.lineTo(
        pathPoints[(t0 + i + 1) % pathLen].x,
        pathPoints[(t0 + i + 1) % pathLen].y,
      );
      graphics.strokePath();
    }
  }

  private updateSelectedCardBorderAnimation(): void {
    if (
      !this.container?.visible ||
      this.buyFeatureSelectedCardIndex < 0 ||
      !this.buyFeatureTypeCardsWrapper
    )
      return;
    const list = this.buyFeatureTypeCardsWrapper
      .list as Phaser.GameObjects.Container[];
    const cardContainer = list[this.buyFeatureSelectedCardIndex];
    if (!cardContainer) return;
    const cardBg = cardContainer.getData(
      "cardBg",
    ) as Phaser.GameObjects.Graphics;
    if (!cardBg) return;
    const scene = this.container.scene;
    const time = (scene.game.loop?.time ?? 0) / 1000;
    this.drawCardBackground(cardBg, true, time);
  }

  private static readonly MULT_DIGIT_KEYS: { [key: string]: string } = {
    "0": "number_0",
    "1": "number_1",
    "2": "number_2",
    "3": "number_3",
    "4": "number_4",
    "5": "number_5",
    "6": "number_6",
    "7": "number_7",
    "8": "number_8",
    "9": "number_9",
  };

  /**
   * Creates a container with digit sprites for multiplier value (e.g. 16) using number_0..9 textures.
   * If no value is passed, displays "". Returns null if any required texture is missing.
   * Digits are left-aligned: leftX is the x position of the left edge of the first digit.
   */
  private createMultiplierDigitDisplay(
    scene: Scene,
    leftX: number,
    centerY: number,
    value?: number,
  ): Phaser.GameObjects.Container | null {
    const str = value != null && value !== undefined ? `${value}` : "";
    const scale = BuyFeature.CARD_MULT_DIGIT_SCALE;
    const spacing = BuyFeature.CARD_MULT_DIGIT_SPACING;
    const keys: string[] = [];
    for (let i = 0; i < str.length; i++) {
      const key = BuyFeature.MULT_DIGIT_KEYS[str[i]];
      if (!key || !scene.textures.exists(key)) return null;
      keys.push(key);
    }
    const container = scene.add.container(leftX, centerY);
    let x = 0;
    for (let i = 0; i < keys.length; i++) {
      const img = scene.add
        .image(x, 0, keys[i])
        .setOrigin(0, 0.5)
        .setScale(scale);
      container.add(img);
      const tex = scene.textures.get(keys[i]);
      x += ((tex as any)?.source?.[0]?.width ?? 0) * scale + spacing;
    }
    return container;
  }

  private generateBuyFeatureTypeCard(
    scene: Scene,
    cardCenterY: number,
    index: number,
    selected: boolean,
  ): Phaser.GameObjects.Container {
    const cardWidth =
      BuyFeature.BUY_FEATURE_TYPE_WIDTH - BuyFeature.CARD_PADDING * 2;
    const item = BuyFeature.CARD_ITEMS[index] || BuyFeature.CARD_ITEMS[0];
    const localizedCardTitle = BuyFeature.getLocalizedCardTitle(
      item.titleVersion,
    );
    const cardContainer = scene.add.container(0, cardCenterY);

    // Background (dark card + green border)
    const cardBg = scene.add.graphics();
    this.drawCardBackground(cardBg, selected);
    cardContainer.add(cardBg);
    cardContainer.setData("cardBg", cardBg);

    const leftX = -cardWidth / 2 + BuyFeature.CARD_ICON_INSET;
    const iconY = -BuyFeature.CARD_ICON_SIZE / 2; // center icon vertically on card
    const iconSize = BuyFeature.CARD_ICON_SIZE;
    const iconCenterX = leftX + iconSize / 2 + BuyFeature.CARD_ICON_OFFSET_X;
    const iconCenterY = iconY + iconSize / 2;

    // Left panel: buy_feature_logo (card 1) or buy_feature_logo2 (card 2)
    const iconKey =
      item.startMultiplier === 2 && scene.textures.exists("buy_feature_logo2")
        ? "buy_feature_logo2"
        : "buy_feature_logo";
    const iconBg = scene.add
      .image(iconCenterX, iconCenterY, iconKey)
      .setOrigin(0.5, 0.5);
    iconBg.setDisplaySize(iconSize, iconSize);
    cardContainer.add(iconBg);

    // Idle scatter symbol in the middle of the icon (Spine or PNG fallback), looping
    const scatterDisplaySize = iconSize * BuyFeature.CARD_SCATTER_SIZE_RATIO;
    const scatterScaleFromConfig = SPINE_SYMBOL_SCALES[0] ?? 1;
    const scatterDisplayW =
      scatterDisplaySize *
      scatterScaleFromConfig *
      BuyFeature.CARD_SCATTER_SCALE_OFFSET_X;
    const scatterDisplayH =
      scatterDisplaySize *
      scatterScaleFromConfig *
      BuyFeature.CARD_SCATTER_SCALE_OFFSET_Y;
    let scatterObj: Phaser.GameObjects.GameObject | null = null;
    if (ensureSpineFactory(scene, "[BuyFeature] card scatter")) {
      const addAny = scene.add as any;
      const spine = addAny.spine?.(
        iconCenterX,
        iconCenterY,
        BuyFeature.SCATTER_SPINE_KEY,
        BuyFeature.SCATTER_SPINE_ATLAS_KEY,
      );
      if (spine) {
        spine.setOrigin(0.5, 0.5);
        try {
          if (spine.setDisplaySize) {
            spine.setDisplaySize(scatterDisplayW, scatterDisplayH);
          } else {
            // Scale to fit (Spine skeleton height ~1000â€“2000px; target scatterDisplaySize px)
            const base = scatterDisplaySize / 1500;
            spine.setScale(
              base *
                scatterScaleFromConfig *
                BuyFeature.CARD_SCATTER_SCALE_OFFSET_X,
              base *
                scatterScaleFromConfig *
                BuyFeature.CARD_SCATTER_SCALE_OFFSET_Y,
            );
          }
        } catch {}
        try {
          const state = spine.animationState || spine.spine?.animationState;
          if (state && typeof state.setAnimation === "function") {
            state.setAnimation(0, BuyFeature.SCATTER_IDLE_ANIM, true);
          }
        } catch {}
        cardContainer.add(spine);
        scatterObj = spine;
      }
    }
    if (!scatterObj && scene.textures.exists("symbol_0")) {
      const fallback = scene.add
        .image(iconCenterX, iconCenterY, "symbol_0")
        .setOrigin(0.5, 0.5);
      fallback.setDisplaySize(scatterDisplayW, scatterDisplayH);
      cardContainer.add(fallback);
      scatterObj = fallback;
    }

    // Left panel: multiplier as number display (digit sprites), left-aligned from icon left edge (empty when startMultiplier === 1)
    if (item.startMultiplier !== 1) {
      const multDisplayLeftX = leftX + 20;
      const multDisplay = this.createMultiplierDigitDisplay(
        scene,
        multDisplayLeftX,
        iconCenterY - 6,
        item.startMultiplier,
      );
      if (multDisplay) {
        cardContainer.add(multDisplay);
      } else {
        const multText = scene.add
          .text(iconCenterX - 20, iconCenterY, `${item.startMultiplier}x`, {
            fontSize: "20px",
            fontFamily: "Poppins-Bold",
            color: "#ffffff",
          })
          .setOrigin(0.5, 0.5);
        cardContainer.add(multText);
      }
    }

    // Selected checkmark icon at top-right corner of card (if asset exists)
    let selectedIcon: Phaser.GameObjects.Image | undefined;
    if (scene.textures.exists("buy_feature_selected_icon")) {
      const selX = cardWidth / 2 - BuyFeature.CARD_SELECTED_ICON_INSET;
      const selY =
        -BuyFeature.CARD_HEIGHT / 2 + BuyFeature.CARD_SELECTED_ICON_INSET;
      selectedIcon = scene.add
        .image(selX, selY, "buy_feature_selected_icon")
        .setOrigin(1, 0)
        .setVisible(selected);
      selectedIcon.setDisplaySize(
        BuyFeature.CARD_SELECTED_ICON_SIZE,
        BuyFeature.CARD_SELECTED_ICON_SIZE,
      );
      cardContainer.add(selectedIcon);
      cardContainer.setData("selectedIcon", selectedIcon);
    }

    // Right panel: title, price, description
    const textLeft = leftX + iconSize + BuyFeature.CARD_TEXT_OFFSET_FROM_ICON;
    const textTop = -BuyFeature.CARD_HEIGHT / 2 + 12;
    const titleText = scene.add
      .text(textLeft, textTop + 8, localizedCardTitle, {
        fontSize: `${BuyFeature.CARD_TITLE_FONT_SIZE}px`,
        fontFamily: "Poppins-Bold",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    titleText.setWordWrapWidth(cardWidth - (textLeft - -cardWidth / 2) - 12);
    cardContainer.add(titleText);

    // Price: currency (white) + amount (green). Card 2 (v.2) uses 5x bet for price.
    const priceForCard =
      item.startMultiplier === 2
        ? this.getCurrentBetValue() * 5
        : this.getCurrentBetValue();
    const priceText = scene.add
      .text(textLeft, textTop + 32, BuyFeature.CURRENCY_LABEL + " ", {
        fontSize: "16px",
        fontFamily: "Poppins-Regular",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    cardContainer.add(priceText);
    const amountText = scene.add
      .text(
        textLeft + 40,
        textTop + 32,
        this.formatNumberWithCommas(priceForCard),
        {
          fontSize: "16px",
          fontFamily: "Poppins-Bold",
          color: "#00ff00",
        },
      )
      .setOrigin(0, 0);
    cardContainer.add(amountText);
    cardContainer.setData("priceText", priceText);
    cardContainer.setData("amountText", amountText);

    const localizedRandomScatter =
      localizationManager.getTextByKey(POPUP_BUYFEAT_RANDOM_SCATTER) ??
      LOCALIZATION_DEFAULTS[POPUP_BUYFEAT_RANDOM_SCATTER] ??
      'Random Scatter';
    const localizedStartMultiplier =
      localizationManager.getTextByKey(POPUP_BUYFEAT_START_MULTIPLIER) ??
      LOCALIZATION_DEFAULTS[POPUP_BUYFEAT_START_MULTIPLIER] ??
      'Start Multipliers';
    const description =
      item.decriptionOverride ||
      `${localizedRandomScatter} (${item.scatterCount}), ${localizedStartMultiplier}: ${item.startMultiplier}x`;
    const descText = scene.add
      .text(textLeft, textTop + 56, description, {
        fontSize: "12px",
        fontFamily: "Poppins-Regular",
        color: "#cccccc",
      })
      .setOrigin(0, 0);
    cardContainer.add(descText);

    return cardContainer;
  }

  private updateCardPrices(): void {
    if (!this.buyFeatureTypeCardsWrapper) return;
    const list = this.buyFeatureTypeCardsWrapper
      .list as Phaser.GameObjects.Container[];
    for (let i = 0; i < list.length; i++) {
      const card = list[i];
      const item = BuyFeature.CARD_ITEMS[i];
      const price =
        item?.startMultiplier === 2
          ? this.getCurrentBetValue() * 5
          : this.getCurrentBetValue();
      const priceText = card.getData("priceText") as
        | Phaser.GameObjects.Text
        | undefined;
      const amountText = card.getData("amountText") as
        | Phaser.GameObjects.Text
        | undefined;
      if (amountText) amountText.setText(this.formatNumberWithCommas(price));
      // Reposition amount after price label in case font metrics differ
      if (priceText && amountText)
        amountText.setX(priceText.x + priceText.width);
    }
  }

  private updateBuyFeatureScrollMax(): void {
    const h = BuyFeature.BUY_FEATURE_TYPE_HEIGHT;
    const topY = -h / 2 + BuyFeature.CARD_PADDING;
    const contentHeight =
      (BuyFeature.CARD_ITEMS.length - 1) *
        (BuyFeature.CARD_HEIGHT + BuyFeature.CARD_GAP) +
      BuyFeature.CARD_HEIGHT;
    const contentBottom = topY + contentHeight;
    const viewportBottom = h / 2;
    this.buyFeatureScrollMax = Math.max(0, contentBottom - viewportBottom);
    this.buyFeatureScrollOffset = Math.max(
      0,
      Math.min(this.buyFeatureScrollMax, this.buyFeatureScrollOffset),
    );
    this.buyFeatureScrollDisplay = this.buyFeatureScrollOffset;
    this.buyFeatureScrollPrevOffset = this.buyFeatureScrollOffset;
    this.buyFeatureScrollVelocity = 0;
  }

  private applyBuyFeatureScroll(): void {
    // No clamp here: allow overscroll for elastic; inertia/elastic handled in updateBuyFeatureScroll
  }

  private updateBuyFeatureScroll(): void {
    if (!this.buyFeatureTypeCardsWrapper || !this.container.visible) return;
    const max = this.buyFeatureScrollMax;
    const over = BuyFeature.BUY_FEATURE_SCROLL_MAX_OVERSCROLL;

    if (this.buyFeatureDragActive) {
      this.buyFeatureScrollVelocity =
        this.buyFeatureScrollOffset - this.buyFeatureScrollPrevOffset;
      this.buyFeatureScrollPrevOffset = this.buyFeatureScrollOffset;
    } else {
      this.buyFeatureScrollOffset += this.buyFeatureScrollVelocity;
      this.buyFeatureScrollVelocity *= BuyFeature.BUY_FEATURE_SCROLL_FRICTION;
      if (this.buyFeatureScrollOffset < 0) {
        this.buyFeatureScrollOffset +=
          (0 - this.buyFeatureScrollOffset) *
          BuyFeature.BUY_FEATURE_SCROLL_ELASTIC_RETURN;
        this.buyFeatureScrollVelocity *= 0.4;
      } else if (this.buyFeatureScrollOffset > max) {
        this.buyFeatureScrollOffset +=
          (max - this.buyFeatureScrollOffset) *
          BuyFeature.BUY_FEATURE_SCROLL_ELASTIC_RETURN;
        this.buyFeatureScrollVelocity *= 0.4;
      }
      this.buyFeatureScrollOffset = Math.max(
        -over,
        Math.min(max + over, this.buyFeatureScrollOffset),
      );
      if (
        this.buyFeatureScrollOffset >= 0 &&
        this.buyFeatureScrollOffset <= max &&
        Math.abs(this.buyFeatureScrollVelocity) < 0.4
      ) {
        this.buyFeatureScrollVelocity *= 0.85;
      }
      this.buyFeatureScrollPrevOffset = this.buyFeatureScrollOffset;
    }

    this.buyFeatureScrollDisplay +=
      (this.buyFeatureScrollOffset - this.buyFeatureScrollDisplay) *
      BuyFeature.BUY_FEATURE_SCROLL_SMOOTH;
    this.buyFeatureTypeCardsWrapper.setY(-this.buyFeatureScrollDisplay);
  }

  private cancelBuyFeaturePointerOutReleaseTimer(): void {
    if (this.buyFeaturePointerOutReleaseTimer) {
      this.buyFeaturePointerOutReleaseTimer.destroy();
      this.buyFeaturePointerOutReleaseTimer = null;
    }
  }

  private onBuyFeatureAreaPointerDown(
    ptr: Phaser.Input.Pointer,
    cardIndex: number,
  ): void {
    this.buyFeatureDragActive = true;
    this.buyFeaturePointerDownY = ptr.worldY;
    this.buyFeaturePointerDownCardIndex = cardIndex;
    this.buyFeatureDragStartY = ptr.worldY;
    this.buyFeatureScrollStartOffset = this.buyFeatureScrollOffset;
    this.buyFeatureScrollPrevOffset = this.buyFeatureScrollOffset;
  }

  private setupBuyFeatureScrollInput(scene: Scene, w: number, h: number): void {
    // Dedicated zone so drag is reliably detected (container hit area was unreliable)
    this.buyFeatureScrollZone = scene.add.zone(0, 0, w, h);
    this.buyFeatureScrollZone.setOrigin(0.5, 0.5);
    this.buyFeatureScrollZone.setInteractive({ useHandCursor: false });
    this.buyFeatureTypeContainer.add(this.buyFeatureScrollZone);

    this.buyFeatureScrollZone.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      this.onBuyFeatureAreaPointerDown(ptr, -1);
    });

    scene.input.on("pointerup", (ptr: Phaser.Input.Pointer) => {
      this.cancelBuyFeaturePointerOutReleaseTimer();
      const wasDrag = this.buyFeatureDragActive;
      this.buyFeatureDragActive = false;
      if (wasDrag && this.buyFeaturePointerDownCardIndex >= 0) {
        const dy = Math.abs(ptr.worldY - this.buyFeaturePointerDownY);
        if (dy < BuyFeature.BUY_FEATURE_TAP_THRESHOLD) {
          this.playClickSound();
          this.selectBuyFeatureCard(this.buyFeaturePointerDownCardIndex);
        }
      }
      this.buyFeaturePointerDownCardIndex = -1;
    });

    scene.input.on("pointerout", () => {
      if (!this.buyFeatureDragActive) return;
      this.cancelBuyFeaturePointerOutReleaseTimer();
      this.buyFeaturePointerOutReleaseTimer = scene.time.delayedCall(
        BuyFeature.BUY_FEATURE_POINTER_OUT_RELEASE_DELAY,
        () => {
          this.buyFeatureDragActive = false;
          this.buyFeaturePointerOutReleaseTimer = null;
        },
      );
    });

    scene.input.on("pointerover", () => {
      this.cancelBuyFeaturePointerOutReleaseTimer();
    });

    scene.input.on("pointermove", (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown || !this.buyFeatureDragActive) return;
      this.cancelBuyFeaturePointerOutReleaseTimer();
      const deltaY = this.buyFeatureDragStartY - ptr.worldY;
      this.buyFeatureScrollOffset = this.buyFeatureScrollStartOffset + deltaY;
      this.buyFeatureDragStartY = ptr.worldY;
      this.buyFeatureScrollStartOffset = this.buyFeatureScrollOffset;
      this.applyBuyFeatureScroll();
    });

    scene.input.on(
      "wheel",
      (_ptr: Phaser.Input.Pointer, _go: any[], _dx: number, dy: number) => {
        if (!this.buyFeatureScrollZone) return;
        const bounds = this.buyFeatureScrollZone.getBounds();
        if (!bounds.contains(scene.input.x, scene.input.y)) return;
        this.buyFeatureScrollOffset += dy;
        this.applyBuyFeatureScroll();
      },
    );

    scene.events.on("update", this.updateBuyFeatureScroll, this);
    scene.events.on("update", this.updateSelectedCardBorderAnimation, this);
  }

  private createBuyButton(scene: Scene): void {
    const screenWidth = scene.cameras.main.width;
    const screenHeight = scene.cameras.main.height;
    const backgroundTop = screenHeight - 736;
    const x = screenWidth / 2;
    const y = backgroundTop + 670;

    // Use long_button image to match other confirm buttons
    const buttonImage = scene.add.image(x, y, "long_button");
    buttonImage.setOrigin(0.5, 0.5);
    buttonImage.setDisplaySize(364, 62);
    this.container.add(buttonImage);

    // Button label
    this.confirmButton = scene.add.text(x, y, "BUY FEATURE", {
      fontSize: "24px",
      fontFamily: "Poppins-Bold",
      color: "#000000",
    });
    this.confirmButton.setOrigin(0.5);
    this.container.add(this.confirmButton);

    buttonImage.setInteractive();
    buttonImage.on("pointerdown", () => {
      this.playClickSound();
      this.confirmPurchase();
    });
  }

  private playClickSound(): void {
    let playedClick = false;
    try {
      const sceneSound = this.container?.scene?.sound;
      if (sceneSound) {
        sceneSound.play("click");
        playedClick = true;
      }
    } catch {}

    if (!playedClick) {
      const audioManager =
        (this.container?.scene as any)?.audioManager ||
        (window as any)?.audioManager;
      if (audioManager && typeof audioManager.playSoundEffect === "function") {
        audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
      }
    }
  }

  private createCloseButton(scene: Scene): void {
    const screenWidth = scene.cameras.main.width;
    const screenHeight = scene.cameras.main.height;
    const backgroundTop = screenHeight - 736;

    this.closeButton = scene.add.text(
      screenWidth / 2 + 180,
      backgroundTop + 40,
      "×",
      {
        fontSize: "30px",
        fontFamily: "Poppins-Regular",
        color: "#ffffff",
      },
    );
    this.closeButton.setOrigin(0.5);
    this.closeButton.setInteractive();
    this.closeButton.on("pointerdown", () => {
      this.playClickSound();
      this.close();
    });
    this.container.add(this.closeButton);
  }

  private confirmPurchase(): void {

    if (this.onConfirmCallback) {
      this.onConfirmCallback();
    }

    this.close();
  }

  private updatePriceDisplay(): void {
    if (this.priceDisplay) {
      const calculatedPrice = this.getCurrentBetValue();
      const currencyPrefix = CurrencyManager.getInlinePrefix();
      this.priceDisplay.setText(
        `${currencyPrefix}${this.formatNumberWithCommas(calculatedPrice)}`,
      );
    }
    this.updateCardPrices();
  }

  private formatNumberWithCommas(num: number): string {
    return formatCurrencyNumber(num);
  }

  private animateIn(): void {
    if (!this.container || !this.container.scene) {
      return;
    }

    // Start positioned below the screen for slide-up effect
    this.container.setY(this.container.scene.scale.height);
    this.container.setVisible(true);

    // Create slide-up animation
    this.container.scene.tweens.add({
      targets: this.container,
      y: 0,
      duration: 300,
      ease: "Power2.easeOut",
      onComplete: () => {
      },
    });
  }

  private animateOut(): void {
    if (!this.container || !this.container.scene) {
      return;
    }

    // Create slide-down animation
    this.container.scene.tweens.add({
      targets: this.container,
      y: this.container.scene.scale.height,
      duration: 250,
      ease: "Power2.easeIn",
      onComplete: () => {
        this.container.setVisible(false);
      },
    });
  }

  private createBetInput(scene: Scene): void {
    const screenWidth = scene.cameras.main.width;
    const screenHeight = scene.cameras.main.height;
    const backgroundTop = screenHeight - 736;
    const x = screenWidth * 0.5;
    const y = backgroundTop + 580;

    // // "Bet" label
    // const betLabel = scene.add.text(x - 182, y - 70, 'Bet', {
    // 	fontSize: '24px',
    // 	color: '#ffffff',
    // 	fontFamily: 'Poppins-Regular'
    // });
    // betLabel.setOrigin(0, 0.5);
    // this.container.add(betLabel);

    // Bet input background
    const inputBg = scene.add.graphics();
    inputBg.fillStyle(0x000000, 0.4);
    inputBg.fillRoundedRect(-182, -37, 364, 74, 15);
    inputBg.lineStyle(0.5, 0xffffff, 1);
    inputBg.strokeRoundedRect(-182, -37, 364, 74, 15);
    inputBg.setPosition(x, y);
    this.container.add(inputBg);

    // Minus button
    this.minusButton = scene.add.text(x - 150, y, "-", {
      fontSize: "30px",
      color: "#ffffff",
      fontFamily: "Poppins-Regular",
    });
    this.minusButton.setOrigin(0.5, 0.5);
    this.minusButton.setInteractive();

    // Handle pointer down for continuous press
    this.minusButton.on("pointerdown", () => {
      this.playClickSound();
      // Defensive: ensure opposite repeat loop cannot fight this input.
      this.stopContinuousIncrement();
      this.selectPreviousBet();
      this.startContinuousDecrement(scene);
    });

    // Handle pointer up to stop continuous press
    this.minusButton.on("pointerup", () => {
      this.stopContinuousDecrement();
    });

    // Handle pointer out to stop continuous press
    this.minusButton.on("pointerout", () => {
      this.stopContinuousDecrement();
    });

    this.container.add(this.minusButton);

    // Bet display - show current bet value (5x when buy feature 2 selected)
    const currencyPrefix = CurrencyManager.getInlinePrefix();
    this.betDisplay = scene.add.text(
      x,
      y,
      `${currencyPrefix}${formatCurrencyNumber(this.getDisplayBetAmount())}`,
      {
        fontSize: "24px",
        color: "#ffffff",
        fontFamily: "Poppins-Regular",
      },
    );
    this.betDisplay.setOrigin(0.5, 0.5);
    this.container.add(this.betDisplay);

    // Plus button
    this.plusButton = scene.add.text(x + 150, y, "+", {
      fontSize: "30px",
      color: "#ffffff",
      fontFamily: "Poppins-Regular",
    });
    this.plusButton.setOrigin(0.5, 0.5);
    this.plusButton.setInteractive();

    // Handle pointer down for continuous press
    this.plusButton.on("pointerdown", () => {
      this.playClickSound();
      // Defensive: ensure opposite repeat loop cannot fight this input.
      this.stopContinuousDecrement();
      this.selectNextBet();
      this.startContinuousIncrement(scene);
    });

    // Handle pointer up to stop continuous press
    this.plusButton.on("pointerup", () => {
      this.stopContinuousIncrement();
    });

    // Handle pointer out to stop continuous press
    this.plusButton.on("pointerout", () => {
      this.stopContinuousIncrement();
    });

    this.container.add(this.plusButton);
  }

  private selectPreviousBet(): void {
    if (this.currentBetIndex > 0) {
      this.currentBetIndex--;
      this.currentBet = this.betOptions[this.currentBetIndex];
      this.updateBetDisplay();
      this.updatePriceDisplay();
      this.updateBetLimitButtons();
    } else {
      // Keep button lock/timer state correct when already at min.
      this.updateBetLimitButtons();
    }
  }

  private selectNextBet(): void {
    if (this.currentBetIndex < this.betOptions.length - 1) {
      this.currentBetIndex++;
      this.currentBet = this.betOptions[this.currentBetIndex];
      this.updateBetDisplay();
      this.updatePriceDisplay();
      this.updateBetLimitButtons();
    } else {
      // Keep button lock/timer state correct when already at max.
      this.updateBetLimitButtons();
    }
  }

  /**
   * Update - / + button states: disable - at minimum bet, disable + at maximum bet.
   */
  private updateBetLimitButtons(): void {
    const isAtMin = this.currentBetIndex <= 0;
    const isAtMax = this.currentBetIndex >= this.betOptions.length - 1;

    if (this.minusButton) {
      if (isAtMin) {
        this.stopContinuousDecrement();
        this.minusButton.setAlpha(0.5);
        this.minusButton.setTint(0x555555);
        this.minusButton.disableInteractive();
      } else {
        this.minusButton.setAlpha(1);
        this.minusButton.clearTint();
        this.minusButton.setInteractive();
      }
    }

    if (this.plusButton) {
      if (isAtMax) {
        this.stopContinuousIncrement();
        this.plusButton.setAlpha(0.5);
        this.plusButton.setTint(0x555555);
        this.plusButton.disableInteractive();
      } else {
        this.plusButton.setAlpha(1);
        this.plusButton.clearTint();
        this.plusButton.setInteractive();
      }
    }
  }

  /**
   * Start continuous decrement after initial delay
   */
  private startContinuousDecrement(scene: Scene): void {
    // Clear any existing timer
    this.stopContinuousDecrement();

    // Start timer after initial delay
    this.minusButtonTimer = scene.time.delayedCall(
      this.CONTINUOUS_DELAY,
      () => {
        // Start continuous decrement
        this.minusButtonTimer = scene.time.addEvent({
          delay: this.CONTINUOUS_INTERVAL,
          callback: () => {
            this.selectPreviousBet();
          },
          loop: true,
        });
      },
    );
  }

  /**
   * Stop continuous decrement
   */
  private stopContinuousDecrement(): void {
    if (this.minusButtonTimer) {
      this.minusButtonTimer.destroy();
      this.minusButtonTimer = null;
    }
  }

  /**
   * Start continuous increment after initial delay
   */
  private startContinuousIncrement(scene: Scene): void {
    // Clear any existing timer
    this.stopContinuousIncrement();

    // Start timer after initial delay
    this.plusButtonTimer = scene.time.delayedCall(this.CONTINUOUS_DELAY, () => {
      // Start continuous increment
      this.plusButtonTimer = scene.time.addEvent({
        delay: this.CONTINUOUS_INTERVAL,
        callback: () => {
          this.selectNextBet();
        },
        loop: true,
      });
    });
  }

  /**
   * Stop continuous increment
   */
  private stopContinuousIncrement(): void {
    if (this.plusButtonTimer) {
      this.plusButtonTimer.destroy();
      this.plusButtonTimer = null;
    }
  }

  private updateBetDisplay(): void {
    if (this.betDisplay) {
      const currencyPrefix = CurrencyManager.getInlinePrefix();
      this.betDisplay.setText(
        `${currencyPrefix}${formatCurrencyNumber(this.getDisplayBetAmount())}`,
      );
    }
  }

  public show(config?: BuyFeatureConfig): void {

    if (config) {
      if (config.featurePrice !== undefined) {
        this.featurePrice = config.featurePrice;
      }
      if (config.onClose) {
        this.onCloseCallback = config.onClose;
      }
      if (config.onConfirm) {
        this.onConfirmCallback = config.onConfirm;
      }
    }

    // Initialize/sync buy feature bet from the latest external base bet so that
    // Bet Options / Autoplay changes are reflected in the popup while still
    // preserving the last buy-feature bet until an external change occurs.
    const latestBaseBet = this.slotController?.getBaseBetAmount?.();
    if (
      Number.isFinite(latestBaseBet) &&
      latestBaseBet! > 0 &&
      (this.lastExternalBaseBet === null ||
        Math.abs(latestBaseBet! - this.lastExternalBaseBet) > 0.0001)
    ) {
      this.resetBetFromExternal(latestBaseBet!);
    } else {
      this.initializeBetIndex();
    }

    // If no card has been selected yet this session, default to the first card.
    // Otherwise, keep the last selected card as the active choice.
    if (
      this.buyFeatureSelectedCardIndex < 0 ||
      this.buyFeatureSelectedCardIndex >= BuyFeature.CARD_ITEMS.length
    ) {
      this.selectBuyFeatureCard(0);
    } else {
      this.selectBuyFeatureCard(this.buyFeatureSelectedCardIndex);
    }

    this.updatePriceDisplay();
    this.updateBetDisplay();
    this.updateBetLimitButtons();
    this.animateIn();

    // Show the mask when the panel is shown (same as BetOptions)
    if (this.confirmButtonMask) {
      this.confirmButtonMask.setVisible(true);
      this.confirmButtonMask.setAlpha(1);
    }
  }

  public hide(): void {

    // Stop any continuous button presses
    this.stopContinuousDecrement();
    this.stopContinuousIncrement();

    this.animateOut();

    // Hide the mask when the panel is hidden (same as BetOptions)
    if (this.confirmButtonMask) {
      this.confirmButtonMask.setVisible(false);
      this.confirmButtonMask.setAlpha(0);
    }
  }

  public close(): void {
    this.hide();

    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  public destroy(): void {
    // Stop any continuous button presses
    this.stopContinuousDecrement();
    this.stopContinuousIncrement();

    if (this.container?.scene) {
      this.container.scene.events.off(
        "update",
        this.updateBuyFeatureScroll,
        this,
      );
      this.container.scene.events.off(
        "update",
        this.updateSelectedCardBorderAnimation,
        this,
      );
    }
    this.cancelBuyFeaturePointerOutReleaseTimer();

    if (this.scatterSpine) {
      try {
        this.scatterSpine.destroy();
      } catch {}
      this.scatterSpine = undefined;
    }

    if (this.scatterFallbackSprite) {
      try {
        this.scatterFallbackSprite.destroy();
      } catch {}
      this.scatterFallbackSprite = undefined;
    }

    if (this.container) {
      this.container.destroy();
    }
  }
}

