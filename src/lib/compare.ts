// Pure calculation engine for the "Compare" decision tool: given the same
// item listed in both Chaos and Divine, tells the trader which currency is
// the better deal. Reuses the existing exact-arithmetic helpers from
// calculator.ts (parsePricePerItem, parseDecimal, formatFraction) rather
// than introducing a second rounding convention.

import { type CalcResult, formatFraction, parseDecimal, parsePricePerItem } from "./calculator";

export type ListingFormat = "price" | "qty";
export type CompareMode = "buying" | "selling";
export type CompareWinner = "chaos" | "divine" | "tie";

export interface CompareInputs {
  mode: CompareMode;
  /** Chaos per Divine. */
  rate: string;
  /** Chaos listing, interpreted per `chaosFormat`. */
  chaos: string;
  chaosFormat: ListingFormat;
  /** Divine listing, interpreted per `divFormat`. */
  div: string;
  divFormat: ListingFormat;
}

export interface CompareResult {
  /** Chaos listing normalized to a per-item price, 2dp. */
  chaosPerItem: string;
  /** Divine listing converted to its chaos-equivalent per-item price, 2dp. */
  divChaosPerItem: string;
  winner: CompareWinner;
  /** Absolute difference between the two per-item chaos values, 2dp. */
  diffChaos: string;
  /** Percentage edge (buy: relative to the pricier side; sell: relative to the cheaper side), 2dp. */
  diffPercent: string;
}

/**
 * A price-per-item, in chaos-cents, kept as an exact numerator/denominator
 * pair instead of rounded to the nearest cent.
 *
 * Rounding a "qty" (items-per-currency) listing to the nearest cent
 * immediately — as this module used to do — collapses any rate above
 * roughly 200 items per currency to a price of exactly zero cents (e.g.
 * 1/300 currency ≈ 0.0033, which rounds to 0.00). That's what caused Task
 * 20 Bug 3: valid rates like "300 items per currency" were rejected as
 * "too large to convert" even though nothing about them is actually
 * invalid. Keeping the fraction exact until the final comparison/display
 * step removes that artificial ceiling entirely, without introducing any
 * floating-point math — every intermediate value stays an exact BigInt
 * ratio.
 */
interface PriceFraction {
  num: bigint;
  den: bigint; // always > 0
}

/** Converts a Chaos or Divine listing into an exact price-per-item fraction
 * (in that currency's cents), from either a direct "price" entry or a
 * "qty" (items-per-currency) entry via its reciprocal. */
function priceFraction(value: string, format: ListingFormat, fieldName: string): CalcResult<PriceFraction> {
  if (format === "price") {
    const priceCentsResult = parsePricePerItem(value);
    if (!priceCentsResult.ok) return priceCentsResult;
    return { ok: true, value: { num: priceCentsResult.value, den: 1n } };
  }

  const parsed = parseDecimal(value, fieldName, 2);
  if (!parsed.ok) return parsed;

  const qtyCents = parsed.value.scaled * 10n ** BigInt(2 - parsed.value.decimals);
  if (qtyCents <= 0n) {
    return { ok: false, error: `${fieldName} must be greater than zero.` };
  }

  // price-per-item (in cents) = 100 / qty = 10000 / qtyCents, kept exact —
  // no rounding, and therefore no upper limit on qty.
  return { ok: true, value: { num: 10000n, den: qtyCents } };
}

/** Converts a Divine price-per-item fraction (in divine cents) into its
 * chaos-cents equivalent via the given Chaos-per-Divine rate, staying in
 * exact fraction form throughout. */
function toChaosEquivalent(divPrice: PriceFraction, rate: string): CalcResult<PriceFraction> {
  const rateResult = parseDecimal(rate, "Exchange rate");
  if (!rateResult.ok) return rateResult;
  if (rateResult.value.scaled <= 0n) {
    return { ok: false, error: "Exchange rate must be greater than zero." };
  }
  const { scaled: rateScaled, decimals: rateDecimals } = rateResult.value;
  return {
    ok: true,
    value: {
      num: divPrice.num * rateScaled,
      den: divPrice.den * 10n ** BigInt(rateDecimals),
    },
  };
}

/** a/b vs c/d via cross-multiplication — exact regardless of how the
 * fractions were derived, no division (and therefore no rounding) involved. */
