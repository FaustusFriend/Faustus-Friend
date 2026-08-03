import { useState } from "react";
import type { ExactExchangeRate } from "../lib/calculator";
import { editItems, editPrice, emptyRateEntry, type RateEntryState } from "../lib/rateEntry";
import { selectAllOnFocus } from "../lib/selectAllOnFocus";

interface ExchangeRateInputProps {
  /**
   * Called with the exact authoritative rate the user entered (original
   * decimal string + entry direction), or null when empty/invalid. Never a
   * rounded reciprocal — see {@link RateEntryState}.
   */
  onRateChange: (rate: ExactExchangeRate | null) => void;
}

/**
 * Dual-entry exchange-rate input: "Price / Item" and "Items / Currency" (its
 * reciprocal) are two views of one canonical rate. Whichever field the user
 * edits becomes authoritative; the other field only ever shows a display
 * reciprocal (rounded 2dp) that is never fed back into the calculation. All
 * of that logic lives in the pure {@link RateEntryState} reducer.
 */
export function ExchangeRateInput({ onRateChange }: ExchangeRateInputProps) {
  const [state, setState] = useState<RateEntryState>(emptyRateEntry);

  function update(next: RateEntryState) {
    setState(next);
    onRateChange(next.rate);
  }

  return (
    <div className="price-group">
      <div className="price-group-caption">Price · enter either one</div>
      <label className="field field-nested">
        <span>Price / Item</span>
        <input
          inputMode="decimal"
          value={state.priceText}
          onChange={(e) => update(editPrice(state, e.target.value))}
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
          value={state.itemsText}
          onChange={(e) => update(editItems(state, e.target.value))}
          placeholder="0.00"
          {...selectAllOnFocus}
        />
      </label>
      {state.error && <p className="error">{state.error}</p>}
    </div>
  );
}
