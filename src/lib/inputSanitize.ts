// Sanitizers applied on every input change (covers typed and pasted input,
// since a paste into a controlled React input fires the same onChange event
// with the full resulting value).

/** Strips everything but digits — for whole-number-only fields. */
export function sanitizeWholeNumberInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/**
 * Keeps digits and at most one decimal point, truncating the fractional
 * part to `maxDecimals` digits — for price/amount fields.
 */
export function sanitizeDecimalInput(raw: string, maxDecimals = 2): string {
  let cleaned = raw.replace(/[^\d.]/g, "");

  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }

  const [wholePart, fracPart] = cleaned.split(".");
  if (fracPart !== undefined) {
    cleaned = `${wholePart}.${fracPart.slice(0, maxDecimals)}`;
  }

  return cleaned;
}
