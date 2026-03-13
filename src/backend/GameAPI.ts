import { SpinData } from "./SpinData";
import { GameData } from "../game/components/GameData";
import { gameStateManager } from "../managers/GameStateManager";
import { SoundEffectType } from "../managers/AudioManager";
import { SLOT_COLUMNS, SLOT_ROWS } from "../config/GameConfig";
import { normalizeAreaToGameConfig } from "../utils/GridTransform";
import { simulateTumbleCascade } from "../game/components/Spin";

type ImportMetaWithGlob = ImportMeta & {
  glob: (
    pattern: string,
    options?: {
      query?: string;
      import?: string;
      eager?: boolean;
    },
  ) => Record<string, string>;
};

const SAMPLE_DATA_URLS = (import.meta as ImportMetaWithGlob).glob(
  "/src/game/spinDataSample/**/*.json",
  {
    query: "?url",
    import: "default",
    eager: true,
  },
);
const SAMPLE_DATA_URL_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(SAMPLE_DATA_URLS).map(([path, url]) => {
    const filename = path.split(/[\\/]/).pop() || path;
    const key = filename.replace(/\.json$/i, "");
    return [key, String(url)];
  }),
);

/**
 * Function to parse URL query parameters
 * @param name - The name of the parameter to retrieve
 * @returns The value of the parameter or null if not found
 */
function getUrlParameter(name: string): string {
  const urlParams = new URLSearchParams(window.location.search);
  let str: string = "";
  if (urlParams.get("start_game")) {
    str = "start_game";
  } else {
    str = urlParams.get(name) || "";
  }
  return str;
}

/**
 * Function to log all URL parameters for debugging
 * Only logs if there are any parameters present
 */
function logUrlParameters(): void {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.toString()) {
    // Intentionally no-op: logging removed per requirements.
  }
}

/** Keep only freeSpin.items through first isMaxWin (no phantom spins after max win). */
export function truncateFreeSpinItemsAfterFirstMaxWin(
  items: any[] | undefined | null,
): any[] {
  if (!Array.isArray(items) || items.length === 0) return items ?? [];
  const idx = items.findIndex((it: any) => it?.isMaxWin === true);
  if (idx < 0) return items;
  return items.slice(0, idx + 1);
}

function applyTruncateFreeSpinItems(slot: any): void {
  if (!slot) return;
  const items = slot.freeSpin?.items ?? slot.freespin?.items;
  if (!Array.isArray(items) || items.length === 0) return;
  const trimmed = truncateFreeSpinItemsAfterFirstMaxWin(items);
  if (slot.freeSpin) slot.freeSpin.items = trimmed;
  if (slot.freespin) slot.freespin.items = trimmed;
}

const getApiBaseUrl = (): string => {
  const configuredUrl = (window as any)?.APP_CONFIG?.["game-url"];
  if (typeof configuredUrl === "string" && configuredUrl.length > 0) {
    return configuredUrl.replace(/\/$/, "");
  }
  return "https://stg-game-launcher.dijoker.com"; // 192.168.0.17:3000/
};

/**
 * Structure of a single free spin round entry in the initialization payload.
 */
export interface InitFreeSpinRound {
  bet: string;
  totalFreeSpin: number;
  usedFreeSpin: number;
  remainingFreeSpin: number;
}

/**
 * Unresolved spin payload from slot initialization.
 */
export interface UnresolvedSpin {
  /** Unique identifier for this unresolved round */
  uuid: string;
  /** Current free spin index to resume from */
  index: number;
  /** Original spin response payload used to resume autoplay */
  response: SpinData;
}

/**
 * Response payload for the /api/v1/slots/initialize endpoint
 */
export interface SlotInitializeData {
  gameId: string;
  playerId?: string;
  sessionId: string;
  lang: string;
  currency: string;
  currencySymbol?: string;
  /** When set, used by NumberPrecisionFormatter for display decimals */
  currencyDecimalPlaces?: number;
  hasFreeSpinRound: boolean;
  // New backend format: array of free spin round entries.
  // Kept as `any` union-friendly type for backwards compatibility,
  // but we always treat it as InitFreeSpinRound[] in our helper.
  freeSpinRound: InitFreeSpinRound[] | number | Record<string, unknown> | null;
  /** Backend may omit this; unresolvedSpin payload is authoritative */
  hasUnresolvedSpin?: boolean;
  unresolvedSpinIndex?: number;
  /**
   * Unresolved-spin payload from backend.
   * Kept flexible for compatibility with variant backend shapes.
   */
  unresolvedSpin?: UnresolvedSpin | Record<string, unknown> | null;
}

export interface SlotInitializeResponse {
  data: SlotInitializeData;
}

/**
 * History item interface representing a single game history entry
 */
export interface HistoryItem {
  id: number;
  roundId: string;
  type: "free_spin" | "normal";
  gameId: string;
  gameName: string;
  currency: string;
  bet: string;
  win: string;
  jackpotWin: string;
  createdAt: string;
}

/** Request body for refresh token API */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/** Response from refresh token API - supports both data.token and token at root */
export interface RefreshTokenResponse {
  data?: { token?: string };
  token?: string;
}

export class GameAPI {
  private static readonly GAME_ID: string = "00171225"; //change to 00171225 for pastry cub
  private static DEMO_BALANCE: number = 10000;
  private static readonly REFRESH_TOKEN_KEY: string = "refresh_token";

  gameData: GameData;
  exitURL: string = "";
  private currentSpinData: SpinData | null = null;
  private currentFreeSpinIndex: number = 0; // Track current free spin item index
  private initializationData: SlotInitializeData | null = null; // Cached initialization response
  private remainingInitFreeSpins: number = 0; // Free spin rounds from initialization still available
  private initFreeSpinBet: number | null = null; // Bet size associated with initialization free spins
  /** Runtime unresolved-spin UUID (e.g. from scatter-triggering spin payload) */
  private unresolvedSpinUuid: string | null = null;
  /** Prevent stale init unresolved UUID fallback after a resumed round is consumed */
  private initializationUnresolvedConsumed: boolean = false;
  /** Stop retrying PATCH when backend confirms unresolved resource no longer exists */
  private unresolvedPatchTerminal: boolean = false;

  // One-shot debug helper: force the first MANUAL spin to contain 3 scatters (symbol id 0)
  // in the first 3 columns. Enable via:
  // - URL: ?mockFirstManualScatterSpin=true
  // - localStorage: localStorage.setItem('mockFirstManualScatterSpin','true')
  private static readonly MOCK_FIRST_MANUAL_SCATTER_SPIN_ENABLED: boolean =
    new URLSearchParams(window.location.search).get(
      "mockFirstManualScatterSpin",
    ) === "true" ||
    localStorage.getItem("mockFirstManualScatterSpin") === "true";
  private mockedFirstManualScatterSpin: boolean = false;

  private static readonly SAMPLE_FLAG_KEYS = {
    useFakeData: "useFakeData",
    useMaxWin: "useMaxWin",
  } as const;

