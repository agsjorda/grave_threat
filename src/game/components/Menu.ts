import { Scene, GameObjects } from "phaser";
import { Geom } from "phaser";
import { GameData } from "../components/GameData";
import { AudioManager, SoundEffectType } from "../../managers/AudioManager";
import { GameAPI } from "../../backend/GameAPI";
import { HelpScreen } from "./MenuTabs/HelpScreen";
import { CurrencyManager } from "./CurrencyManager";
import { formatCurrencyNumber } from "../../utils/NumberPrecisionFormatter";
import { localizationManager } from "../../managers/LocalizationManager";
import * as LK from "../../backend/LocalizationData";

interface ButtonBase {
  isButton: boolean;
}

type ButtonContainer = GameObjects.Container & ButtonBase;
type ButtonImage = GameObjects.Image & ButtonBase;
type ButtonText = GameObjects.Text & ButtonBase;

interface TabConfig {
  text: string;
  width: number;
  x: number;
  icon: string;
}

interface GameScene extends Scene {
  gameData: GameData;
  audioManager: AudioManager;
  gameAPI: GameAPI;
  getCurrentBetAmount?: () => number;
  /** Base bet for payout table (excludes amplify - payouts should not change when amplify is on) */
  getBaseBetAmount?: () => number;
}

export class Menu {
  private getMenuText(key: string): string {
    return localizationManager.getTextByKey(key) ?? LK.LOCALIZATION_DEFAULTS[key] ?? key;
  }

  private formatHistoryPageText(page: number, totalPages: number): string {
    return this.getMenuText(LK.MENU_HISTORY_PAGE)
      .replace("{page}", String(page))
      .replace("{total}", String(totalPages));
  }

  private menuContainer?: ButtonContainer;
  private contentArea: GameObjects.Container;
  private isMobile: boolean = true;
  private width: number = 0;
  private height: number = 0;
  private menuEventHandlers: Function[] = [];
  private isDraggingMusic: boolean = false;
  private isDraggingSFX: boolean = false;
  private scene: GameScene;
  public settingsOnly: boolean = false;

  // Top padding for the whole menu panel so the in‑game clock remains visible
  private menuTopPadding: number = 20;
  private contentWidth = 1200;
  private isVisible: boolean = false;
  private panel: GameObjects.Container;

  // Tab content containers for proper tab switching
  private rulesContent: GameObjects.Container;
  private historyContent: GameObjects.Container;
  private settingsContent: GameObjects.Container;
  private activeTabIndex: number = 0;

  // Help screen
  private helpScreen?: HelpScreen;

    // History pagination / refresh state
    private historyCurrentPage: number = 1;
    private historyTotalPages: number = 1;
    private historyPageLimit: number = 11;
    private historyIsLoading: boolean = false;
    private historyRefreshQueued: boolean = false;
    private historyLiveRefreshTimer: number | null = null;
    private historyHeaderContainer?: GameObjects.Container;
    private historyRowsContainer?: GameObjects.Container;
    private historyPaginationContainer?: GameObjects.Container;
    /** Signature of the current top row; used so we only tween when a new spin reaches history. */
    private lastHistoryTopRowSignature: string | null = null;
    /** Cache recent history responses by page+limit to avoid redundant API requests on tab reopen. */
  private historyCache: Map<string, { data: any; fetchedAt: number }> = new Map();
  /** Cache TTL for history data (ms). */
  private historyCacheTtlMs: number = 10000;
  /** Marks history as stale after spins/bonus completion so next refresh fetches from API. */
  private historyDirty: boolean = true;
  private readonly tabIconTargetHeight: number = 18;
  private readonly tabTextGapFromIcon: number = 8;
  private readonly tabTextDesiredFontSize: number = 16;
  private readonly tabTextMinFontSize: number = 1;
  private readonly tabDesiredPadding: number = 20;
  private readonly tabMinPadding: number = 12;

  private fitTextToWidth(
    text: GameObjects.Text,
    maxWidth: number,
    desiredFontSize: number,
    minFontSize: number = 1,
  ): void {
    const targetWidth = Math.max(0, maxWidth);
    const maxSize = Math.max(1, Math.floor(desiredFontSize));
    const minSize = Math.max(1, Math.floor(minFontSize));
    let currentSize = Math.max(minSize, maxSize);

    text.setFontSize(currentSize);
    while (text.width > targetWidth && currentSize > minSize) {
      currentSize -= 1;
      text.setFontSize(currentSize);
    }
  }

  private getTabIconKey(icon: string): string {
    const tabIconMap: Record<string, string> = {
      info: "menu_info",
      history: "menu_history",
      settings: "menu_settings",
      close: "menu_close",
    };
    return tabIconMap[icon] ?? "";
  }

  private createTabIcon(
    scene: GameScene,
    tabContainer: ButtonContainer,
    tabConfig: TabConfig,
    tabHeight: number,
  ): ButtonImage | undefined {
    const iconKey = this.getTabIconKey(tabConfig.icon);
    if (!iconKey) {
      return undefined;
    }

    const icon = scene.add.image(0, tabHeight / 2, iconKey) as ButtonImage;
    icon.setOrigin(0, 0.5);
    const scale = this.tabIconTargetHeight / icon.height;
    icon.setScale(scale);

    if (tabConfig.icon === "close") {
      icon.setOrigin(0.5, 0.5);
      icon.setPosition(tabConfig.width / 2, tabHeight / 2);
      icon.clearTint();
    } else {
      icon.setPosition(this.tabMinPadding, tabHeight / 2);
      icon.setTint(0x379557);
    }

    tabContainer.add(icon);
    return icon;
  }

