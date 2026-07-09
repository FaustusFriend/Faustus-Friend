import { useState } from "react";
import { formatFraction, parseDecimal } from "../lib/calculator";
import { sanitizeDecimalInput } from "../lib/inputSanitize";
import { selectAllOnFocus } from "../lib/selectAllOnFocus";

// A complete (non-partial) decimal, e.g. "1.60" or "2" — as opposed to a
// still-being-typed value like "1." or "" which should not trigger
// recalculation yet.
const COMPLETE_DECIMAL = /^\d+(\.\d+)?$/;

interface ExchangeRateInputProps {
  /** Called with the canonical price-per-item (2-decimal string), or null when empty/invalid. */
  onPriceChange: (price: string | null) => void;
}

function centsToStr(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${negative ? "-" : ""}${whole}.${frac.toString().padStart(2, "0")}`;
}

/** Round-half-up integer division, for deriving price cents from items-per-currency. */
function roundDivBigInt(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const negative = (numerator < 0n) !== (denominator < 0n);
  const numAbs = numerator < 0n ? -numerator : numerator;
  const denAbs = denominator < 0n ? -denominator : denominator;
  let result = numAbs / denAbs;
  if ((numAbs % denAbs) * 2n >= denAbs) result += 1n;
  return negative ? -result : result;
}

function toCents(sanitized: string, fieldName: string): { cents: bigint } | { error: string } | null {
  if (!COMPLETE_DECIMAL.test(sanitized)) {
    return null; // incomplete — caller should wait silently
  }
  const parsed = parseDecimal(sanitized, fieldName, 2);
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const cents = parsed.value.scaled * 10n ** BigInt(2 - parsed.value.decimals);
  if (cents <= 0n) {
    return { error: `${fieldName} must be greater than zero.` };
  }
  return { cents };
}

/**
 * Dual-entry exchange-rate input: "Price / Item" and "Items / Currency"
 * (its reciprocal) are two views of one canonical rate. Editing either
 * recalculates the other; only the field the user is actively editing is
 * ever written to directly, so there's no update loop between them.
 */
export function ExchangeRateInput({ onPriceChange }: ExchangeRateInputProps) {
  const [priceText, setPriceText] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handlePriceChange(raw: string) {
    const sanitized = sanitizeDecimalInput(raw, 2);
    setPriceText(sanitized);

    if (sanitized === "") {
      setItemsText("");
      setError(null);
      onPriceChange(null);
      return;
    }

    const outcome = toCents(sanitized, "Price per item");
    if (outcome === null) return; // incomplete, wait for more input
    if ("error" in outcome) {
      setError(outcome.error);
      onPriceChange(null);
      return;
    }

    setError(null);
    setItemsText(formatFraction(100n, outcome.cents, 2));
    onPriceChange(centsToStr(outcome.cents));
  }

  function handleItemsChange(raw: string) {
    const sanitized = sanitizeDecimalInput(raw, 2);
    setItemsText(sanitized);

    if (sanitized === "") {
      setPriceText("");
      setError(null);
      onPriceChange(null);
      return;
    }

    const outcome = toCents(sanitized, "Items per currency");
    if (outcome === null) return; // incomplete, wait for more input
    if ("error" in outcome) {
      setError(outcome.error);
      onPriceChange(null);
      return;
    }

    const priceCents = roundDivBigInt(10000n, outcome.cents);
    if (priceCents <= 0n) {
      setError("Items per currency is too large to convert to a valid price.");
      onPriceChange(null);
      return;
    }

    setError(null);
    setPriceText(centsToStr(priceCents));
    onPriceChange(centsToStr(priceCents));
  }

  return (
    <div className="price-group">
      <div className="price-group-caption">Price · enter either one</div>
      <label className="field field-nested">
        <span>Price / Item</span>
        <input
          inputMode="decimal"
          value={priceText}
          onChange={(e) => handlePriceChange(e.target.value)}
          placeholder="0.00"
          {...selectAllOnFocus}
        />
      </label>
      <div className="price-group-divider">
        <span className="price-group-divider-line" />
        <span className="price-group-divider-label">or</span>
        <span className="price-group-divider-line" />
      </div>
      <label className="field field-nested">
        <span>Items / Currency</span>
        <input
          inputMode="decimal"
          value={itemsText}
          onChange={(e) => handleItemsChange(e.target.value)}
          placeholder="0.00"
          {...selectAllOnFocus}
        />
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
