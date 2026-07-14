// Path of Exile's trade chat can't parse a decimal point — it reads "1425.00"
// as "142500". Quick Calc's copy button must therefore always hand over
// whole-number digits only, while the UI still shows the exact calculated
// result so a fractional remainder is never silently dropped.

export interface QuickCalcResultParts {
  /** Whole-number digits only — safe to paste into Path of Exile's trade chat. */
  whole: string;
  /** False when the exact result carries a nonzero fractional remainder. */
  isWhole: boolean;
}

/**
 * Splits a `formatFraction`-style fixed-decimal string (e.g. "1425.00" or
 * "1425.37", as returned by {@link quickMultiply}) into its whole-number
 * digits and whether a fractional remainder exists. String-based only — no
 * `Number`/`parseFloat` — so the exact digits from the calculation engine
 * are never re-rounded here.
 */
export function splitQuickCalcResult(formatted: string): QuickCalcResultParts {
  const [wholePart, fracPart = ""] = formatted.split(".");
  return { whole: wholePart, isWhole: /^0*$/.test(fracPart) };
}
