/**
 * Localization Manager
 * Handles loading and resolving localized text by key.
 */
export class LocalizationManager {
	private static instance: LocalizationManager;

	/** key → localized string (for the current language) */
	private translations: Record<string, string> = {};
	private debug_mode = false;

	/**
	 * CMS / locale payloads often ship line breaks as the two-character sequence `\` + `n`
	 * instead of an actual newline after JSON.parse. Phaser (and HTML) need real `\n` / `\r\n`.
	 * Safe to run on strings that already use real newlines (no stray `\` + `n` pairs).
	 */
	public static normalizeTranslationLineBreaks(s: string): string {
		if (s.length === 0) return s;
		return s.replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n');
	}

	private constructor() {}

	public static getInstance(): LocalizationManager {
		if (!LocalizationManager.instance) {
			LocalizationManager.instance = new LocalizationManager();
			LocalizationManager.instance.readDebugModeFromUrl();
		}
		return LocalizationManager.instance;
	}

	private readDebugModeFromUrl(): void {
		if (typeof window === 'undefined') return;
		const params = new URLSearchParams(window.location.search);
		if (params.get('lang') === 'debug_mode') {
			this.debug_mode = true;
		}
	}

	/**
	 * Looks up a localized string by key.
	 * @param key - The localization key to resolve
	 * @returns The localized string, or null if not found
	 */
	public getTextByKey(key: string): string | null {
		if (this.debug_mode) {
			return key;
		}
		const value = this.translations[key];
		return value !== undefined ? LocalizationManager.normalizeTranslationLineBreaks(value) : null;
	}

	/**
	 * Sets the translations from a JSON string (key → localized string).
	 * Parses the JSON and converts it to Record<string, string>; non-string values are coerced to strings.
	 * @param json - JSON string e.g. '{"demo_key": "demo", "controller.turbo": "Turbo"}'
	 */
	public setTranslations(json: string): void {
		const parsed = JSON.parse(json) as Record<string, unknown>;
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			this.translations = {};
			return;
		}
		const result: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed)) {
			const raw = typeof value === 'string' ? value : String(value ?? '');
			result[key] = LocalizationManager.normalizeTranslationLineBreaks(raw);
		}
		this.translations = result;
	}

	/**
	 * Returns the current translations (read-only view).
	 */
	public getTranslations(): Record<string, string> {
		return { ...this.translations };
	}
}

export const localizationManager = LocalizationManager.getInstance();