  private static readonly SAMPLE_FLAGS_ENABLED: Record<
    (typeof GameAPI.SAMPLE_FLAG_KEYS)[keyof typeof GameAPI.SAMPLE_FLAG_KEYS],
    boolean
  > = Object.fromEntries(
    Object.values(GameAPI.SAMPLE_FLAG_KEYS).map((key) => [
      key,
      new URLSearchParams(window.location.search).get(key) === "true" ||
        localStorage.getItem(key) === "true",
    ]),
  ) as Record<
    (typeof GameAPI.SAMPLE_FLAG_KEYS)[keyof typeof GameAPI.SAMPLE_FLAG_KEYS],
    boolean
  >;

  // Sample data mode: loads data from src/game/spinDataSample/*.json
  // Enable via ?sampleData=<file_base_name> or localStorage.setItem('sampleData','<file_base_name>')
  // Backwards-compatible aliases: useMaxWin/useFakeData
  private static readonly SAMPLE_DATA_KEY: string | null = (() => {
    const params = new URLSearchParams(window.location.search);
    const paramKey = params.get("sampleData");
    const storageKey = localStorage.getItem("sampleData");
    const explicitKey = paramKey || storageKey;
    if (explicitKey) return explicitKey;
    if (GameAPI.SAMPLE_FLAGS_ENABLED.useMaxWin) return "max_win_data";
    if (GameAPI.SAMPLE_FLAGS_ENABLED.useFakeData) return "fake_spin_data";
    return null;
  })();
  private sampleNormalSpinIndex: number = 0;
  private sampleBonusSpinIndex: number = 0;
  private sampleDataCache: Record<string, any | null> = {};
  private sampleDataLoadPromise: Record<string, Promise<any | null>> = {};

  constructor(gameData: GameData) {
    this.gameData = gameData;
  }

  private getSampleDataKey(): string | null {
    return GameAPI.SAMPLE_DATA_KEY;
  }

  private getSampleDataUrl(): string | null {
    const key = this.getSampleDataKey();
    if (!key) return null;
    const normalizedKey = key.replace(/\.json$/i, "");
    return SAMPLE_DATA_URL_BY_NAME[normalizedKey] ?? null;
  }

