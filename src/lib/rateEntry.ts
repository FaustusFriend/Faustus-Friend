// Pure state model for the dual-entry exchange-rate control (Price / Item and
// its Items / Currency reciprocal). Kept out of the React component so the
// authoritative-rate rules can be unit-tested directly.
//
// The rule that matters for correctness: the field the user last edited is
// the single source of truth. The other field only ever shows a *display*
// reciprocal (rounded to 2dp for readability) — that displayed value is never
// promoted to the authoritative rate unless the user actually edits it. This
// is what lets an exact but repeating reciprocal (e.g. 1/13.95) drive the
// Trade Maximizer without ever being rounded into the calculation path.

import { type ExactExchangeRate, formatFraction, parseExactRate } from "./calculator";
import { sanitizeDecimalInput } from "./inputSanitize";

// A complete (non-partial) decimal — "1.60", "2", or ".5" — as opposed to a
// still-being-typed value like "1." or "" that shouldn't recalculate yet.
const COMPLETE_DECIMAL = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

export type RateMode = ExactExchangeRate["mode"];

export interface RateEntryState {
  /** The field the user last edited — the authoritative side. */
  mode: RateMode;
  /** Raw text shown in the Price / Item field. */
  priceText: string;
  /** Raw text shown in the Items / Currency field. */
  itemsText: string;
  /** The authoritative exact rate, or null when empty / incomplete / invalid. */
  rate: ExactExchangeRate | null;
  error: string | null;
}

export const emptyRateEntry: RateEntryState = {
  mode: "currencyPerItem",
  priceText: "",
  itemsText: "",
  rate: null,
  error: null,
};

function applyEntry(state: RateEntryState, mode: RateMode, raw: string): RateEntryState {
  const sanitized = sanitizeDecimalInput(raw, 2);
  const typedPrice = mode === "currencyPerItem";

  // Clearing either field resets the whole rate.
  if (sanitized === "") {
    return { ...emptyRateEntry, mode };
  }

  // The edited field always reflects exactly what was typed.
  const withSelf: RateEntryState = typedPrice
    ? { ...state, mode, priceText: sanitized }
    : { ...state, mode, itemsText: sanitized };

  // Mid-typing (e.g. "7."): keep the last authoritative rate and reciprocal
  // display, don't surface an error yet.
  if (!COMPLETE_DECIMAL.test(sanitized)) {
    return { ...withSelf, error: null };
  }

  const rate: ExactExchangeRate = typedPrice
    ? { mode: "currencyPerItem", value: sanitized }
    : { mode: "itemsPerCurrency", value: sanitized };
  const parsed = parseExactRate(rate);
  if (!parsed.ok) {
    return { ...withSelf, rate: null, error: parsed.error };
  }

  // Display-only reciprocal in the OTHER field (2dp, may be approximate/
  // repeating). currency/item = currencyAmount/itemAmount; items/currency is
  // the inverse. Never becomes authoritative.
  const { currencyAmount, itemAmount } = parsed.value;
  return typedPrice
    ? {
        mode,
        priceText: sanitized,
        itemsText: formatFraction(itemAmount, currencyAmount, 2),
        rate,
        error: null,
      }
    : {
        mode,
        priceText: formatFraction(currencyAmount, itemAmount, 2),
        itemsText: sanitized,
        rate,
        error: null,
      };
}

/** Applies an edit to the Price / Item field, making it authoritative. */
export function editPrice(state: RateEntryState, raw: string): RateEntryState {
  return applyEntry(state, "currencyPerItem", raw);
}

/** Applies an edit to the Items / Currency field, making it authoritative. */
export function editItems(state: RateEntryState, raw: string): RateEntryState {
  return applyEntry(state, "itemsPerCurrency", raw);
}
