/**
 * Localization Manager
 * Handles loading and resolving localized text by key.
 */
export class LocalizationManager {
	private static instance: LocalizationManager;

	/** key → localized string (for the current language) */
	private translations: Record<string, string> = {};

	private constructor() {}

	public static getInstance(): LocalizationManager {
		if (!LocalizationManager.instance) {
			LocalizationManager.instance = new LocalizationManager();
		}
		return LocalizationManager.instance;
	}

	/**
	 * Looks up a localized string by key.
	 * @param key - The localization key to resolve
	 * @returns The localized string, or null if not found
	 */
	public getTextByKey(key: string): string | null {
		const value = this.translations[key];
		return value !== undefined ? value : null;
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
			result[key] = typeof value === 'string' ? value : String(value ?? '');
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