  private createAndLayoutTabLabel(
    scene: GameScene,
    tabContainer: ButtonContainer,
    tabConfig: TabConfig,
    tabIcon: ButtonImage | undefined,
    tabHeight: number,
    isNormalTab: boolean,
  ): void {
    const initialTextAreaLeft = isNormalTab
      ? (tabIcon ? tabIcon.x + tabIcon.displayWidth + this.tabTextGapFromIcon : this.tabDesiredPadding)
      : tabConfig.width / 2;
    const initialTextAreaWidth = isNormalTab
      ? Math.max(0, tabConfig.width - initialTextAreaLeft - this.tabDesiredPadding)
      : tabConfig.width;
    const textCenterX = isNormalTab
      ? initialTextAreaLeft + initialTextAreaWidth / 2
      : tabConfig.width / 2;

    const text = scene.add.text(textCenterX, tabHeight / 2, tabConfig.text, {
      fontSize: `${this.tabTextDesiredFontSize}px`,
      color: "#FFFFFF",
      fontFamily: "Poppins-Regular",
      align: "center",
    }) as ButtonText;

    if (tabConfig.icon === "close") {
      text.setVisible(false);
    }
    text.setOrigin(0.5, 0.5);

    if (tabConfig.icon !== "close") {
      text.setFontSize(this.tabTextDesiredFontSize);
      let resolvedPadding = this.tabDesiredPadding;
      let resolvedTextAreaLeft = initialTextAreaLeft;
      let resolvedTextAreaWidth = initialTextAreaWidth;

      for (let currentPadding = this.tabDesiredPadding; currentPadding >= this.tabMinPadding; currentPadding--) {
        if (tabIcon) {
          tabIcon.setPosition(currentPadding, tabHeight / 2);
          resolvedTextAreaLeft = tabIcon.x + tabIcon.displayWidth + this.tabTextGapFromIcon;
        } else {
          resolvedTextAreaLeft = currentPadding;
        }

        const maxTextWidthAtPadding = Math.max(0, tabConfig.width - resolvedTextAreaLeft - currentPadding);
        resolvedPadding = currentPadding;
        resolvedTextAreaWidth = maxTextWidthAtPadding;
        text.setPosition(resolvedTextAreaLeft + maxTextWidthAtPadding / 2, tabHeight / 2);
        if (text.width <= maxTextWidthAtPadding) {
          break;
        }
      }

      const maxTextWidth = Math.max(0, tabConfig.width - resolvedTextAreaLeft - resolvedPadding);
      this.fitTextToWidth(text, maxTextWidth, this.tabTextDesiredFontSize, this.tabTextMinFontSize);
      text.setPosition(resolvedTextAreaLeft + resolvedTextAreaWidth / 2, tabHeight / 2);
    }

    tabContainer.add(text);
  }

  protected titleStyle = {
    fontSize: "24px",
    color: "#379557",
    fontFamily: "Poppins-Regular",
    fontStyle: "bold",
  };

  protected header1Style = {
    fontSize: "24px",
    color: "#379557",
    fontFamily: "Poppins-Bold",
    fontStyle: "bold",
  };

  protected content1Style = {
    fontSize: "20px",
    color: "#FFFFFF",
    fontFamily: "Poppins-Regular",
    align: "left" as const,
  };

  protected contentHeader1Style = {
    fontSize: "24px",
    color: "#FFFFFF",
    fontFamily: "Poppins-Bold",
    align: "left" as const,
  };

  protected header2Style = {
    fontSize: "24px",
    color: "#379557",
    fontFamily: "Poppins-Regular",
    fontStyle: "bold",
  };

  protected textStyle = {
    fontSize: "20px",
    color: "#FFFFFF",
    fontFamily: "Poppins-Regular",
    align: "left",
    wordWrap: { width: this.contentWidth },
  };

  constructor(settingsOnly: boolean = false) {
    this.settingsOnly = settingsOnly;
  }

  preload(scene: Scene) {
    // No-op: menu assets are loaded via AssetLoader in Preloader
  }

  public createMenu(scene: GameScene): ButtonContainer {
    this.scene = scene; // Store scene reference
    this.width = scene.scale.width;
    this.height = scene.scale.height;

    // Create main menu container
    const menuContainer = scene.add.container(0, 0) as ButtonContainer;
    menuContainer.setDepth(9501); // Above header (9500) and backgrounds (850/9000); below dialogs (12000)
    menuContainer.setVisible(false);
    menuContainer.setAlpha(0);

    // Create background overlay
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.8);
    bg.fillRect(0, 0, this.width, this.height);
    // Make overlay interactive to block pointer events from reaching the game underneath
    bg.setInteractive(
      new Geom.Rectangle(0, 0, this.width, this.height),
      Geom.Rectangle.Contains,
    );
    bg.on("pointerdown", () => {});
    bg.on("pointerup", () => {});
    menuContainer.add(bg);

    // Create menu panel - full screen background; top padding only affects tabs/content
    const panelWidth = this.width;
    const panelHeight = this.height;
    const panelX = 0;
    const panelY = 0;

    this.panel = scene.add.container(panelX, panelY) as ButtonContainer;
    menuContainer.add(this.panel);

    // Panel background - no border
    const panelBg = scene.add.graphics();
    panelBg.fillStyle(0x181818, 0.95);
    panelBg.fillRect(0, 0, panelWidth, panelHeight);
    // Make panel capture input too
    panelBg.setInteractive(
      new Geom.Rectangle(0, 0, panelWidth, panelHeight),
      Geom.Rectangle.Contains,
    );
    panelBg.on("pointerdown", () => {});
    panelBg.on("pointerup", () => {});
    this.panel.add(panelBg);

    // Create tabs with different widths
    const tabHeight = 61;
    const smallTabScale = 0.5; // X tab will be half the width of normal tabs

    // Determine which tabs to show
    const baseIcons: string[] = this.settingsOnly
      ? ["settings"]
      : ["info", "history", "settings"];

    const getLabel = (icon: string) => {
      switch (icon) {
        case "info":
          return this.getMenuText(LK.MENU_RULES);
        case "history":
          return this.getMenuText(LK.MENU_HISTORY);
        case "settings":
          return this.getMenuText(LK.COMMON_SETTINGS);
        case "close":
          return "X";
        default:
          return "";
      }
    };

    const normalTabCount = baseIcons.length;
    const totalTabUnits = normalTabCount + smallTabScale;
    const normalTabWidth = panelWidth / totalTabUnits;
    // Calculate close width to cover any rounding remainder to the panel edge
    const closeWidth = panelWidth - normalTabWidth * normalTabCount;

    // Original spacing: no inter-tab gaps; close tab is smaller on the right
    const tabConfigs: TabConfig[] = [
      ...baseIcons.map((icon, i) => ({
        text: getLabel(icon),
        width: normalTabWidth,
        x: normalTabWidth * i,
        icon,
      })),
      {
        text: getLabel("close"),
        width: closeWidth,
        x: normalTabWidth * normalTabCount,
        icon: "close",
      },
    ];

    const tabContainers: ButtonContainer[] = [];

