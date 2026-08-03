// Pure calculator engine for the Buying/Selling/Currency Conversion tools.
// All trade math uses BigInt (integer cents / rational numerator-denominator
// pairs) so results never depend on JavaScript floating-point rounding.

export type CalcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function ok<T>(value: T): CalcResult<T> {
  return { ok: true, value };
}

function fail<T>(error: string): CalcResult<T> {
  return { ok: false, error };
}

// Accepts "5", "5.5", and leading-decimal notation ".5" (no digit before
// the point) — all are valid manual entries. Rejects a bare ".", a
// trailing-dot-no-digits form like "5.", multiple dots, and signs.
const DECIMAL_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

export interface ParsedDecimal {
  /** The decimal value scaled up to an integer, e.g. "1.60" -> 160n with decimals=2 */
  scaled: bigint;
  decimals: number;
}

/**
 * Exported (alongside {@link formatFraction}) so UI-layer components can
 * reuse the same decimal parsing/rounding rules — e.g. the dual-entry
 * exchange-rate input — without duplicating or diverging from this engine's
 * validation and rounding behavior. Not itself part of the trade
 * optimization algorithms.
 */
export function parseDecimal(
  input: string | number,
  fieldName: string,
  maxDecimals?: number,
): CalcResult<ParsedDecimal> {
  if (input === null || input === undefined) {
    return fail(`${fieldName} is required.`);
  }
  const trimmed = String(input).trim();
  if (trimmed.length === 0) {
    return fail(`${fieldName} is required.`);
  }
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return fail(`${fieldName} must be a positive number.`);
  }

  const [wholePart, fracPart = ""] = trimmed.split(".");
  if (maxDecimals !== undefined && fracPart.length > maxDecimals) {
    return fail(`${fieldName} supports at most ${maxDecimals} decimal place${maxDecimals === 1 ? "" : "s"}.`);
  }

  const decimals = fracPart.length;
  const scaled = BigInt(wholePart + fracPart);
  return ok({ scaled, decimals });
}

function parseWholeNumber(input: string | number, fieldName: string): CalcResult<bigint> {
  if (input === null || input === undefined) {
    return fail(`${fieldName} is required.`);
  }
  const trimmed = String(input).trim();
  if (trimmed.length === 0) {
    return fail(`${fieldName} is required.`);
  }
  if (!/^\d+$/.test(trimmed)) {
    return fail(`${fieldName} must be a whole number.`);
  }
  const value = BigInt(trimmed);
  if (value <= 0n) {
    return fail(`${fieldName} must be greater than zero.`);
  }
  return ok(value);
}

/**
 * Rounds numerator/denominator to `decimalPlaces` decimals (round-half-up)
 * and formats it as a display string, using only BigInt arithmetic.
 * Exported for reuse by UI-layer formatting (see {@link parseDecimal}).
 */
export function formatFraction(numerator: bigint, denominator: bigint, decimalPlaces = 2): string {
  if (denominator === 0n) return (0).toFixed(decimalPlaces);

  const negative = (numerator < 0n) !== (denominator < 0n);
  const numAbs = numerator < 0n ? -numerator : numerator;
  const denAbs = denominator < 0n ? -denominator : denominator;

  const scale = 10n ** BigInt(decimalPlaces);
  const scaledNumerator = numAbs * scale;
  let result = scaledNumerator / denAbs;
  const remainder = scaledNumerator % denAbs;
  if (remainder * 2n >= denAbs) {
    result += 1n;
  }

  const intPart = result / scale;
  const fracPart = result % scale;
  const sign = negative && result !== 0n ? "-" : "";
  return `${sign}${intPart}.${fracPart.toString().padStart(decimalPlaces, "0")}`;
}

/**
 * Parses a "Price per Item" input. Prices support at most 2 decimal places
 * and must be strictly greater than zero. Returns the price in integer cents.
 */
export function parsePricePerItem(input: string | number): CalcResult<bigint> {
  const parsed = parseDecimal(input, "Price per item", 2);
  if (!parsed.ok) return parsed;

  const scaleUp = 2 - parsed.value.decimals;
  const cents = parsed.value.scaled * 10n ** BigInt(scaleUp);

  if (cents <= 0n) {
    return fail("Price per item must be greater than zero.");
  }
  return ok(cents);
}

// --- Exact rational exchange rates -----------------------------------------

