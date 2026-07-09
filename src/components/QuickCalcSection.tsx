import { useState } from "react";
import { quickMultiply } from "../lib/calculator";
import { sanitizeDecimalInput } from "../lib/inputSanitize";
import { selectAllOnFocus } from "../lib/selectAllOnFocus";
import type { useClipboardQueue } from "../lib/clipboardQueue";

interface QuickCalcSectionProps {
  clipboardQueue: ReturnType<typeof useClipboardQueue>;
}

/**
 * Plain `Price * Quantity = Total` — the simple "how much for N of these?"
 * case. Deliberately has no connection to the optimizing Buy/Sell
 * calculator below it (see the "Trade Maximizer" heading in
 * CalculatorSection): no reciprocal price/quantity behavior, no whole-item
 * flooring, no optimization.
 */
export function QuickCalcSection({ clipboardQueue }: QuickCalcSectionProps) {
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const result = quickMultiply(price, quantity);
  const total = result.ok ? result.value : null;

  async function copyTotal() {
    if (total === null) return;
    await clipboardQueue.copySingle(total);
  }

  return (
    <div className="calc-section">
      <h2 className="calc-primary-heading">Quick Calc</h2>
      <div className="price-group">
        <label className="field field-nested">
          <span>Price</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(sanitizeDecimalInput(e.target.value))}
            placeholder="0"
            {...selectAllOnFocus}
          />
        </label>
        <label className="field field-nested">
          <span>Quantity</span>
          <input
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(sanitizeDecimalInput(e.target.value))}
            placeholder="0"
            {...selectAllOnFocus}
          />
        </label>
        <div className="result-row quick-calc-total">
          <span className="result-label">Total</span>
          <span className="result-value">{total ?? "—"}</span>
          <button className="copy-button" title="Copy" disabled={total === null} onClick={copyTotal}>
            ⧉
          </button>
        </div>
      </div>
    </div>
  );
}