    tabConfigs.forEach((tabConfig, index) => {
      // Position tabs lower on screen to leave room for the clock at the top
      const tabContainer = scene.add.container(
        tabConfig.x,
        this.menuTopPadding,
      ) as ButtonContainer;

      // Tab background
      const tabBg = scene.add.graphics();
      const isClose = tabConfig.icon === "close";

      tabBg.fillStyle(isClose ? 0x1f1f1f : 0x000000, 1); // Close has dark gray bg
      tabBg.fillRect(0, 0, tabConfig.width, tabHeight);
      tabContainer.add(tabBg);

      // Active tab indicator (green underline) - only for first tab initially
      const activeIndicator = scene.add.graphics();
      activeIndicator.fillStyle(0x00ff00, 1); // Bright green
      activeIndicator.fillRect(0, tabHeight - 3, tabConfig.width, 3);
      activeIndicator.setVisible(index === 0);
      tabContainer.add(activeIndicator);

      const tabIcon = this.createTabIcon(scene, tabContainer, tabConfig, tabHeight);
      this.createAndLayoutTabLabel(scene, tabContainer, tabConfig, tabIcon, tabHeight, index < normalTabCount);

      // Make tab interactive
      tabContainer.setInteractive(
        new Geom.Rectangle(0, 0, tabConfig.width, tabHeight),
        Geom.Rectangle.Contains,
      ).isButton = true;

      // Tab click handler - disable history tab in demo mode
      const isDemo = scene.gameAPI?.getDemoState();
      const isHistoryTab = tabConfig.icon === "history";
      if (isHistoryTab && isDemo) {
        // Disable interaction for history tab in demo mode
        tabContainer.disableInteractive();
        // Make it visually appear disabled (reduce opacity)
        tabContainer.setAlpha(0.5);
      } else {
        tabContainer.on("pointerup", () => {
          scene.audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
          this.switchTab(scene, tabContainers, index, tabConfigs);
        });
      }

      tabContainers.push(tabContainer);
      this.panel.add(tabContainer);
    });

    // Set initial active tab highlight
    this.switchTab(scene, tabContainers, 0, tabConfigs);

    // Create content area with mask to prevent overlap with tabs
    // Position is offset by menuTopPadding so tab content sits below the clock area
    const contentArea = scene.add.container(
      20,
      this.menuTopPadding + tabHeight + 20,
    );
    contentArea.setSize(
      panelWidth - 40,
      panelHeight - this.menuTopPadding - tabHeight - 40,
    );

    // Create mask for content area to prevent overlap with tabs
    const contentMask = scene.add.graphics();
    contentMask.fillStyle(0xffffff);
    // Mask starts just under the tabs, including the top menu padding
    const maskTop = this.menuTopPadding + (tabHeight - 1);
    const maskHeight = panelHeight - maskTop;
    contentMask.fillRect(0, maskTop, panelWidth, maskHeight);
    const geometryMask = contentMask.createGeometryMask();
    contentArea.setMask(geometryMask);
    contentMask.setVisible(false); // Hide the mask graphics

    this.panel.add(contentArea);

    // Store content area reference
    this.contentArea = contentArea;

    // Initialize tab content containers
    this.initializeTabContentContainers(scene);

    // Show initial content based on first tab
    this.showTabContent(scene, tabConfigs[0].icon);

    // Store menu container reference
    this.menuContainer = menuContainer;