/**
 * An exchange rate exactly as the user entered it: the original decimal
 * string plus the direction it was typed in. It is never pre-converted into
 * a rounded price-per-item — the engine reduces it to an exact ratio itself,
 * so a repeating reciprocal (1/13.95, 1/1.53, …) is never lost.
 */
export type ExactExchangeRate =
  | { mode: "currencyPerItem"; value: string }
  | { mode: "itemsPerCurrency"; value: string };

/**
 * A rate reduced to its lowest-terms integer trade unit: `currencyAmount`
 * currency changes hands for exactly `itemAmount` items. Both are positive
 * and coprime. Every valid trade is a whole-number multiple of this unit,
 * which is what keeps the realized rate exactly faithful to the entered one.
 */
export interface TradeRatio {
  currencyAmount: bigint;
  itemAmount: bigint;
}

/** Greatest common divisor of two BigInts (Euclid), always returned positive. */
function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * Parses an {@link ExactExchangeRate} into a reduced {@link TradeRatio}.
 *
 * The decimal string is read straight into an exact numerator/denominator
 * pair — `"7.25"` becomes 725/100, reduced to 29/4 — using only BigInt
 * arithmetic. No Number, parseFloat, floating-point multiplication, or
 * rounded reciprocal is ever involved, so the ratio is exactly what the user
 * typed. The direction decides which side each part lands on: a
 * currency-per-item rate of a/b is `a` currency for `b` items; an
 * items-per-currency rate of a/b is its reciprocal, `b` currency for `a`
 * items.
 */
export function parseExactRate(rate: ExactExchangeRate): CalcResult<TradeRatio> {
  const fieldName = rate.mode === "currencyPerItem" ? "Price per item" : "Items per currency";
  const parsed = parseDecimal(rate.value, fieldName);
  if (!parsed.ok) return parsed;

  const numerator = parsed.value.scaled;
  if (numerator <= 0n) {
    return fail(`${fieldName} must be greater than zero.`);
  }
  const denominator = 10n ** BigInt(parsed.value.decimals);

  const divisor = gcdBigInt(numerator, denominator);
  const reducedNum = numerator / divisor;
  const reducedDen = denominator / divisor;

  return rate.mode === "currencyPerItem"
    ? ok({ currencyAmount: reducedNum, itemAmount: reducedDen })
    : ok({ currencyAmount: reducedDen, itemAmount: reducedNum });
}

export interface BuyTradeResult {
  /** Whole-number currency spent — a whole multiple of the unit's currency side, never over budget. */
  spend: number;
  /** Whole-number items received — the matching multiple of the unit's item side. */
  receive: number;
  /** Budget left over after `spend` (too little for another whole trade unit). */
  remainingCurrency: number;
}

/**
 * Buys the largest whole number of exact trade units that fits the budget.
 *
 * With a reduced unit of `C` currency for `I` items and a budget `B`, the
 * result is `batchCount = floor(B / C)` units: `spend = batchCount · C`,
 * `receive = batchCount · I`. Because both sides scale by the same whole
 * `batchCount`, `spend · I === receive · C` always holds — the realized rate
 * is exactly the entered rate, never an approximation of it.
 */
export function optimizeBuyTrade(
  currencyToSpend: string | number,
  rate: ExactExchangeRate,
): CalcResult<BuyTradeResult> {
  const budgetResult = parseWholeNumber(currencyToSpend, "Currency to spend");
  if (!budgetResult.ok) return budgetResult;

  const ratioResult = parseExactRate(rate);
  if (!ratioResult.ok) return ratioResult;

  const budget = budgetResult.value;
  const { currencyAmount, itemAmount } = ratioResult.value;

  const batchCount = budget / currencyAmount; // floor, both positive
  const spend = batchCount * currencyAmount;
  const receive = batchCount * itemAmount;

  return ok({
    spend: Number(spend),
    receive: Number(receive),
    remainingCurrency: Number(budget - spend),
  });
}

export interface SellTradeResult {
  /** Whole-number items sold — a whole multiple of the unit's item side, never over stock. */
  sell: number;
  /**
   * Items left over from the stock after `sell` — too few to make up another
   * whole trade unit. Always `itemsToSell - sell`; 0 when the stock divides
   * evenly into whole units.
   */
  remainder: number;
  /** Whole-number currency received — the matching multiple of the unit's currency side. */
  receive: number;
}