function compareFractions(a: PriceFraction, b: PriceFraction): -1 | 0 | 1 {
  const left = a.num * b.den;
  const right = b.num * a.den;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** |a - b|, as an (unreduced) exact fraction. */
function absDifference(a: PriceFraction, b: PriceFraction): PriceFraction {
  const num = a.num * b.den - b.num * a.den;
  return { num: num < 0n ? -num : num, den: a.den * b.den };
}

/** Formats a cents-fraction (num/den, in cents) as a 2dp currency string. */
function formatCentsFraction(price: PriceFraction): string {
  return formatFraction(price.num, price.den * 100n, 2);
}

/**
 * Compares a Chaos listing against a Divine listing (converted to its
 * chaos-equivalent via the given rate) and recommends a winner:
 * - Buying: the cheaper chaos-equivalent wins.
 * - Selling: the more valuable (higher) chaos-equivalent wins.
 */
export function compareListings(inputs: CompareInputs): CalcResult<CompareResult> {
  const chaosResult = priceFraction(inputs.chaos, inputs.chaosFormat, "Chaos listing");
  if (!chaosResult.ok) return chaosResult;

  const divResult = priceFraction(inputs.div, inputs.divFormat, "Divine listing");
  if (!divResult.ok) return divResult;

  const divChaosResult = toChaosEquivalent(divResult.value, inputs.rate);
  if (!divChaosResult.ok) return divChaosResult;

  const chaos = chaosResult.value;
  const divChaos = divChaosResult.value;
  const comparison = compareFractions(chaos, divChaos);

  let winner: CompareWinner;
  if (comparison === 0) {
    winner = "tie";
  } else if (inputs.mode === "buying") {
    winner = comparison < 0 ? "chaos" : "divine"; // cheaper (lower) wins
  } else {
    winner = comparison > 0 ? "chaos" : "divine"; // more valuable (higher) wins
  }

  const diff = absDifference(chaos, divChaos);
  const percentBase =
    inputs.mode === "buying"
      ? comparison > 0
        ? chaos
        : divChaos // the pricier (larger) side
      : comparison < 0
        ? chaos
        : divChaos; // the cheaper (smaller) side

  const diffPercent =
    diff.num === 0n || percentBase.num === 0n
      ? "0.00"
      : formatFraction(diff.num * percentBase.den * 100n, diff.den * percentBase.num, 2);

  return {
    ok: true,
    value: {
      chaosPerItem: formatCentsFraction(chaos),
      divChaosPerItem: formatCentsFraction(divChaos),
      winner,
      diffChaos: formatCentsFraction(diff),
      diffPercent,
    },
  };
}

/** Trims a fixed-2dp string like "1.00"/"2.33" down to "1"/"2.33" for display. */
export function trimTrailingZeros(value: string): string {
  return String(parseFloat(value));
}

export interface CompareVerdict {
  title: string;
  subline: string;
}

/**
 * Produces the human-readable verdict headline/subline for a successful
 * comparison result.
 *
 * Task 20 Bug 2: the subline used to read as a bare fragment like "2.33% *
 * cheaper · Δ 0.42 chaos/item", which didn't actually say what to *do*.
 * Buying and selling are different decisions (which is cheaper to acquire
 * vs. which is more profitable to sell into) and are phrased distinctly —
 * selling deliberately never reuses buying's "costs less" wording.
 */
export function formatCompareVerdict(mode: CompareMode, result: CompareResult): CompareVerdict {
  if (result.winner === "tie") {
    return {
      title: "Identical value",
      subline: mode === "buying" ? "Both listings cost the same per item." : "Both options earn the same amount per item.",
    };
  }

  const singularName = result.winner === "chaos" ? "Chaos" : "Divine";
  const pluralName = result.winner === "chaos" ? "Chaos" : "Divines";
  const diff = trimTrailingZeros(result.diffChaos);

  if (mode === "buying") {
    return {
      title: `Buy in ${pluralName}`,
      subline: `The ${singularName} listing costs ${diff} less chaos per item.`,
    };
  }
  return {
    title: `List in ${pluralName}`,
    subline: `Selling in ${pluralName} earns ${diff} more chaos per item.`,
  };
}