  private async loadSampleData(): Promise<any | null> {
    const key = this.getSampleDataKey();
    const url = this.getSampleDataUrl();
    if (!key || !url) return null;
    const normalizedKey = key.replace(/\.json$/i, "");

    if (
      Object.prototype.hasOwnProperty.call(this.sampleDataCache, normalizedKey)
    ) {
      return this.sampleDataCache[normalizedKey];
    }
    if (await this.sampleDataLoadPromise[normalizedKey]) {
      return this.sampleDataLoadPromise[normalizedKey];
    }

    this.sampleDataLoadPromise[normalizedKey] = (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          this.sampleDataCache[normalizedKey] = null;
          return null;
        }
        const data = await res.json();
        this.sampleDataCache[normalizedKey] = data || null;
        return this.sampleDataCache[normalizedKey];
      } catch (e) {
        this.sampleDataCache[normalizedKey] = null;
        return null;
      }
    })();

    return this.sampleDataLoadPromise[normalizedKey];
  }

  private isSampleDataEnabled(): boolean {
    return !!this.getSampleDataUrl();
  }

  private getSampleListData(
    data: any,
  ): { normalGame?: any[]; bonusGame?: any[] } | null {
    if (!data) return null;
    if (Array.isArray(data.normalGame) || Array.isArray(data.bonusGame)) {
      return data as { normalGame?: any[]; bonusGame?: any[] };
    }
    return null;
  }

  private getNextSampleSpinFromList(
    isBonus: boolean,
    bet: number,
    data: { normalGame?: any[]; bonusGame?: any[] },
  ): SpinData | null {
    const list = isBonus ? data.bonusGame || [] : data.normalGame || [];
    if (!Array.isArray(list) || list.length === 0) return null;

    const idx = isBonus
      ? this.sampleBonusSpinIndex
      : this.sampleNormalSpinIndex;
    const next = list[idx % list.length];
    if (isBonus) {
      this.sampleBonusSpinIndex += 1;
    } else {
      this.sampleNormalSpinIndex += 1;
    }

    const cloned = JSON.parse(JSON.stringify(next || {}));
    if (cloned) {
      cloned.bet = bet.toString();
      if (this.currentSpinData?.playerId) {
        cloned.playerId = this.currentSpinData.playerId;
      } else if (!cloned.playerId) {
        cloned.playerId = "demo-player";
      }
      if (cloned.slot) {
        if (Array.isArray(cloned.slot.area)) {
          // fake_spin_data.json structure: each inner array is a column, values start from top (row 0 = top)
          // Format: [column][row] where column is outer array, row is inner array.
          // This matches the current in-game render convention: [column][row] with top->bottom ordering.
          cloned.slot.area = normalizeAreaToGameConfig(cloned.slot.area);

          // Use tumbles/totalWin from JSON when present so intended wins (e.g. symbol5 in first spin) are preserved.
          // Only simulate cascade when the file does not define tumbles.
          const hasTumblesFromFile =
            Array.isArray(cloned.slot.tumbles) &&
            cloned.slot.tumbles.length > 0;
          if (!hasTumblesFromFile) {
            try {
              const { tumbles, totalWin } = simulateTumbleCascade(
                cloned.slot.area,
                bet,
              );
              cloned.slot.tumbles = tumbles;
              cloned.slot.totalWin = totalWin;
            } catch {}
          }
          // If JSON had tumbles but no totalWin, sum win from tumble steps
          if (
            hasTumblesFromFile &&
            (typeof cloned.slot.totalWin !== "number" ||
              !Number.isFinite(cloned.slot.totalWin))
          ) {
            let sum = 0;
            for (const t of cloned.slot.tumbles) {
              const w = Number((t as any)?.win ?? 0);
              if (Number.isFinite(w)) sum += w;
            }
            if (sum > 0) cloned.slot.totalWin = sum;
          }
        }

        const items =
          cloned.slot.freeSpin?.items ?? cloned.slot.freespin?.items;
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item && Array.isArray(item.area)) {
              item.area = normalizeAreaToGameConfig(item.area);
              const hasItemTumblesFromFile =
                Array.isArray(item.tumbles) && item.tumbles.length > 0;
              // Keep tumble wins from sample JSON when present.
              // Only simulate when the item has no tumble payload.
              if (!hasItemTumblesFromFile) {
                try {
                  const { tumbles: itemTumbles, totalWin: itemTotalWin } =
                    simulateTumbleCascade(item.area, bet);
                  item.tumbles = itemTumbles;
                  item.totalWin = itemTotalWin;
                } catch {}
              } else if (
                typeof item.totalWin !== "number" ||
                !Number.isFinite(item.totalWin)
              ) {
                let itemSum = 0;
                for (const t of item.tumbles) {
                  const w = Number((t as any)?.win ?? 0);
                  if (Number.isFinite(w)) itemSum += w;
                }
                if (itemSum > 0) item.totalWin = itemSum;
              }
            }
          }
        }
        applyTruncateFreeSpinItems(cloned.slot);

        if (!Array.isArray(cloned.slot.paylines)) {
          cloned.slot.paylines = [];
        }
        if (!cloned.slot.freespin && cloned.slot.freeSpin) {
          cloned.slot.freespin = cloned.slot.freeSpin;
        } else if (!cloned.slot.freeSpin && cloned.slot.freespin) {
          cloned.slot.freeSpin = cloned.slot.freespin;
        }
      }
    }
    return cloned as SpinData;
  }

  private buildSampleSpinFromSingle(bet: number, data: any): SpinData | null {
    if (!data || !data.slot) return null;

    const cloned = JSON.parse(JSON.stringify(data || {}));
    cloned.bet = bet.toString();
    if (this.currentSpinData?.playerId) {
      cloned.playerId = this.currentSpinData.playerId;
    } else if (!cloned.playerId) {
      cloned.playerId = "demo-player";
    }

    if (cloned.slot) {
      if (Array.isArray(cloned.slot.area)) {
        cloned.slot.area = normalizeAreaToGameConfig(cloned.slot.area);
      }

      if (!Array.isArray(cloned.slot.paylines)) {
        cloned.slot.paylines = [];
      }

      if (!cloned.slot.freespin && cloned.slot.freeSpin) {
        cloned.slot.freespin = cloned.slot.freeSpin;
      } else if (!cloned.slot.freeSpin && cloned.slot.freespin) {
        cloned.slot.freeSpin = cloned.slot.freespin;
      }

      const items = cloned.slot.freeSpin?.items ?? cloned.slot.freespin?.items;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item && Array.isArray(item.area)) {
            item.area = normalizeAreaToGameConfig(item.area);
          }
          if (!Array.isArray(item.payline)) {
            item.payline = item.payline ?? [];
          }
          const hasTumbles =
            Array.isArray(item.tumbles) && item.tumbles.length > 0;
          if (
            hasTumbles &&
            (typeof item.totalWin !== "number" ||
              !Number.isFinite(item.totalWin))
          ) {
            let sum = 0;
            for (const t of item.tumbles) {
              const w = Number((t as any)?.win ?? 0);
              if (Number.isFinite(w)) sum += w;
            }
            if (sum > 0) item.totalWin = sum;
          }
        }
      }
      applyTruncateFreeSpinItems(cloned.slot);
    }

    return cloned as SpinData;
  }

  private createMockFirstManualScatterSpinData(bet: number): SpinData {
    // NOTE: In this project, slot.area is [column][row] and the grid is 7 columns x 7 rows.
    const cols = Number(SLOT_COLUMNS || 6);
    const rows = Number(SLOT_ROWS || 5);

    const area: number[][] = Array.from({ length: cols }, (_, col) =>
      Array.from({ length: rows }, (_, row) => ((col * 3 + row) % 9) + 1),
    );

    // Place scatters (symbol id 0) on columns 0,1,2 at the middle row
    const scatterRow = Math.max(0, Math.min(rows - 1, Math.floor(rows / 2)));
    for (const col of [0, 1, 2]) {
      if (col >= 0 && col < cols) {
        area[col][scatterRow] = 0;
      }
    }

    const spinData: any = {
      playerId: this.currentSpinData?.playerId || "mock_player",
      bet: bet.toString(),
      slot: {
        area,
        paylines: [],
        tumbles: [],
        // Keep both shapes around for compatibility with callers checking either key.
        freespin: { count: 0, totalWin: 0, items: [] },
        freeSpin: { count: 0, totalWin: 0, items: [] },
        totalWin: 0,
      },
    };

    return spinData as SpinData;
  }

  private buildFreeSpinFromItems(items: any[], baseSpin: SpinData): SpinData {
    items = truncateFreeSpinItemsAfterFirstMaxWin(items);
    if (this.currentFreeSpinIndex >= items.length) {
      const nextIdx = items.findIndex(
        (it: any) => Number(it?.spinsLeft || 0) > 0,
      );
      if (nextIdx >= 0) {
        this.currentFreeSpinIndex = nextIdx;
      } else {
        throw new Error("No more free spins available");
      }
    }

    let currentItem = items[this.currentFreeSpinIndex];
    if (!currentItem || currentItem.spinsLeft <= 0) {
      const nextIdx = items.findIndex(
        (it: any) => Number(it?.spinsLeft || 0) > 0,
      );
      if (nextIdx >= 0) {
        this.currentFreeSpinIndex = nextIdx;
        currentItem = items[this.currentFreeSpinIndex];
      } else {
        throw new Error("No more free spins available");
      }
    }

    const baseSlot: any = baseSpin?.slot || {};
    const baseFs: any = baseSlot?.freespin || baseSlot?.freeSpin || {};
    const baseTotalWinRaw = baseSlot?.totalWin ?? (baseSpin as any)?.totalWin;
    const baseTotalWin =
      typeof baseTotalWinRaw === "number" ? baseTotalWinRaw : undefined;
    const baseMultiplierValue =
      typeof baseFs?.multiplierValue === "number"
        ? baseFs.multiplierValue
        : undefined;

    const slotObj: any = {
      area: normalizeAreaToGameConfig(currentItem.area),
      paylines:
        (currentItem as any)?.payline ?? (currentItem as any)?.paylines ?? [],
      freespin: {
        count: baseSlot?.freespin?.count ?? baseSlot?.freeSpin?.count,
        totalWin: baseSlot?.freespin?.totalWin ?? baseSlot?.freeSpin?.totalWin,
        items,
      },
    };
    if (typeof baseMultiplierValue === "number") {
      slotObj.freespin.multiplierValue = baseMultiplierValue;
    }
    if (typeof baseTotalWin === "number") {
      slotObj.totalWin = baseTotalWin;
    }
    // Keep both shapes around for compatibility with callers checking either key.
    if (!slotObj.freeSpin) {
      slotObj.freeSpin = slotObj.freespin;
    }

    try {
      const sourceTumbles =
        (currentItem as any)?.tumbles ??
        (currentItem as any)?.tumble ??
        (currentItem as any)?.tumbleSteps ??
        (currentItem as any)?.tumbling ??
        [];
      if (Array.isArray(sourceTumbles) && sourceTumbles.length > 0) {
        slotObj.tumbles = sourceTumbles;
      }
    } catch (e) {}

    const freeSpinData: SpinData = {
      playerId: baseSpin.playerId,
      bet: baseSpin.bet,
      slot: slotObj,
    };

    this.currentSpinData = freeSpinData;
    this.currentFreeSpinIndex++;

    return freeSpinData;
  }

  /**
   * 1. Generate game URL token upon game initialization
   * This method generates a game token that can be used for subsequent API calls
   */
  public async generateGameUrlToken(): Promise<{ url: string; token: string }> {
    const apiUrl = `${getApiBaseUrl()}/api/v1/generate_url`;

    const requestBody = {
      operator_id: "18b03717-33a7-46d6-9c70-acee80c54d03",
      bank_id: "1",
      player_id: 2,
      game_id: GameAPI.GAME_ID,
      device: "mobile",
      lang: "en",
      currency: "USD",
      quit_link: "www.quit.com",
      is_demo: 0,
      free_spin: "1",
      session: "623a9cd6-0d55-46ce-9016-36f7ea2de678",
      player_name: "test",
      modify_uid: "111",
    };

    const headers = {
      "Content-Type": "application/json",
      Accept: "*/*",
      Connection: "keep-alive",
      "Accept-Encoding": "gzip, deflate, br",
      "x-access-token":
        "taVHVt4xD8NLwvlo3TgExmiSaGOiuiKAeGB9Qwla6XKpmSRMUwy2pZuuYJYNqFLr",
      "x-brand": "6194bf3a-b863-4302-b691-9cc8fe9b56c8",
    };

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        //console.error('Response error text:', errorText);
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`,
        );
      }

      const data = await response.json();

      return {
        url: data.data.url,
        token: data.data.token,
      };
    } catch (error) {
      //console.error('Error generating game URL:', error);
      throw error;
    }
  }

  /**
   * Initialize the game with token generation
   * This method should be called when the game starts to get the game token
   * Only generates a new token if token URL parameter is not present
   */
  public async initializeGame(): Promise<string> {
    const isDemo = this.getDemoState();
    localStorage.setItem("demo", isDemo ? "true" : "false");
    sessionStorage.setItem("demo", isDemo ? "true" : "false");

    if (this.isSampleDataEnabled()) {
      return "";
    }
    if (isDemo) {
      return "";
    }

    try {
      // Initialize refresh token from URL at startup (alongside access token)
      this.initializeRefreshToken();

      // Check if token is already in the URL parameters
      const existingToken = getUrlParameter("token");

      if (existingToken) {
        // Store the existing token in localStorage and sessionStorage
        localStorage.setItem("token", existingToken);
        sessionStorage.setItem("token", existingToken);

        return existingToken;
      } else {
        const { token } = await this.generateGameUrlToken();

        // Store the token in localStorage and sessionStorage
        localStorage.setItem("token", token);
        sessionStorage.setItem("token", token);

        return token;
      }
    } catch (error) {
      console.error("Error initializing game:", error);
      throw error;
    }
  }

  /**
   * Call the backend game initialization endpoint.
   * This should be called once at the very start of the game after the token is available.
   * Change Currency and Language as needed.
   */
  public async initializeSlotSession(): Promise<SlotInitializeData> {
    // Demo mode: don't call backend; return a minimal safe payload and cache it.
    const isDemo =
      this.getDemoState() ||
      localStorage.getItem("demo") === "true" ||
      sessionStorage.getItem("demo") === "true";
    if (this.isSampleDataEnabled() || isDemo) {
      const payload: SlotInitializeData = {
        gameId: GameAPI.GAME_ID,
        playerId: "",
        sessionId: "",
        lang: "en",
        currency: "USD",
        currencySymbol: "$",
        hasFreeSpinRound: false,
        freeSpinRound: {},
        hasUnresolvedSpin: false,
        unresolvedSpinIndex: 0,
        unresolvedSpin: null,
      };
      this.initializationData = payload;
      this.remainingInitFreeSpins = 0;
      this.initFreeSpinBet = null;
      this.initializationUnresolvedConsumed = false;
      this.unresolvedPatchTerminal = false;
      return payload;
    }

    let token =
      localStorage.getItem("token") || sessionStorage.getItem("token") || "";

    if (!token) {
      const newToken = await this.tryRefreshAndGetNewToken();
      if (newToken) {
        token = newToken;
      } else {
        this.showTokenExpiredPopup();
        throw new Error(
          "No game token available. Please initialize the game first.",
        );
      }
    }

    const apiUrl = `${getApiBaseUrl()}/api/v1/slots/initialize`;

    const doRequest = (authToken: string) =>
      fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });

    let response = await doRequest(token);
    if (response.status === 401 || response.status === 400) {
      const newToken = await this.tryRefreshAndGetNewToken();
      if (newToken) {
        response = await doRequest(newToken);
      }
    }

    try {
      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401 || response.status === 400) {
          this.showTokenExpiredPopup();
          localStorage.removeItem("token");
          sessionStorage.removeItem("token");
        }
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`,
        );
      }

      const raw = await response.json();
      const payload: SlotInitializeData = raw && raw.data ? raw.data : raw;
      // TEMP: force currency in normal (auth) mode for testing (comment out when done).
      // payload.currency = 'EUR';
      // payload.currencySymbol = '€';

      // // TEST OVERRIDE: force free spin round for local testing with new format.
      // // Remove or comment this block out for production.
      // payload.hasFreeSpinRound = true;
      // payload.freeSpinRound = [
      //     {
      //         bet: '10.00',
      //         totalFreeSpin: 2,
      //         usedFreeSpin: 0,
      //         remainingFreeSpin: 2
      //     }
      // ];

      // Cache the initialization data for later retrieval
      this.initializationData = payload;
      // Initialize remaining free spin rounds from init data (if provided)
      this.remainingInitFreeSpins = this.extractRemainingInitFreeSpins(payload);
      // New slot init payload should reset unresolved-spin fallback consumption.
      this.initializationUnresolvedConsumed = false;
      this.unresolvedPatchTerminal = false;

      return payload;
    } catch (error) {
      console.error(
        "[GameAPI] Error calling slots initialize endpoint:",
        error,
      );
      if (this.isTokenExpiredError(error)) {
        this.showTokenExpiredPopup();
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
      }
      throw error;
    }
  }

  /**
   * Helper to extract the remaining free spins from the initialization payload,
   * supporting both the legacy numeric format and the new array format.
   */
  private extractRemainingInitFreeSpins(
    payload: SlotInitializeData | null,
  ): number {
    if (
      !payload ||
      !payload.hasFreeSpinRound ||
      payload.freeSpinRound == null
    ) {
      return 0;
    }

    const fs: any = payload.freeSpinRound;
    if (typeof fs === "number") {
      return fs;
    }

    if (Array.isArray(fs) && fs.length > 0) {
      const first = fs[0] as InitFreeSpinRound;
      if (typeof first.remainingFreeSpin === "number") {
        return first.remainingFreeSpin;
      }
      if (
        typeof first.totalFreeSpin === "number" &&
        typeof first.usedFreeSpin === "number"
      ) {
        return Math.max(0, first.totalFreeSpin - first.usedFreeSpin);
      }
    }

    return 0;
  }

  /**
   * Get the cached initialization data, if available.
   */
  public getInitializationData(): SlotInitializeData | null {
    return this.initializationData;
  }

  /**
   * Set or clear unresolved-spin UUID from runtime spin data.
   */
  public setUnresolvedSpinUuid(uuid?: string | null): void {
    if (typeof uuid === "string" && uuid.length > 0) {
      this.unresolvedSpinUuid = uuid;
      this.unresolvedPatchTerminal = false;
      return;
    }
    this.unresolvedSpinUuid = null;
  }

  /**
   * Mark initialization unresolved-spin payload as consumed so it is not reused
   * for future bonus rounds within the same client session.
   */
  public markInitializationUnresolvedSpinConsumed(): void {
    this.initializationUnresolvedConsumed = true;
    if (this.initializationData) {
      this.initializationData.hasUnresolvedSpin = false;
      this.initializationData.unresolvedSpinIndex = 0;
      this.initializationData.unresolvedSpin = null;
    }
  }

  /**
   * Resolve unresolved-spin UUID used for PATCH updates during bonus mode.
   * Runtime UUID (from spin payload) takes precedence over initialization payload.
   */
  public getUnresolvedSpinUuid(): string | null {
    if (typeof this.unresolvedSpinUuid === "string" && this.unresolvedSpinUuid.length > 0) {
      return this.unresolvedSpinUuid;
    }
    if (this.initializationUnresolvedConsumed) {
      return null;
    }
    const fromInit = (this.initializationData as any)?.unresolvedSpin?.uuid;
    return typeof fromInit === "string" && fromInit.length > 0 ? fromInit : null;
  }

  /**
   * PATCH unresolved-spin endpoint once per completed free spin during bonus.
   */
  public async patchUnresolvedSpin(currentWin?: number): Promise<void> {
    if (this.unresolvedPatchTerminal) return;

    const uuid = this.getUnresolvedSpinUuid();
    if (!uuid) return;

    const token =
      localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    if (!token) {
      console.warn("[GameAPI] patchUnresolvedSpin skipped (no token)");
      return;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    let body: string | undefined;
    if (typeof currentWin === "number" && Number.isFinite(currentWin)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ current_win: currentWin });
    }

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/v1/unresolved-spin/${uuid}`,
        {
          method: "PATCH",
          headers,
          body,
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        if (
          response.status === 404 ||
          response.status === 410 ||
          response.status === 422
        ) {
          // Backend no longer recognizes this unresolved resource; stop retrying this UUID.
          this.unresolvedPatchTerminal = true;
          this.setUnresolvedSpinUuid(null);
          this.markInitializationUnresolvedSpinConsumed();
          console.info(
            "[GameAPI] patchUnresolvedSpin terminal response; clearing unresolved tracking:",
            response.status,
            text,
          );
          return;
        }
        console.warn("[GameAPI] patchUnresolvedSpin failed:", response.status, text);
      }
    } catch (error) {
      console.warn("[GameAPI] patchUnresolvedSpin error:", error);
    }
  }

  /**
   * Get the remaining free spin rounds from initialization (derived from payload).
   */
  public getRemainingInitFreeSpins(): number {
    return this.remainingInitFreeSpins;
  }

  /**
   * Get the bet size associated with initialization free spins, if available.
   */
  public getInitFreeSpinBet(): number | null {
    // Prefer cached value if already extracted
    if (this.initFreeSpinBet != null) {
      return this.initFreeSpinBet;
    }

    const payload = this.initializationData;
    if (
      !payload ||
      !payload.hasFreeSpinRound ||
      payload.freeSpinRound == null
    ) {
      return null;
    }

    const fs: any = payload.freeSpinRound;
    if (Array.isArray(fs) && fs.length > 0) {
      const first = fs[0] as InitFreeSpinRound;
      if (typeof first.bet === "string") {
        const parsed = parseFloat(first.bet);
        if (!isNaN(parsed)) {
          this.initFreeSpinBet = parsed;
          return parsed;
        }
      }
    }

    return null;
  }

  public async gameLauncher(): Promise<void> {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("exit_url");
      localStorage.removeItem("what_device");
      localStorage.removeItem("demo");

      sessionStorage.removeItem("token");
      sessionStorage.removeItem("exit_url");
      sessionStorage.removeItem("what_device");
      sessionStorage.removeItem("demo");

      let token1 = "";
      let tokenParam = getUrlParameter("token");

      if (tokenParam) {
        token1 = tokenParam;
        localStorage.setItem("token", token1);
        sessionStorage.setItem("token", token1);
      }

      let deviceUrl = getUrlParameter("device");
      if (deviceUrl) {
        localStorage.setItem("what_device", deviceUrl);
        sessionStorage.setItem("what_device", deviceUrl);
      }

      let apiUrl = getUrlParameter("api_exit");
      if (apiUrl) {
        this.exitURL = apiUrl;
        localStorage.setItem("exit_url", apiUrl);
        sessionStorage.setItem("exit_url", apiUrl);
      }

      let startGame = getUrlParameter("start_game");
      if (startGame) {
        let { token } = await this.generateGameUrlToken();
        token1 = token;
        localStorage.setItem("token", token);
        sessionStorage.setItem("token", token);
      }

      if (!token1 && !startGame) {
        throw new Error();
      }
    } catch (error) {
      throw new Error();
    }
  }
  public async getBalance(): Promise<any> {
    // Demo mode: return mock balance, no API call, no token requirement.
    const isDemo =
      this.getDemoState() ||
      localStorage.getItem("demo") === "true" ||
      sessionStorage.getItem("demo") === "true";
    if (this.isSampleDataEnabled() || isDemo) {
      return {
        data: {
          balance: GameAPI.DEMO_BALANCE,
        },
      };
    }

    try {
      let token =
        localStorage.getItem("token") || sessionStorage.getItem("token") || "";
      if (!token) {
        const newToken = await this.tryRefreshAndGetNewToken();
        if (newToken) {
          token = newToken;
        } else {
          this.showTokenExpiredPopup();
          throw new Error("No authentication token available");
        }
      }

      const doRequest = (authToken: string) =>
        fetch(`${getApiBaseUrl()}/api/v1/slots/balance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
        });

      let response = await doRequest(token);
      if (response.status === 401 || response.status === 400) {
        const newToken = await this.tryRefreshAndGetNewToken();
        if (newToken) {
          response = await doRequest(newToken);
        }
      }

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        if (response.status === 400 || response.status === 401) {
          this.showTokenExpiredPopup();
          localStorage.removeItem("token");
          sessionStorage.removeItem("token");
        }
        throw error;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error in getBalance:", error);
      if (this.isTokenExpiredError(error)) {
        this.showTokenExpiredPopup();
      }
      throw error;
    }
  }

  /**
   * Show token expired popup to the user
   */
  private showTokenExpiredPopup(): void {
    try {
      // Find the game scene using phaserGame (as set in main.ts line 238)
      const gameScene = (window as any).phaserGame?.scene?.getScene("Game");
      if (gameScene) {
        // Import dynamically to avoid circular dependency
        import("../game/components/TokenExpiredPopup")
          .then((module) => {
            const TokenExpiredPopup = module.TokenExpiredPopup;
            const popup = new TokenExpiredPopup(gameScene as any);
            popup.show();
          })
          .catch(() => {});
      } else {
        console.error("Game scene not found. Cannot show token expired popup.");
      }
    } catch (e) {}
  }

  /**
   * Check if an error is related to token expiration
   */
  private isTokenExpiredError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || "";
    return (
      errorMessage.includes("token") ||
      errorMessage.includes("expired") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("auth") ||
      errorMessage.includes("jwt") ||
      errorMessage.includes("session") ||
      errorMessage.includes("401") ||
      errorMessage.includes("403")
    );
  }

  /**
   * Determine if an HTTP failure should be treated as an auth/session expiry issue.
   * Some endpoints may return 400 for auth problems, so we only classify 400 as auth
   * when the backend message explicitly indicates token/session/authentication failure.
   * HARDENING NOTE: This helper was added for "session expired" false-positive protection.
   * To roll back to legacy behavior, remove this helper and treat all 400 as auth failures.
   */
  private isAuthHttpFailure(status: number, errorText: string = ""): boolean {
    if (status === 401 || status === 403) {
      return true;
    }
    if (status !== 400) {
      return false;
    }
    const msg = (errorText || "").toLowerCase();
    return (
      msg.includes("token") ||
      msg.includes("expired") ||
      msg.includes("unauthorized") ||
      msg.includes("auth") ||
      msg.includes("jwt") ||
      msg.includes("session")
    );
  }

  /**
   * Handle session timeout triggered by an idle manager or similar.
   * Shows the token-expired popup and clears auth tokens from storage.
   */
  public handleSessionTimeout(): void {
    try {
      this.showTokenExpiredPopup();
    } catch (e) {
      console.error("[GameAPI] Failed to show session timeout popup:", e);
    }
    try {
      localStorage.removeItem("token");
    } catch {}
    try {
      localStorage.removeItem(GameAPI.REFRESH_TOKEN_KEY);
    } catch {}
    try {
      sessionStorage.removeItem("token");
    } catch {}
    try {
      sessionStorage.removeItem(GameAPI.REFRESH_TOKEN_KEY);
    } catch {}
  }

  /**
   * Initialize refresh token from URL query parameter.
   * Call at startup alongside access token initialization.
   */
  public initializeRefreshToken(): void {
    const refreshToken = getUrlParameter("refresh_token");
    if (refreshToken) {
      localStorage.setItem(GameAPI.REFRESH_TOKEN_KEY, refreshToken);
      sessionStorage.setItem(GameAPI.REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  /**
   * Obtain a new access token using the stored refresh token.
   * Persists the new token and returns it. Throws on failure.
   */
  public async refreshAccessToken(): Promise<string> {
    const refreshToken =
      localStorage.getItem(GameAPI.REFRESH_TOKEN_KEY) ||
      sessionStorage.getItem(GameAPI.REFRESH_TOKEN_KEY) ||
      "";
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }
    const apiUrl = `${getApiBaseUrl()}/api/v1/refresh_token`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken } as RefreshTokenRequest),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Refresh failed: ${response.status}, ${errorText}`);
    }
    const raw = (await response.json()) as RefreshTokenResponse;
    const newToken = raw?.data?.token ?? raw?.token ?? "";
    if (!newToken) {
      throw new Error("Refresh response missing token");
    }
    localStorage.setItem("token", newToken);
    sessionStorage.setItem("token", newToken);
    return newToken;
  }

  /**
   * Try to refresh and get a new token. Returns null on any error.
   */
  private async tryRefreshAndGetNewToken(): Promise<string | null> {
    try {
      return await this.refreshAccessToken();
    } catch (e) {
      console.warn("[GameAPI] Refresh token failed:", e);
      return null;
    }
  }

  /**
   * 2. Post a spin request to the server
   * This method sends a spin request and returns the server response
   */
  public async doSpin(bet: number, isBuyFs: boolean, isEnhancedBet: boolean, isFs: boolean = false, buyFeat?: number): Promise<SpinData> {
    // Optional debug helper: first manual spin returns mocked data with 3 scatters
    // Manual spin heuristic: not autoplaying and not an autoplay-requested spin.
    // Also exclude buy feature spins and initialization free rounds.
    if (
      GameAPI.MOCK_FIRST_MANUAL_SCATTER_SPIN_ENABLED &&
      !this.mockedFirstManualScatterSpin &&
      !gameStateManager.isBonus &&
      !gameStateManager.isAutoPlaying &&
      !gameStateManager.isAutoPlaySpinRequested &&
      !isBuyFs &&
      !isFs
    ) {
      this.mockedFirstManualScatterSpin = true;
      const mock = this.createMockFirstManualScatterSpinData(bet);
      this.currentSpinData = mock;
      return this.currentSpinData;
    }

    // SAMPLE DATA MODE: load data from src/game/spinDataSample/*.json
    if (this.isSampleDataEnabled()) {
      const sampleData = await this.loadSampleData();
      if (sampleData) {
        const listData = this.getSampleListData(sampleData);
        if (listData) {
          const useBonusList = !!gameStateManager.isBonus || isBuyFs;
          let sampleSpin = this.getNextSampleSpinFromList(
            useBonusList,
            bet,
            listData,
          );
          if (!sampleSpin && isBuyFs) {
            sampleSpin = this.getNextSampleSpinFromList(false, bet, listData);
          }
          if (sampleSpin) {
            this.currentSpinData = sampleSpin;
            return this.currentSpinData;
          }
        } else {
          const sampleSpin = this.buildSampleSpinFromSingle(bet, sampleData);
          if (sampleSpin) {
            this.currentSpinData = sampleSpin;
            return this.currentSpinData;
          }
        }
      }
    }

    // Demo mode: no token required, use analytics endpoint and simplified payload.
    const isDemo =
      this.getDemoState() ||
      localStorage.getItem("demo") === "true" ||
      sessionStorage.getItem("demo") === "true";
    if (isDemo) {
      try {
        const resolvedBuyFeat = isBuyFs ? (buyFeat ?? 1) : undefined;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const token = localStorage.getItem("token");
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const url = `${getApiBaseUrl()}/api/v1/analytics/spin`;
        const requestBody: Record<string, unknown> = {
          bet: bet.toString(),
          gameId: GameAPI.GAME_ID,
          isEnhancedBet: isEnhancedBet,
          isFs: false,
        };
        if (resolvedBuyFeat !== undefined) {
          requestBody.buyFeat = resolvedBuyFeat;
        }

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HTTP error! status: ${response.status}, message: ${errorText}`,
          );
        }

        const responseData = await response.json();

        // Ensure bet is included in the response data (server might not return it)
        if (!responseData.bet) {
          responseData.bet = bet.toString();
        }
        if (isBuyFs) {
          console.log("[DEMO_SPIN_DATA]", responseData);
        }

        this.currentSpinData = responseData as SpinData;
        return this.currentSpinData;
      } catch (error) {
        console.error("Error in doSpin (demo):", error);
        throw error;
      }
    }

    let token =
      localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    if (!token) {
      const newToken = await this.tryRefreshAndGetNewToken();
      if (newToken) {
        token = newToken;
      } else {
        this.showTokenExpiredPopup();
        throw new Error(
          "No game token available. Please initialize the game first.",
        );
      }
    }

    try {
      const resolvedBuyFeat = isBuyFs ? (buyFeat ?? 1) : undefined;
      // Determine whether this spin should be treated as a free spin round from initialization.
      // We only consume these free rounds for normal spins (not Buy Feature spins).
      // Override isFs if we have remaining initialization free spins
      if (!isBuyFs && this.remainingInitFreeSpins > 0) {
        isFs = true;
        this.remainingInitFreeSpins--;
      }

      const requestBody: Record<string, unknown> = {
        action: "spin",
        bet: bet.toString(),
        line: 1, // Try different line count
        isEnhancedBet: isEnhancedBet, // Use the parameter value
        // Mark whether this spin is using a free spin round granted at initialization
        isFs: isFs,
      };
      if (resolvedBuyFeat !== undefined) {
        requestBody.buyFeat = resolvedBuyFeat;
      }

      const doRequest = (authToken: string) =>
        fetch(`${getApiBaseUrl()}/api/v1/slots/bet`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(requestBody),
        });

      let response = await doRequest(token);
      // SESSION-EXPIRED HARDENING:
      // Retry refresh only for auth-like failures (401/403 or auth-indicated 400),
      // not for every 400 validation/business error.
      let shouldRetryWithRefresh = response.status === 401;
      if (!shouldRetryWithRefresh && response.status === 400) {
        const probeText = await response
          .clone()
          .text()
          .catch(() => "");
        shouldRetryWithRefresh = this.isAuthHttpFailure(
          response.status,
          probeText,
        );
      }
      if (shouldRetryWithRefresh) {
        const newToken = await this.tryRefreshAndGetNewToken();
        if (newToken) {
          token = newToken;
          response = await doRequest(token);
        }
      }

      if (!response.ok) {
        const errorText = await response.text();

        // Special handling for 422 "No valid freespins available" during free spin rounds
        // This means the free spins have ended, so we should treat it as a graceful completion
        if (
          response.status === 422 &&
          isFs &&
          errorText.includes("No valid freespins available")
        ) {
          // Reset the remaining free spins counter
          this.remainingInitFreeSpins = 0;

          // Clear the isInFreeSpinRound flag
          import("../managers/GameStateManager")
            .then((module) => {
              const { gameStateManager } = module;
              (gameStateManager as any).isInFreeSpinRound = false;
            })
            .catch((err) => {});

          // Emit event to update the FreeRoundManager with count 0 to trigger completion
          import("../event/EventManager")
            .then((module) => {
              const { gameEventManager, GameEventType } = module;
              gameEventManager.emit(
                GameEventType.FREEROUND_COUNT_UPDATE,
                0 as any,
              );
            })
            .catch((err) => {});

          // Return null to signal that no spin data is available (free spins ended)
          return null as any;
        }

        const error = new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`,
        );

        // SESSION-EXPIRED HARDENING:
        // Show token expired popup only for auth-like failures.
        // Legacy behavior showed popup for all 400 responses.
        if (this.isAuthHttpFailure(response.status, errorText)) {
          this.showTokenExpiredPopup();
          localStorage.removeItem("token");
          sessionStorage.removeItem("token");
        }

        throw error;
      }

      const responseData = await response.json();

      // If this spin was a free spin (isFs === true), check for fsCount in response
      // and emit an event to update the FreeRoundManager display
      if (isFs && typeof responseData.fsCount === "number") {
        // Keep local initialization free-spin tracker aligned with backend state.
        this.remainingInitFreeSpins = responseData.fsCount;
        // Import gameEventManager dynamically to emit the event
        import("../event/EventManager")
          .then((module) => {
            const { gameEventManager, GameEventType } = module;
            // Emit event with the fsCount from backend
            gameEventManager.emit(
              GameEventType.FREEROUND_COUNT_UPDATE,
              responseData.fsCount,
            );
          })
          .catch((err) => {});
      }

      // Ensure bet is included in the response data (server might not return it)
      if (!responseData.bet) {
        responseData.bet = bet.toString();
      }

      // 3. Store the spin data to SpinData.ts
      // If this response contains free spin data, save it for bonus mode

      if (
        responseData.slot &&
        (responseData.slot.freespin?.items || responseData.slot.freeSpin?.items)
      ) {
        const items =
          responseData.slot.freespin?.items ||
          responseData.slot.freeSpin?.items;

        if (
          gameStateManager.isBonus &&
          this.currentSpinData &&
          (this.currentSpinData.slot?.freespin?.items ||
            this.currentSpinData.slot?.freeSpin?.items)
        ) {
          // During bonus, prefer to keep original items unless the server indicates a retrigger
          try {
            const currentItems =
              this.currentSpinData.slot?.freespin?.items ||
              this.currentSpinData.slot?.freeSpin?.items ||
              [];
            const currentMaxSpinsLeft = currentItems.reduce(
              (m: number, it: any) => Math.max(m, Number(it?.spinsLeft || 0)),
              0,
            );
            const nextMaxSpinsLeft = items.reduce(
              (m: number, it: any) => Math.max(m, Number(it?.spinsLeft || 0)),
              0,
            );
            const hasMoreItems = items.length > currentItems.length;
            const hasMoreSpinsLeft = nextMaxSpinsLeft > currentMaxSpinsLeft;

            if (hasMoreItems || hasMoreSpinsLeft) {
              applyTruncateFreeSpinItems((responseData as any).slot);
              this.currentSpinData = responseData as SpinData;
            } else {
            }
          } catch (e) {}
        } else {
          applyTruncateFreeSpinItems((responseData as any).slot);
          this.currentSpinData = responseData as SpinData;
        }
      } else if (
        gameStateManager.isBonus &&
        this.currentSpinData &&
        (this.currentSpinData.slot?.freespin?.items ||
          this.currentSpinData.slot?.freeSpin?.items)
      ) {
        // Don't overwrite the original free spin data - keep it for simulation
      } else {
        applyTruncateFreeSpinItems((responseData as any).slot);
        this.currentSpinData = responseData as SpinData;
      }

      return this.currentSpinData;
    } catch (error) {
      console.error("Error in doSpin:", error);

      // Handle network errors or other issues
      if (this.isTokenExpiredError(error)) {
        this.showTokenExpiredPopup();
      }

      throw error;
    }
  }

  /**
   * Simulate a free spin using pre-determined data from SpinData.freespin.items
   * This method uses the area and paylines from the freespin items instead of calling the API
   */
  public async simulateFreeSpin(): Promise<SpinData> {
    const logFreeSpinItem = (items: any[], spinData: SpinData): void => {
      try {
        if (!Array.isArray(items) || !spinData?.slot?.area) return;
        const areaJson = JSON.stringify(spinData.slot.area);
        let idx = items.findIndex(
          (item: any) =>
            Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson,
        );
        if (idx < 0) {
          const fallbackIdx = Math.max(0, this.currentFreeSpinIndex - 1);
          if (items[fallbackIdx]) idx = fallbackIdx;
        }
        if (idx < 0) return;

        let runningTotal = 0;
        for (let i = 0; i <= idx; i++) {
          const raw = items[i]?.totalWin ?? items[i]?.subTotalWin ?? 0;
          const win = Number(raw);
          if (Number.isFinite(win)) runningTotal += win;
        }

        const spinsLeft =
          items[idx]?.spinsLeft === undefined || items[idx]?.spinsLeft === null
            ? "?"
            : items[idx]?.spinsLeft;
        const isMaxWin = items[idx]?.isMaxWin === true;
        console.log(
          `[FREESPIN SPINSLEFT] spinsLeft=${spinsLeft} ` +
            `accumulatedTotalWin=${runningTotal}, isMaxWin=${isMaxWin}`,
        );
      } catch {}
    };

    // Sample data mode: use freeSpin items when present; otherwise return list-based bonus entries.
    if (this.isSampleDataEnabled()) {
      const sampleData = await this.loadSampleData();
      if (sampleData) {
        const listData = this.getSampleListData(sampleData);
        if (listData) {
          const bonusEntry = Array.isArray(listData.bonusGame)
            ? listData.bonusGame[0]
            : null;
          const listItems =
            bonusEntry?.slot?.freespin?.items ||
            bonusEntry?.slot?.freeSpin?.items;

          if (Array.isArray(listItems) && listItems.length > 0) {
            const baseSpin = (this.currentSpinData || bonusEntry) as SpinData;
            const fsSpin = this.buildFreeSpinFromItems(listItems, baseSpin);
            logFreeSpinItem(listItems, fsSpin);
            return fsSpin;
          }

          const betValue = Number(this.currentSpinData?.bet || 0) || 0;
          const listSpin = this.getNextSampleSpinFromList(
            true,
            betValue,
            listData,
          );
          if (listSpin) {
            this.currentSpinData = listSpin;
            return listSpin;
          }
        } else {
          const baseBet = Number(this.currentSpinData?.bet || 0) || 0;
          const baseSpin = (this.currentSpinData ||
            this.buildSampleSpinFromSingle(baseBet, sampleData) ||
            sampleData) as SpinData;
          const items =
            baseSpin?.slot?.freespin?.items ??
            (baseSpin as any)?.slot?.freeSpin?.items ??
            sampleData?.slot?.freespin?.items ??
            sampleData?.slot?.freeSpin?.items;
          if (Array.isArray(items) && items.length > 0) {
            const fsSpin = this.buildFreeSpinFromItems(items, baseSpin);
            logFreeSpinItem(items, fsSpin);
            return fsSpin;
          }
        }
      }
    }

    if (
      !this.currentSpinData ||
      (!this.currentSpinData.slot?.freespin?.items &&
        !this.currentSpinData.slot?.freeSpin?.items)
    ) {
      console.error(
        "[GameAPI] No free spin data available. Current spin data:",
        this.currentSpinData,
      );
      console.error(
        "[GameAPI] Available freespin data:",
        this.currentSpinData?.slot?.freespin,
      );
      throw new Error(
        "No free spin data available. Please ensure SpinData contains freespin items.",
      );
    }

    const freespinData =
      this.currentSpinData.slot.freespin || this.currentSpinData.slot.freeSpin;
    const items = freespinData.items;

    // Play spin sound effect for free spin simulation
    if ((window as any).audioManager) {
      (window as any).audioManager.playSoundEffect(SoundEffectType.SPIN);
    }
    const fsSpin = this.buildFreeSpinFromItems(items, this.currentSpinData);
    logFreeSpinItem(items, fsSpin);
    return fsSpin;
  }

  /**
   * Get the current spin data
   * Returns the last spin data that was received from the server
   */
  public getCurrentSpinData(): SpinData | null {
    return this.currentSpinData;
  }

  public isFakeDataEnabled(): boolean {
    return this.isSampleDataEnabled();
  }

  /**
   * Reset the free spin index when starting a new scatter bonus
   * This should be called when a new scatter bonus is triggered
   */
  public resetFreeSpinIndex(): void {
    this.currentFreeSpinIndex = 0;
  }

  /**
   * Set the current free spin index explicitly (used for unresolved-spin resume).
   */
  public setCurrentFreeSpinIndex(index: number): void {
    const safe = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
    this.currentFreeSpinIndex = safe;
  }

  /**
   * Clear the current spin data
   * Useful for resetting state between spins
   */
  public clearCurrentSpinData(): void {
    this.currentSpinData = null;
  }

  /**
   * Set the free spin data for simulation
   * This method should be called when free spins are triggered to provide the data for simulation
   */
  public setFreeSpinData(spinData: SpinData): void {
    try {
      applyTruncateFreeSpinItems((spinData as any)?.slot);
    } catch { }
    this.currentSpinData = spinData;
    this.resetFreeSpinIndex(); // Reset the index when setting new data
  }

  /**
   * Initialize the player's balance on game start
   * This method calls getBalance and updates the GameData with the current balance
   */
  public async initializeBalance(): Promise<number> {
    const isDemo =
      this.getDemoState() ||
      localStorage.getItem("demo") === "true" ||
      sessionStorage.getItem("demo") === "true";
    if (this.isSampleDataEnabled() || isDemo) {
      return GameAPI.DEMO_BALANCE;
    }

    try {
      const balanceResponse = await this.getBalance();

      // Extract balance from response - adjust this based on actual API response structure
      let balance = 0;
      if (
        balanceResponse &&
        balanceResponse.data &&
        balanceResponse.data.balance !== undefined
      ) {
        balance = parseFloat(balanceResponse.data.balance);
      } else if (balanceResponse && balanceResponse.balance !== undefined) {
        balance = parseFloat(balanceResponse.balance);
      } else {
        // Fallback to a default balance if structure is unexpected
        balance = 0;
      }

      return balance;
    } catch (error) {
      console.error("[GameAPI] Error initializing balance:", error);
      // Return a default balance if API call fails
      const defaultBalance = 0;
      return defaultBalance;
    }
  }

  public async getHistory(page: number, limit: number): Promise<any> {
    // Demo mode: return empty history without API calls.
    const isDemo = this.getDemoState();
    if (this.isSampleDataEnabled() || isDemo) {
      return {
        data: [],
        meta: {
          page: 1,
          pageCount: 1,
          totalPages: 1,
          total: 0,
        },
      };
    }

    let token =
      localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    if (!token) {
      const newToken = await this.tryRefreshAndGetNewToken();
      if (newToken) {
        token = newToken;
      } else {
        this.showTokenExpiredPopup();
        throw new Error("No authentication token available");
      }
    }

    const apiUrl = `${getApiBaseUrl()}/api/v1/games/me/histories`;
    const doRequest = (authToken: string) =>
      fetch(`${apiUrl}?limit=${limit}&page=${page}&_ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Authorization: `Bearer ${authToken}`,
        },
      });

    let response = await doRequest(token);
    if (response.status === 401 || response.status === 400) {
      const newToken = await this.tryRefreshAndGetNewToken();
      if (newToken) {
        response = await doRequest(newToken);
      }
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 400) {
        this.showTokenExpiredPopup();
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
      }
      const errorText = await response.text();
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`,
      );
    }

    const data = await response.json();
    return data;
  }

  /**
   * Get the demo state from URL parameters
   * @returns The value of the 'demo' URL parameter, or false if not found
   */
  public getDemoState(): boolean | false {
    const demoValue = getUrlParameter("demo") === "true";
    return demoValue;
  }

  /**
   * Get the game ID constant
   */
  public getGameId(): string {
    return GameAPI.GAME_ID;
  }

  /**
   * Get the demo balance constant
   */
  public getDemoBalance(): number {
    return GameAPI.DEMO_BALANCE;
  }

  /**
   * Update the demo balance value
   */
  public updateDemoBalance(newBalance: number): void {
    GameAPI.DEMO_BALANCE = newBalance;
  }
}
