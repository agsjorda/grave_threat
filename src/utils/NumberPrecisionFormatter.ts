const DEFAULT_DECIMAL_PLACES = 2;
const MIN_DISPLAY_DECIMAL_PLACES = 2;

let currentDecimalPlaces = DEFAULT_DECIMAL_PLACES;

/**
 * Sets the decimal places used by formatCurrencyNumber.
 * @param places - Number of decimal places (clamped 0–10, invalid ignored)
 */
export function setDecimalPlaces(places: number): void {
  if (!Number.isFinite(places)) {
    return;
  }
  const normalized = Math.max(0, Math.min(10, Math.floor(places)));
  currentDecimalPlaces = normalized;
}

export function getDecimalPlaces(): number {
  return currentDecimalPlaces;
}

/**
 * Formats a number with the specified decimal count.
 * @param value - The number to format
 * @param trimZeroValueDecimals - Whether to trim trailing zero decimals while preserving rule-based minimum decimals
 * @returns The formatted number string
 */
export function formatCurrencyNumber(
  value: number,
  trimZeroValueDecimals: boolean = false,
): string {
  const fixedValue = value.toFixed(currentDecimalPlaces);
  const roundedValue = Number(fixedValue);
  const decimalPart = fixedValue.split(".")[1] ?? "";
  const hasNonZeroTenths = decimalPart.length > 0 && decimalPart[0] !== "0";
  const ruleBasedMinDecimals = hasNonZeroTenths ? MIN_DISPLAY_DECIMAL_PLACES : 0;
  const baseMinDecimals = trimZeroValueDecimals ? 0 : MIN_DISPLAY_DECIMAL_PLACES;
  const minimumFractionDigits = Math.min(
    Math.max(baseMinDecimals, ruleBasedMinDecimals),
    currentDecimalPlaces,
  );

  const formattedWithComma = roundedValue.toLocaleString("en-US", {
    minimumFractionDigits,
    maximumFractionDigits: currentDecimalPlaces,
  });
  return formattedWithComma;
}