/**
 * Sells the largest whole number of exact trade units the stock allows.
 *
 * With a reduced unit of `C` currency for `I` items and a stock `S`, the
 * result is `batchCount = floor(S / I)` units: `sell = batchCount · I`,
 * `receive = batchCount · C`, and `remainder = S − sell` items that don't
 * make up another whole unit. Both sides scale by the same whole
 * `batchCount`, so `sell · C === receive · I` always holds — no item is ever
 * handed over at anything other than the exact entered rate.
 */
export function optimizeSellTrade(
  itemsToSell: string | number,
  rate: ExactExchangeRate,
): CalcResult<SellTradeResult> {
  const itemsResult = parseWholeNumber(itemsToSell, "Items to sell");
  if (!itemsResult.ok) return itemsResult;

  const ratioResult = parseExactRate(rate);
  if (!ratioResult.ok) return ratioResult;

  const stock = itemsResult.value;
  const { currencyAmount, itemAmount } = ratioResult.value;

  const batchCount = stock / itemAmount; // floor, both positive
  const sell = batchCount * itemAmount;
  const receive = batchCount * currencyAmount;

  return ok({
    sell: Number(sell),
    remainder: Number(stock - sell),
    receive: Number(receive),
  });
}

/**
 * A Buy/Sell trade result is only meaningful to display or copy when it
 * actually yields currency. A zero `receive` — a budget too small to buy a
 * single item, or a stock worth less than one whole currency unit to sell —
 * is an unavailable result: the UI shows the "—" placeholder for it instead
 * of a copyable 0/0 pair. Shared by BuyingSection and SellingSection so the
 * two never diverge on what counts as "no usable result".
 */
export function hasUsableTradeResult(result: { receive: number } | null): boolean {
  return result !== null && result.receive > 0;
}

/**
 * Quick Calc: plain `price * quantity`, exact (BigInt) arithmetic, rounded
 * to 2 decimals. Deliberately has no whole-item flooring, no reciprocal
 * price/quantity behavior, and no connection to the trade-optimization
 * functions above — this is the simple "how much for N of these?" case,
 * distinct from {@link optimizeBuyTrade} / {@link optimizeSellTrade}.
 */
export function quickMultiply(price: string | number, quantity: string | number): CalcResult<string> {
  const priceResult = parseDecimal(price, "Price");
  if (!priceResult.ok) return priceResult;

  const quantityResult = parseDecimal(quantity, "Quantity");
  if (!quantityResult.ok) return quantityResult;

  const numerator = priceResult.value.scaled * quantityResult.value.scaled;
  const denominator = 10n ** BigInt(priceResult.value.decimals + quantityResult.value.decimals);

  return ok(formatFraction(numerator, denominator, 2));
}

export type CurrencyDirection = "chaosToDivine" | "divineToChaos";

export interface ConvertCurrencyInput {
  /** How many Chaos Orbs one Divine Orb is worth. */
  exchangeRate: string | number;
  amount: string | number;
  direction: CurrencyDirection;
}

/**
 * Converts between Chaos Orbs and Divine Orbs using a Chaos-per-Divine
 * exchange rate. This is a simple ratio conversion with no whole-number
 * trade optimization.
 */
export function convertCurrency(input: ConvertCurrencyInput): CalcResult<string> {
  const rateResult = parseDecimal(input.exchangeRate, "Exchange rate");
  if (!rateResult.ok) return rateResult;
  if (rateResult.value.scaled <= 0n) {
    return fail("Exchange rate must be greater than zero.");
  }

  const amountResult = parseDecimal(input.amount, "Amount");
  if (!amountResult.ok) return amountResult;
  if (amountResult.value.scaled <= 0n) {
    return fail("Amount must be greater than zero.");
  }

  const { scaled: rateScaled, decimals: rateDecimals } = rateResult.value;
  const { scaled: amountScaled, decimals: amountDecimals } = amountResult.value;

  let numerator: bigint;
  let denominator: bigint;

  if (input.direction === "divineToChaos") {
    // chaos = divineAmount * rate
    numerator = amountScaled * rateScaled;
    denominator = 10n ** BigInt(amountDecimals + rateDecimals);
  } else {
    // divine = chaosAmount / rate
    numerator = amountScaled * 10n ** BigInt(rateDecimals);
    denominator = rateScaled * 10n ** BigInt(amountDecimals);
  }

  return ok(formatFraction(numerator, denominator, 2));
}