    return menuContainer;
  }

  private initializeTabContentContainers(scene: GameScene): void {
    // Create separate containers for each tab's content
    this.rulesContent = scene.add.container(0, 0);
    this.historyContent = scene.add.container(0, 0);
    this.settingsContent = scene.add.container(0, 0);

    // Add all containers to the content area
    this.contentArea.add(this.rulesContent);
    this.contentArea.add(this.historyContent);
    this.contentArea.add(this.settingsContent);

    // Initialize content for each tab
    // Help / Rules content is delegated to HelpScreen - use base bet for payouts so they don't change when amplify is on
    const resolveBetAmount =
      scene.getBaseBetAmount?.bind(scene) ??
      scene.getCurrentBetAmount?.bind(scene) ??
      (() => 1);
    this.helpScreen = new HelpScreen(
      scene,
      this.contentArea,
      this.rulesContent,
      {
        titleStyle: this.titleStyle,
        header1Style: this.header1Style,
        header2Style: this.header2Style,
        content1Style: this.content1Style,
        contentHeader1Style: this.contentHeader1Style,
        textStyle: this.textStyle,
      },
      () => this.isVisible,
      resolveBetAmount,
    );
    this.helpScreen.build();
    this.historyCurrentPage = 1;
    this.historyPageLimit = 11;
    // Initial history fetch; subsequent updates handled by live refresh while tab is open
    void this.showHistoryContent(
      scene,
      this.historyCurrentPage,
      this.historyPageLimit,
    );
    this.createVolumeSettingsContent(scene, this.settingsContent);

    // Initially hide all except rules
    this.hideAllTabContent();
    this.rulesContent.setVisible(true);
  }

  private hideAllTabContent(): void {
    this.rulesContent.setVisible(false);
    this.historyContent.setVisible(false);
    this.settingsContent.setVisible(false);
  }

  private switchTab(
    scene: GameScene,
    tabContainers: ButtonContainer[],
    activeIndex: number,
    tabConfigs: any[],
  ): void {
    // Check if demo mode is active and prevent switching to history tab
    const isDemo = scene.gameAPI?.getDemoState();
    const tabKey: string = tabConfigs[activeIndex].icon;

    if (isDemo && tabKey === "history") {
      // Don't switch to history tab in demo mode - stay on current tab or switch to first available tab
      const firstNonHistoryIndex = tabConfigs.findIndex(
        (config, idx) => config.icon !== "history" && config.icon !== "close",
      );
      if (firstNonHistoryIndex !== -1) {
        activeIndex = firstNonHistoryIndex;
      }
    }

    // Update tab highlighting
    tabContainers.forEach((tabContainer, index) => {
      const tabBg = tabContainer.getAt(0) as GameObjects.Graphics;
      const activeIndicator = tabContainer.getAt(1) as GameObjects.Graphics;
      const tabConfig = tabConfigs[index];

      if (index === activeIndex) {
        // Active tab: dark green background with bright green underline
        tabBg.fillStyle(0x2d5a3d, 1); // Dark green background
        tabBg.fillRect(0, 0, tabConfig.width, 61);
        activeIndicator.setVisible(true);
      } else {
        // Inactive tab: black background, no underline
        tabBg.fillStyle(tabConfig.icon === "close" ? 0x1f1f1f : 0x000000);
        tabBg.fillRect(0, 0, tabConfig.width, 61);
        activeIndicator.setVisible(false);
      }
    });

    // Show content for active tab
    const finalTabKey: string = tabConfigs[activeIndex].icon;
    this.showTabContent(scene, finalTabKey);
  }

  private showTabContent(scene: GameScene, tabKey: string): void {
    if (!this.contentArea) return;

    this.hideAllTabContent();

    switch (tabKey) {
      case "info":
        this.stopHistoryLiveRefresh();
        this.rulesContent.setVisible(true);
        break;
      case "history":
        this.historyContent.setVisible(true);
        // Single immediate refresh when switching to History tab;
        // subsequent updates are triggered on spin completion.
        this.requestHistoryRefresh(scene, "tab-switch");
        break;
      case "settings":
        this.stopHistoryLiveRefresh();
        this.settingsContent.setVisible(true);
        break;
      case "close":
        this.stopHistoryLiveRefresh();
        this.hideMenu(scene);
        break;
    }
  }

  // =========================================================================
  // HISTORY REFRESH HELPERS
  // =========================================================================

  /**
   * Public helper for Game scene to notify that game history may have changed.
   * Marks cache dirty and refreshes immediately only if menu + History tab are visible.
   */
  public refreshHistoryAfterSpin(scene: GameScene): void {
    this.historyDirty = true;
    // Use "live-timer" reason so refresh is silent (no loader)
    this.requestHistoryRefresh(scene, "live-timer");
  }

  private getHistoryCacheKey(page: number, limit: number): string {
    return `${page}:${limit}`;
  }

  private getCachedHistory(page: number, limit: number): any | null {
    const key = this.getHistoryCacheKey(page, limit);
    const entry = this.historyCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > this.historyCacheTtlMs) {
      this.historyCache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCachedHistory(page: number, limit: number, data: any): void {
    const key = this.getHistoryCacheKey(page, limit);
    this.historyCache.set(key, {
      data,
      fetchedAt: Date.now(),
    });
  }

  private requestHistoryRefresh(
    scene: GameScene,
    reason: "manual" | "tab-switch" | "live-timer" = "manual"
  ): void {
    const targetScene = scene;
    if (!this.isVisible) return;
    if (!this.historyContent?.visible) return;
    if (this.historyIsLoading) {
      this.historyRefreshQueued = true;
      return;
    }
    const page = this.historyCurrentPage || 1;
    const limit = this.historyPageLimit || 11;
    const silent = reason === "live-timer";
    void this.showHistoryContent(targetScene, page, limit, { silent });
  }

  private startHistoryLiveRefresh(scene: GameScene): void {
    this.stopHistoryLiveRefresh();
    // Keep history fresh while the History tab is visible.
    this.historyLiveRefreshTimer = window.setInterval(() => {
      if (!this.isVisible || !this.historyContent?.visible) return;
      this.requestHistoryRefresh(scene, "live-timer");
    }, 1200);
  }

  private stopHistoryLiveRefresh(): void {
    if (this.historyLiveRefreshTimer !== null) {
      window.clearInterval(this.historyLiveRefreshTimer);
      this.historyLiveRefreshTimer = null;
    }
  }

  private async showHistoryContent(
    scene: GameScene,
    page: number,
    limit: number,
    options?: { silent?: boolean },
  ): Promise<void> {
    const contentArea = this.historyContent;
    const historyHeaders: string[] = [
      this.getMenuText(LK.COMMON_SPIN),
      this.getMenuText(LK.MENU_HISTORY_CURRENCY),
      this.getMenuText(LK.COMMON_BET),
      this.getMenuText(LK.MENU_HISTORY_WIN),
    ];
    const isDemo = scene.gameAPI?.getDemoState();
    const silent = !!options?.silent;

    // Ensure containers exist and are parented correctly (mirrors beelze_bop behavior)
    if (!this.historyHeaderContainer || !this.historyHeaderContainer.scene) {
      this.historyHeaderContainer = scene.add.container(0, 0);
      const historyText = scene.add.text(
        15,
        15,
        this.getMenuText(LK.MENU_HISTORY),
        this.titleStyle,
      ) as ButtonText;
      historyText.setOrigin(0, 0);
      this.historyHeaderContainer.add(historyText);
    }
    if (!this.historyRowsContainer || !this.historyRowsContainer.scene) {
      this.historyRowsContainer = scene.add.container(0, 0);
    }
    if (
      !this.historyPaginationContainer ||
      !this.historyPaginationContainer.scene
    ) {
      this.historyPaginationContainer = scene.add.container(0, 0);
    }
    if ((this.historyRowsContainer as any).parentContainer !== contentArea) {
      contentArea.add(this.historyRowsContainer);
    }
    if (
      (this.historyPaginationContainer as any).parentContainer !== contentArea
    ) {
      contentArea.add(this.historyPaginationContainer);
    }
    if ((this.historyHeaderContainer as any).parentContainer !== contentArea) {
      contentArea.add(this.historyHeaderContainer);
    }

    // In demo mode, show empty history without making API call
    if (isDemo) {
      // Display headers centered per column (only once)
      const columnCenters = this.getHistoryColumnCenters(scene);
      const headerContainer = this
        .historyHeaderContainer as GameObjects.Container;
      if (headerContainer.length <= 1) {
        // only title exists
        const headerY = 60;
        historyHeaders.forEach((header, idx) => {
          const headerText = scene.add.text(
            columnCenters[idx],
            headerY,
            header,
            {
              fontSize: "14px",
              color: "#FFFFFF",
              fontFamily: "Poppins-Regular",
              fontStyle: "bold",
            },
          ) as ButtonText;
          headerText.setOrigin(0.5, 0);
          headerContainer.add(headerText);
        });
      }

      // Clear existing rows/pagination and show empty state message
      const rowsContainer = this.historyRowsContainer as GameObjects.Container;
      rowsContainer.removeAll(true);
      const paginationContainer = this
        .historyPaginationContainer as GameObjects.Container;
      paginationContainer.removeAll(true);

      const emptyMessage = scene.add.text(
        scene.scale.width / 2,
        scene.scale.height * 0.3,
        this.getMenuText(LK.MENU_DEMO_UNAVAILABLE),
        {
          fontSize: "16px",
          color: "#888888",
          fontFamily: "Poppins-Regular",
        },
      ) as ButtonText;
      emptyMessage.setOrigin(0.5, 0.5);
      rowsContainer.add(emptyMessage);

      // No pagination in demo mode
      return;
    }

    // Serve from cache when data isn't marked dirty.
    let result: any = null;
    const cachedResult = !this.historyDirty ? this.getCachedHistory(page, limit) : null;
    const usingCache = cachedResult != null;
    if (usingCache) {
      result = cachedResult;
    } else {
      // Prevent stacking requests
      if (this.historyIsLoading) {
        this.historyRefreshQueued = true;
        return;
      }
      this.historyIsLoading = true;

      // Show loading icon while fetching history (centered on screen) unless silent refresh
      let loader: ButtonImage | null = null;
      let spinTween: Phaser.Tweens.Tween | null = null;
      if (!silent) {
        const loaderX = scene.scale.width * 0.45;
        const loaderY = scene.scale.height * 0.3;
        loader = scene.add.image(loaderX, loaderY, "loading_icon") as ButtonImage;
        loader.setOrigin(0.5, 0.5);
        loader.setScale(0.25);
        contentArea.add(loader);
        spinTween = scene.tweens.add({
          targets: loader,
          angle: 360,
          duration: 800,
          repeat: -1,
          ease: "Linear",
        });
      }

      try {
        result = await scene.gameAPI.getHistory(page, limit);
        this.setCachedHistory(page, limit, result);
        this.historyDirty = false;
      } finally {
        if (spinTween) spinTween.stop();
        if (loader) loader.destroy();
        this.historyIsLoading = false;
        if (this.historyRefreshQueued) {
          this.historyRefreshQueued = false;
          if (this.isVisible && this.historyContent?.visible) {
            const nextPage = this.historyCurrentPage || page || 1;
            const nextLimit = this.historyPageLimit || limit || 11;
            void this.showHistoryContent(scene, nextPage, nextLimit, {
              silent: true,
            });
          }
        }
      }
    }


    // Update pagination state - check multiple possible metadata formats
    this.historyCurrentPage =
      result?.meta?.page ?? result?.page ?? result?.meta?.currentPage ?? page;
    this.historyTotalPages =
      result?.meta?.pageCount ??
      result?.totalPages ??
      result?.meta?.totalPages ??
      result?.meta?.total ??
      1;
    this.historyPageLimit = limit;


    // Display headers centered per column (only once)
    const columnCenters = this.getHistoryColumnCenters(scene);
    const headerContainer = this
      .historyHeaderContainer as GameObjects.Container;
    if (headerContainer.length <= 1) {
      // only title exists
      const headerY = 60;
      historyHeaders.forEach((header, idx) => {
        const headerText = scene.add.text(columnCenters[idx], headerY, header, {
          fontSize: "14px",
          color: "#FFFFFF",
          fontFamily: "Poppins-Regular",
          fontStyle: "bold",
        }) as ButtonText;
        headerText.setOrigin(0.5, 0);
        headerContainer.add(headerText);
      });
    }

    // Rebuild rows in-place (no container recreation) so the screen doesn't flicker
    const rowsContainer = this.historyRowsContainer as GameObjects.Container;
    rowsContainer.removeAll(true);

    let contentY = 100;
    let firstRowTexts: ButtonText[] = [];
    let firstRowSignature: string | null = null;
    result.data?.forEach((v: any, index: number) => {
      const spinDate = this.formatISOToDMYHM(v?.createdAt);
      const currency = !v?.currency ? "usd" : v.currency;
      const betAmount = Number(v?.bet);
      const bet = formatCurrencyNumber(Number.isFinite(betAmount) ? betAmount : 0);
      const winAmount = Number(v?.win);
      const winNumber = Number.isFinite(winAmount) ? winAmount : 0;
      const winText = formatCurrencyNumber(winNumber);

      contentY += 30;
      // Create row centered per column
      const rowTexts = this.createHistoryEntry(
        contentY,
        scene,
        rowsContainer,
        spinDate,
        currency,
        bet,
        winText,
        columnCenters,
      );
      if (index === 0) {
        firstRowTexts = rowTexts;
        firstRowSignature = `${spinDate}|${currency}|${bet}|${winText}`;
      }
      this.addDividerHistory(scene, rowsContainer, contentY);
      contentY += 20;
    });

    // Subtle scale tween on the topmost row only when a new spin entry appears.
    if (firstRowTexts.length > 0 && firstRowSignature) {
      if (this.lastHistoryTopRowSignature !== null && this.lastHistoryTopRowSignature !== firstRowSignature) {
        this.applyHistoryRowUpdateTween(scene, firstRowTexts);
      }
      this.lastHistoryTopRowSignature = firstRowSignature;
    }

    // Add pagination buttons at bottom-center (clear previous buttons first)
    const paginationContainer = this
      .historyPaginationContainer as GameObjects.Container;
    paginationContainer.removeAll(true);
    this.addHistoryPagination(
      scene,
      paginationContainer,
      this.historyCurrentPage,
      this.historyTotalPages,
      this.historyPageLimit,
    );
  }

  private formatISOToDMYHM(iso: string, timeZone = "Asia/Manila"): string {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-GB", {
      day: "numeric", // no leading zero
      month: "numeric", // no leading zero
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).formatToParts(d);

    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${map.day}/${map.month}/${map.year}, ${map.hour}:${map.minute}`;
  }

  private createHistoryEntry(
    y: number,
    scene: GameScene,
    contentArea: GameObjects.Container,
    spinDate: string,
    currency: string,
    bet: string,
    win: string,
    columnCenters: number[]
  ): ButtonText[] {
    // Create separate text fields and center them per column
    const values: string[] = [spinDate, currency, bet, win];
    const texts: ButtonText[] = [];
    values.forEach((value, idx) => {
      const text = scene.add.text(columnCenters[idx], y, value, {
        fontSize: "14px",
        color: "#FFFFFF",
        fontFamily: "Poppins-Regular",
      }) as ButtonText;
      text.setOrigin(0.5, 0);
      contentArea.add(text);
      texts.push(text);
    });
    return texts;
  }

  private applyHistoryRowUpdateTween(
    scene: GameScene,
    texts: ButtonText[],
  ): void {
    // Tween the entire top row (all columns) as a subtle signal.
    if (!texts.length) return;

    // Reset scales before applying tween
    texts.forEach((t) => t.setScale(1));

    scene.tweens.add({
      targets: texts,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 140,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  // Compute four column centers within the content area bounds
  private getHistoryColumnCenters(scene: GameScene): number[] {
    const worldLeft = 20;
    const worldRight = scene.scale.width - 20;
    const parentOffsetX = this.contentArea ? this.contentArea.x : 0;
    const localLeft = worldLeft - parentOffsetX;
    const localRight = worldRight - parentOffsetX;
    const totalWidth = localRight - localLeft;

    // Define column center ratios across the available width (tuned for headers)
    const ratios = [0.15, 0.4, 0.65, 0.88];
    return ratios.map((r) => localLeft + totalWidth * r);
  }

  private addDividerHistory(
    scene: GameScene,
    contentArea: GameObjects.Container,
    y: number,
  ): void {
    const dividerY = y + 30;
    const worldLeft = 20;
    const worldRight = scene.scale.width - 20;
    const parentOffsetX = this.contentArea ? this.contentArea.x : 0;
    const localLeft = worldLeft - parentOffsetX;
    const localWidth = worldRight - worldLeft;
    const divider = scene.add.graphics();
    divider.fillStyle(0xffffff, 0.1);
    divider.fillRect(localLeft, dividerY, localWidth, 1);
    contentArea.add(divider);
  }

  private addHistoryPagination(
    scene: GameScene,
    contentArea: GameObjects.Container,
    page: number,
    totalPages: number,
    limit: number,
  ): void {
    const buttonSpacing = 18;
    const icons = [
      "icon_most_left",
      "icon_left",
      "icon_right",
      "icon_most_right",
    ];

    // Use the actual content area dimensions (parent container) for placement
    const areaWidth = this.contentArea
      ? this.contentArea.width
      : scene.scale.width;
    const areaHeight = this.contentArea
      ? this.contentArea.height
      : scene.scale.height;

    // Bottom within the visible content area
    const bottomPadding = 80;
    const y = areaHeight - bottomPadding;

    // Measure total width for centering within the content area
    const tempImages: Phaser.GameObjects.Image[] = icons.map(
      (key) => scene.add.image(0, 0, key) as ButtonImage,
    );
    const totalWidth = tempImages.reduce(
      (sum, img, i) => sum + img.width + (i > 0 ? buttonSpacing : 0),
      0,
    );
    tempImages.forEach((img) => img.destroy());

    // Start X so the row is centered inside the content area's local coordinates
    let currentX = (areaWidth - totalWidth) / 2;

    // Place interactive buttons into the history content container
    icons.forEach((key) => {
      const btn = scene.add.image(currentX, y, key) as ButtonImage;
      btn.setOrigin(0, 1);

      let targetPage = page;
      let enabled = true;
      switch (key) {
        case "icon_most_left":
          targetPage = 1;
          enabled = page > 1;
          break;
        case "icon_left":
          targetPage = Math.max(1, page - 1);
          enabled = page > 1;
          break;
        case "icon_right":
          targetPage = Math.min(totalPages, page + 1);
          enabled = page < totalPages;
          break;
        case "icon_most_right":
          targetPage = Math.max(1, totalPages);
          enabled = page < totalPages;
          break;
      }

      if (enabled) {
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerup", () => {
          if (this.historyIsLoading) {
            return;
          }
          scene.audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
          // Disable all pagination buttons during load
          contentArea.iterate((child: Phaser.GameObjects.GameObject) => {
            const img = child as Phaser.GameObjects.Image;
            if (
              img &&
              (img as any).texture &&
              icons.includes((img as any).texture.key)
            ) {
              img.disableInteractive();
              img.setAlpha(0.5);
            }
          });
          this.showHistoryContent(scene, targetPage, limit);
        });
      } else {
        btn.setAlpha(0.5);
        btn.disableInteractive();
      }

      contentArea.add(btn);
      currentX += btn.width + buttonSpacing;
    });

    // Page number display: "Page 1 of 10"
    const pageNumberText = scene.add.text(
      areaWidth / 2,
      y + 40, // place below the pagination buttons
      this.formatHistoryPageText(page, totalPages),
      {
        fontSize: "20px",
        color: "#FFFFFF",
        fontFamily: "Poppins-Regular",
        align: "center",
      },
    ) as ButtonText;
    pageNumberText.setOrigin(0.5, 0); // center horizontally
    contentArea.add(pageNumberText);
  }

  private createVolumeSettingsContent(
    scene: GameScene,
    contentArea: GameObjects.Container,
  ): void {
    const scaleFactor = 1;
    const widthSlider = 340;

    // Title - Settings in green color #379557
    const title = scene.add.text(
      15,
      15,
      this.getMenuText(LK.COMMON_SETTINGS),
      this.titleStyle,
    ) as ButtonText;
    title.setOrigin(0, 0);
    contentArea.add(title);

    // Calculate proper positions
    const startX = 15;
    const startY = 15;
    const sliderStartX = startX;
    const musicSliderY = startY + 115;
    // Match Zero Law SFX layout
    const sfxSliderY = startY + 240;

    // Music section (no icon)
    const musicLabel = scene.add.text(
      startX + 0,
      startY + 70,
      this.getMenuText(LK.MENU_BACKGROUND_MUSIC),
      {
        fontSize: "18px",
        color: "#FFFFFF",
        fontFamily: "Poppins-Regular",
      },
    ) as ButtonText;
    contentArea.add(musicLabel);

    // SFX section (no icon)
    const sfxLabel = scene.add.text(startX + 0, startY + 190, this.getMenuText(LK.MENU_SOUND_FX), {
      fontSize: "18px",
      color: "#FFFFFF",
      fontFamily: "Poppins-Regular",
    }) as ButtonText;
    contentArea.add(sfxLabel);

    // Toggle switches (right side)
    const toggleWidth = 64;
    const toggleHeight = 36;
    const toggleRadius = 18;
    // Place toggles within the visible content area width (panel width - 40 padding)
    const contentAreaWidth = scene.scale.width - 40;
    const toggleX = Math.max(
      sliderStartX + 200,
      contentAreaWidth - toggleWidth - 20,
    );

    const drawToggle = (
      bg: Phaser.GameObjects.Graphics,
      circle: Phaser.GameObjects.Graphics,
      x: number,
      yCenter: number,
      on: boolean,
    ) => {
      const y = yCenter - toggleHeight / 2;
      bg.clear();
      circle.clear();
      if (on) {
        // ON: green track; white knob on RIGHT
        bg.fillStyle(0x379557, 1);
        bg.lineStyle(3, 0x2f6d49, 1);
        bg.strokeRoundedRect(x, y, toggleWidth, toggleHeight, toggleRadius);
        bg.fillRoundedRect(x, y, toggleWidth, toggleHeight, toggleRadius);
        circle.fillStyle(0xffffff, 1);
        circle.fillCircle(
          x + toggleWidth - toggleRadius,
          y + toggleHeight / 2,
          toggleRadius - 4,
        );
      } else {
        // OFF: dark gray track; white knob on LEFT
        bg.fillStyle(0x1f2937, 1);
        bg.lineStyle(3, 0x9ca3af, 1);
        bg.strokeRoundedRect(x, y, toggleWidth, toggleHeight, toggleRadius);
        bg.fillRoundedRect(x, y, toggleWidth, toggleHeight, toggleRadius);
        circle.fillStyle(0xffffff, 1);
        circle.fillCircle(
          x + toggleRadius,
          y + toggleHeight / 2,
          toggleRadius - 4,
        );
      }
    };

    // Music toggle
    const musicToggleBg = scene.add.graphics();
    const musicToggleCircle = scene.add.graphics();
    contentArea.add(musicToggleBg);
    contentArea.add(musicToggleCircle);
    musicToggleBg.setDepth(10);
    musicToggleCircle.setDepth(11);
    let musicOn = scene.audioManager.getVolume() > 0;
    drawToggle(musicToggleBg, musicToggleCircle, toggleX, startY + 70, musicOn);
    const musicToggleArea = scene.add
      .zone(toggleX, startY + 70 - toggleHeight / 2, toggleWidth, toggleHeight)
      .setOrigin(0, 0);
    musicToggleArea.setInteractive();
    musicToggleArea.on("pointerdown", () => {
      const audioManager =
        (scene as any)?.audioManager || (window as any)?.audioManager;
      if (audioManager && typeof audioManager.playSoundEffect === "function") {
        audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
      }
      musicOn = !musicOn;
      scene.audioManager.setVolume(musicOn ? 1 : 0);
      drawToggle(
        musicToggleBg,
        musicToggleCircle,
        toggleX,
        startY + 70,
        musicOn,
      );
      updateSliders();
    });
    contentArea.add(musicToggleArea);
    musicToggleArea.setDepth(12);

    // SFX toggle
    const sfxToggleBg = scene.add.graphics();
    const sfxToggleCircle = scene.add.graphics();
    contentArea.add(sfxToggleBg);
    contentArea.add(sfxToggleCircle);
    sfxToggleBg.setDepth(10);
    sfxToggleCircle.setDepth(11);
    let sfxOn = scene.audioManager.getSfxVolume() > 0;
    drawToggle(sfxToggleBg, sfxToggleCircle, toggleX, startY + 190, sfxOn);
    const sfxToggleArea = scene.add
      .zone(toggleX, startY + 190 - toggleHeight / 2, toggleWidth, toggleHeight)
      .setOrigin(0, 0);
    sfxToggleArea.setInteractive();
    sfxToggleArea.on("pointerdown", () => {
      const audioManager =
        (scene as any)?.audioManager || (window as any)?.audioManager;
      if (audioManager && typeof audioManager.playSoundEffect === "function") {
        audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
      }
      sfxOn = !sfxOn;
      scene.audioManager.setSfxVolume(sfxOn ? 1 : 0);
      drawToggle(sfxToggleBg, sfxToggleCircle, toggleX, startY + 190, sfxOn);
      updateSliders();
    });
    contentArea.add(sfxToggleArea);
    sfxToggleArea.setDepth(12);

    // Music slider background
    const musicSliderBg = scene.add.graphics();
    musicSliderBg.fillStyle(0x379557, 1);
    musicSliderBg.fillRoundedRect(
      sliderStartX,
      musicSliderY,
      widthSlider * scaleFactor,
      8 * scaleFactor,
      4 * scaleFactor,
    );

    const musicSliderBg2 = scene.add.graphics();
    musicSliderBg2.fillStyle(0x333333, 1);
    musicSliderBg2.lineStyle(1, 0x666666);
    musicSliderBg2.fillRoundedRect(
      sliderStartX,
      musicSliderY,
      widthSlider * scaleFactor,
      8 * scaleFactor,
      4 * scaleFactor,
    );
    musicSliderBg2.strokeRoundedRect(
      sliderStartX,
      musicSliderY,
      widthSlider * scaleFactor,
      8 * scaleFactor,
      4 * scaleFactor,
    );

    contentArea.add(musicSliderBg2);
    contentArea.add(musicSliderBg);

    const musicSlider = scene.add.graphics();
    musicSlider.fillStyle(0xffffff, 1);
    // Draw knob at local origin and position the graphics instead of drawing at world coords
    musicSlider.fillCircle(0, 0, 12 * scaleFactor);
    const initialMusicVol = scene.audioManager.getVolume();
    musicSlider.setPosition(
      sliderStartX + initialMusicVol * widthSlider * scaleFactor,
      musicSliderY + 4,
    );
    // Enlarge interactive hit area and keep it local to the graphics
    musicSlider.setInteractive(
      new Geom.Circle(0, 0, 22 * scaleFactor),
      Geom.Circle.Contains,
    );
    contentArea.add(musicSlider);

    // Music value text
    const musicValue = scene.add.text(
      sliderStartX,
      musicSliderY + 25,
      Math.round(initialMusicVol * 100) + "%",
      {
        fontSize: "16px",
        color: "#FFFFFF",
        fontFamily: "Poppins-Regular",
      },
    ) as ButtonText;
    contentArea.add(musicValue);

    // SFX slider (mirrors music slider styling)
    const sfxSliderBg = scene.add.graphics();
    const sfxSliderBg2 = scene.add.graphics();
    const sfxSlider = scene.add.graphics();
    const sfxValue = scene.add.text(sliderStartX, sfxSliderY + 25, "75%", {
      fontSize: "16px",
      color: "#FFFFFF",
      fontFamily: "Poppins-Regular",
    }) as ButtonText;
    // Background (filled portion) for SFX slider
    sfxSliderBg.fillStyle(0x379557, 1);
    sfxSliderBg.fillRoundedRect(
      sliderStartX,
      sfxSliderY,
      widthSlider * scaleFactor,
      8 * scaleFactor,
      4 * scaleFactor,
    );
    // Full track background / border for SFX slider
    sfxSliderBg2.fillStyle(0x333333, 1);
    sfxSliderBg2.lineStyle(1, 0x666666);
    sfxSliderBg2.fillRoundedRect(
      sliderStartX,
      sfxSliderY,
      widthSlider * scaleFactor,
      8 * scaleFactor,
      4 * scaleFactor,
    );
    sfxSliderBg2.strokeRoundedRect(
      sliderStartX,
      sfxSliderY,
      widthSlider * scaleFactor,
      8 * scaleFactor,
      4 * scaleFactor,
    );
    contentArea.add(sfxSliderBg2);
    contentArea.add(sfxSliderBg);
    contentArea.add(sfxSlider);
    contentArea.add(sfxValue);

    // Helper to update slider positions and values
    const updateSliders = (
      musicX: number | null = null,
      sfxX: number | null = null,
    ) => {
      const sliderWidth = widthSlider * scaleFactor;

      const musicVol =
        musicX !== null
          ? Math.max(0, Math.min(1, musicX / sliderWidth))
          : scene.audioManager.getVolume();

      const sfxVol =
        sfxX !== null
          ? Math.max(0, Math.min(1, sfxX / sliderWidth))
          : scene.audioManager.getSfxVolume();

      // Update music slider
      musicSlider.clear();
      musicSlider.fillStyle(0xffffff, 1);
      const musicSliderX = sliderStartX + musicVol * sliderWidth;
      // Keep drawing local and move the graphics to the new position
      musicSlider.fillCircle(0, 0, 12 * scaleFactor);
      musicSlider.setPosition(musicSliderX, musicSliderY + 4);
      musicSliderBg.clear();
      musicSliderBg.fillStyle(0x379557, 1);
      musicSliderBg.fillRoundedRect(
        sliderStartX,
        musicSliderY,
        sliderWidth * musicVol,
        8 * scaleFactor,
        4 * scaleFactor,
      );
      musicValue.setText(Math.round(musicVol * 100) + "%");

      // Sync music toggle state with slider value
      // If slider reaches 0%, force toggle OFF; if >0%, ensure toggle ON
      if (musicVol === 0) {
        if (musicOn) {
          musicOn = false;
          drawToggle(
            musicToggleBg,
            musicToggleCircle,
            toggleX,
            startY + 70,
            musicOn,
          );
        }
      } else {
        if (!musicOn) {
          musicOn = true;
          drawToggle(
            musicToggleBg,
            musicToggleCircle,
            toggleX,
            startY + 70,
            musicOn,
          );
        }
      }

      // Update SFX slider
      const sfxSliderX = sliderStartX + sfxVol * sliderWidth;
      sfxSlider.clear();
      sfxSlider.fillStyle(0xffffff, 1);
      sfxSlider.fillCircle(0, 0, 12 * scaleFactor);
      sfxSlider.setPosition(sfxSliderX, sfxSliderY + 4);
      sfxSliderBg.clear();
      sfxSliderBg.fillStyle(0x379557, 1);
      sfxSliderBg.fillRoundedRect(
        sliderStartX,
        sfxSliderY,
        sliderWidth * sfxVol,
        8 * scaleFactor,
        4 * scaleFactor,
      );
      sfxValue.setText(Math.round(sfxVol * 100) + "%");

      // Update volumes
      if (musicX !== null) scene.audioManager.setVolume(musicVol);
      if (sfxX !== null) scene.audioManager.setSfxVolume(sfxVol);

      // Update interactive areas for sliders (keep hit areas centered on the local origin)
      musicSlider.setInteractive(
        new Geom.Circle(0, 0, 22 * scaleFactor),
        Geom.Circle.Contains,
      );
      sfxSlider.setInteractive(
        new Geom.Circle(0, 0, 22 * scaleFactor),
        Geom.Circle.Contains,
      );
    };

    // Initial slider setup
    updateSliders();

    // Make sliders draggable
    this.isDraggingMusic = false;
    this.isDraggingSFX = false;

    const stopSliderDragging = () => {
      this.isDraggingMusic = false;
      this.isDraggingSFX = false;
    };

    const isPointerOutsideGameScreen = (pointer: Phaser.Input.Pointer) => {
      return (
        pointer.x < 0 ||
        pointer.y < 0 ||
        pointer.x > scene.scale.width ||
        pointer.y > scene.scale.height
      );
    };

    // Global pointer move and up handlers
    const pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
      if (isPointerOutsideGameScreen(pointer)) {
        stopSliderDragging();
        return;
      }

      if (this.isDraggingMusic) {
        const sliderWidth = widthSlider * scaleFactor;
        const p = (musicSliderTrack as any).getLocalPoint(pointer.x, pointer.y);
        const localX = Math.max(
          0,
          Math.min(sliderWidth, p && typeof p.x === "number" ? p.x : 0),
        );
        updateSliders(localX, null);
      } else if (this.isDraggingSFX) {
        const sliderWidth = widthSlider * scaleFactor;
        const p = (sfxSliderTrack as any).getLocalPoint(pointer.x, pointer.y);
        const localX = Math.max(
          0,
          Math.min(sliderWidth, p && typeof p.x === "number" ? p.x : 0),
        );
        updateSliders(null, localX);
      }
    };

    const pointerUpHandler = () => {
      stopSliderDragging();
    };

    this.scene.input.on("pointermove", pointerMoveHandler);
    this.scene.input.on("pointerup", pointerUpHandler);
    this.scene.input.on("gameout", pointerUpHandler);

    // Store cleanup callbacks for the temporary slider listeners
    this.menuEventHandlers.push(
      () => scene.input.off("pointermove", pointerMoveHandler),
      () => scene.input.off("pointerup", pointerUpHandler),
      () => scene.input.off("gameout", pointerUpHandler),
    );

    // Create clickable areas for the entire slider tracks
    const musicSliderTrack = scene.add.graphics();
    musicSliderTrack.setPosition(sliderStartX, musicSliderY);
    musicSliderTrack.fillStyle(0x000000, 0); // Transparent
    // Draw and set hit area in local coords for reliable input inside a container
    musicSliderTrack.fillRect(0, -10, widthSlider * scaleFactor, 28);
    musicSliderTrack.setInteractive(
      new Geom.Rectangle(0, -10, widthSlider * scaleFactor, 28),
      Geom.Rectangle.Contains,
    );
    contentArea.add(musicSliderTrack);

    const sfxSliderTrack = scene.add.graphics();
    sfxSliderTrack.setPosition(sliderStartX, sfxSliderY);
    sfxSliderTrack.fillStyle(0x000000, 0); // Transparent
    // Draw and set hit area in local coords for reliable input inside a container
    sfxSliderTrack.fillRect(0, -10, widthSlider * scaleFactor, 28);
    sfxSliderTrack.setInteractive(
      new Geom.Rectangle(0, -10, widthSlider * scaleFactor, 28),
      Geom.Rectangle.Contains,
    );
    contentArea.add(sfxSliderTrack);

    // Music slider track click handler
    musicSliderTrack.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer, localX: number) => {
        const sliderWidth = widthSlider * scaleFactor;
        localX = Math.max(0, Math.min(sliderWidth, localX));
        const newVolume = localX / sliderWidth;
        scene.audioManager.setVolume(newVolume);
        this.isDraggingMusic = true; // allow click-and-drag on the track
        updateSliders();
      },
    );

    // SFX slider track click handler
    sfxSliderTrack.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer, localX: number) => {
        const sliderWidth = widthSlider * scaleFactor;
        localX = Math.max(0, Math.min(sliderWidth, localX));
        const newVolume = localX / sliderWidth;
        scene.audioManager.setSfxVolume(newVolume);
        this.isDraggingSFX = true;
        updateSliders();
      },
    );

    // Music slider handle interaction
    musicSlider.on("pointerdown", () => {
      this.isDraggingMusic = true;
    });

    // SFX slider handle interaction
    sfxSlider.on("pointerdown", () => {
      this.isDraggingSFX = true;
    });
  }

  public showMenu(scene: GameScene): void {
    this.settingsOnly = false;

    const container = this.createMenu(scene);

    container.setVisible(true);
    container.setAlpha(0);
    this.isVisible = true;

    scene.tweens.add({
      targets: container,
      alpha: 1,
      duration: 300,
      ease: "Power2",
    });
  }

  public hideMenu(scene: GameScene): void {
    if (!this.menuContainer) return;

    // Ensure menu container and all its children are hidden
    this.menuContainer.setVisible(false);
    this.menuContainer.setActive(false);
    this.isVisible = false;

    // Reset any help screen related state if present (guarded)
    if ((scene.gameData as any).isHelpScreenVisible !== undefined) {
      (scene.gameData as any).isHelpScreenVisible = false;
    }

    // Clean up event handlers
    if (this.menuEventHandlers) {
      this.menuEventHandlers.forEach((cleanup) => cleanup());
      this.menuEventHandlers = [];
    }

    // Reset dragging states
    this.isDraggingMusic = false;
    this.isDraggingSFX = false;
  }

  public toggleMenu(scene: GameScene): void {
    this.showMenu(scene);
  }
}
