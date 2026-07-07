// Pure calculation engine for the "Compare" decision tool: given the same
// item listed in both Chaos and Divine, tells the trader which currency is
// the better deal. Reuses the existing exact-arithmetic helpers from
// calculator.ts (parsePricePerItem, parseDecimal, formatFraction,
// convertCurrency) rather than introducing a second rounding convention.

import { type CalcResult, convertCurrency, formatFraction, parseDecimal, parsePricePerItem } from "./calculator";

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

/** Round-half-up integer division — mirrors the reciprocal rounding already
 * used by ExchangeRateInput.tsx for its Price/Item <-> Items/Currency pair. */
function roundDivBigInt(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const negative = (numerator < 0n) !== (denominator < 0n);
  const numAbs = numerator < 0n ? -numerator : numerator;
  const denAbs = denominator < 0n ? -denominator : denominator;
  let result = numAbs / denAbs;
  if ((numAbs % denAbs) * 2n >= denAbs) result += 1n;
  return negative ? -result : result;
}

/**
 * Normalizes a listing entered as either a per-item price ("price") or an
 * items-per-currency quantity ("qty") into a per-item price in integer cents
 * — the same reciprocal convention (`1/x`, rounded to 2dp) used elsewhere in
 * the app for exchange-rate entry.
 */
function toItemPriceCents(value: string, format: ListingFormat, fieldName: string): CalcResult<bigint> {
  if (format === "price") {
    return parsePricePerItem(value);
  }

  const parsed = parseDecimal(value, fieldName, 2);
  if (!parsed.ok) return parsed;

  const qtyCents = parsed.value.scaled * 10n ** BigInt(2 - parsed.value.decimals);
  if (qtyCents <= 0n) {
    return { ok: false, error: `${fieldName} must be greater than zero.` };
  }

  const priceCents = roundDivBigInt(10000n, qtyCents);
  if (priceCents <= 0n) {
    return { ok: false, error: `${fieldName} is too large to convert to a valid price.` };
  }
  return { ok: true, value: priceCents };
}

/**
 * Compares a Chaos listing against a Divine listing (converted to its
 * chaos-equivalent via the given rate) and recommends a winner:
 * - Buying: the cheaper chaos-equivalent wins.
 * - Selling: the more valuable (higher) chaos-equivalent wins.
 */
export function compareListings(inputs: CompareInputs): CalcResult<CompareResult> {
  const chaosCentsResult = toItemPriceCents(inputs.chaos, inputs.chaosFormat, "Chaos listing");
  if (!chaosCentsResult.ok) return chaosCentsResult;

  const divCentsResult = toItemPriceCents(inputs.div, inputs.divFormat, "Divine listing");
  if (!divCentsResult.ok) return divCentsResult;

  const divPricePerItem = formatFraction(divCentsResult.value, 100n, 2);
  const conversionResult = convertCurrency({
    amount: divPricePerItem,
    exchangeRate: inputs.rate,
    direction: "divineToChaos",
  });
  if (!conversionResult.ok) return conversionResult;

  const divChaosParsed = parseDecimal(conversionResult.value, "Divine chaos-equivalent", 2);
  if (!divChaosParsed.ok) return divChaosParsed;

  const chaosPerItemCents = chaosCentsResult.value;
  const divChaosPerItemCents = divChaosParsed.value.scaled * 10n ** BigInt(2 - divChaosParsed.value.decimals);

  const diffCents =
    chaosPerItemCents > divChaosPerItemCents
      ? chaosPerItemCents - divChaosPerItemCents
      : divChaosPerItemCents - chaosPerItemCents;

  let winner: CompareWinner;
  if (chaosPerItemCents === divChaosPerItemCents) {
    winner = "tie";
  } else if (inputs.mode === "buying") {
    winner = chaosPerItemCents < divChaosPerItemCents ? "chaos" : "divine";
  } else {
    winner = chaosPerItemCents > divChaosPerItemCents ? "chaos" : "divine";
  }

  const percentBase =
    inputs.mode === "buying"
      ? chaosPerItemCents > divChaosPerItemCents
        ? chaosPerItemCents
        : divChaosPerItemCents
      : chaosPerItemCents < divChaosPerItemCents
        ? chaosPerItemCents
        : divChaosPerItemCents;

  const diffPercent = percentBase === 0n ? "0.00" : formatFraction(diffCents * 100n, percentBase, 2);

  return {
    ok: true,
    value: {
      chaosPerItem: formatFraction(chaosPerItemCents, 100n, 2),
      divChaosPerItem: formatFraction(divChaosPerItemCents, 100n, 2),
      winner,
      diffChaos: formatFraction(diffCents, 100n, 2),
      diffPercent,
    },
  };
}
