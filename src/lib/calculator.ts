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

export interface BuyTradeResult {
  /** Whole-number currency amount actually spent (never exceeds the budget). */
  spend: number;
  /** Whole-number item quantity received (maximized). */
  receive: number;
  /** Realized price per item (spend / receive), rounded to 2 decimals. */
  approxRate: string;
}

/**
 * Given a currency budget and a price per item, returns the maximum whole
 * number of items purchasable without exceeding the budget, along with the
 * matching whole-number spend.
 */
export function optimizeBuyTrade(
  currencyToSpend: string | number,
  pricePerItem: string | number,
): CalcResult<BuyTradeResult> {
  const budgetResult = parseWholeNumber(currencyToSpend, "Currency to spend");
  if (!budgetResult.ok) return budgetResult;

  const priceResult = parsePricePerItem(pricePerItem);
  if (!priceResult.ok) return priceResult;

  const budget = budgetResult.value;
  const priceCents = priceResult.value;

  const budgetCents = budget * 100n;
  const receive = budgetCents / priceCents; // floor division, both positive

  if (receive === 0n) {
    return ok({ spend: 0, receive: 0, approxRate: "0.00" });
  }

  const spendCents = receive * priceCents;
  const spend = spendCents / 100n; // floor to a whole currency amount

  return ok({
    spend: Number(spend),
    receive: Number(receive),
    approxRate: formatFraction(spendCents, receive * 100n),
  });
}

export interface SellTradeResult {
  /**
   * Whole-number item quantity actually sold. Never exceeds `itemsToSell` —
   * see {@link remainder}.
   */
  sell: number;
  /**
   * Items left over from `itemsToSell` after selling `sell` — i.e. items
   * that would floor away for zero currency if handed over anyway. Always
   * `itemsToSell - sell`; 0 when the full stock is sellable.
   */
  remainder: number;
  /** Whole-number currency amount received (maximized). */
  receive: number;
  /** Realized price per item (receive / sell), rounded to 2 decimals. */
  approxRate: string;
}

/**
 * Given a whole number of items to sell and a price per item, returns the
 * currency received and the quantity actually needed to earn it.
 *
 * `receive` is the floor of the full stock's total value — selling *more*
 * than necessary to reach that floored amount would hand over items for
 * nothing, since their value falls entirely inside the rounding loss. `sell`
 * is therefore the minimum whole-item quantity whose value covers `receive`
 * exactly (a ceiling division): any fewer items would fall short of it, and
 * any more would exceed it without earning anything extra. Items beyond
 * that are reported as `remainder` rather than included in `sell`.
 */
export function optimizeSellTrade(
  itemsToSell: string | number,
  pricePerItem: string | number,
): CalcResult<SellTradeResult> {
  const itemsResult = parseWholeNumber(itemsToSell, "Items to sell");
  if (!itemsResult.ok) return itemsResult;

  const priceResult = parsePricePerItem(pricePerItem);
  if (!priceResult.ok) return priceResult;

  const items = itemsResult.value;
  const priceCents = priceResult.value;

  const totalCents = items * priceCents; // exact, no rounding needed here
  const receive = totalCents / 100n; // floor to a whole currency amount

  const sell = receive === 0n ? 0n : (receive * 100n + priceCents - 1n) / priceCents; // ceil
  const remainder = items - sell;

  return ok({
    sell: Number(sell),
    remainder: Number(remainder),
    receive: Number(receive),
    approxRate: receive === 0n ? "0.00" : formatFraction(receive * 100n, sell * 100n),
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
