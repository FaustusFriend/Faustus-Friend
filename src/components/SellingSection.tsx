import { useEffect, useRef, useState } from "react";
import { optimizeSellTrade, type SellTradeResult } from "../lib/calculator";
import { sanitizeWholeNumberInput } from "../lib/inputSanitize";
import type { useClipboardQueue } from "../lib/clipboardQueue";
import { ExchangeRateInput } from "./ExchangeRateInput";

const SECTION_ID = "sell";

interface SellingSectionProps {
  clipboardQueue: ReturnType<typeof useClipboardQueue>;
}

export function SellingSection({ clipboardQueue }: SellingSectionProps) {
  const [itemsToSell, setItemsToSell] = useState("");
  const [pricePerItem, setPricePerItem] = useState<string | null>(null);
  const [result, setResult] = useState<SellTradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const armedPairRef = useRef<{ sell: number; receive: number } | null>(null);

  useEffect(() => {
    if (itemsToSell === "" || pricePerItem === null) {
      setResult(null);
      setError(null);
      return;
    }
    const outcome = optimizeSellTrade(itemsToSell, pricePerItem);
    if (outcome.ok) {
      setResult(outcome.value);
      setError(null);
    } else {
      setResult(null);
      setError(outcome.error);
    }
  }, [itemsToSell, pricePerItem]);

  useEffect(() => {
    const armed = clipboardQueue.status.armedForSection === SECTION_ID;
    if (!armed || !armedPairRef.current) return;
    const changed =
      !result ||
      result.sell !== armedPairRef.current.sell ||
      result.receive !== armedPairRef.current.receive;
    if (changed) {
      clipboardQueue.cancelIfOwnedBy(SECTION_ID);
      armedPairRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const hasResult = result !== null;

  async function copySell() {
    if (!result) return;
    await clipboardQueue.copySingle(String(result.sell));
  }

  async function copyReceive() {
    if (!result) return;
    await clipboardQueue.copySingle(String(result.receive));
  }

  async function copyTradePair() {
    if (!result) return;
    armedPairRef.current = { sell: result.sell, receive: result.receive };
    await clipboardQueue.start(SECTION_ID, String(result.sell), String(result.receive));
  }

  const queueActiveHere = clipboardQueue.status.armedForSection === SECTION_ID;

  return (
    <div className="section">
      <label className="field">
        <span>Items to Sell</span>
        <input
          inputMode="numeric"
          value={itemsToSell}
          onChange={(e) => setItemsToSell(sanitizeWholeNumberInput(e.target.value))}
          placeholder="0"
        />
      </label>

      <ExchangeRateInput onPriceChange={setPricePerItem} />

      {error && <p className="error">{error}</p>}

      <div className="result-block">
        <div className="result-row">
          <span className="result-label">Sell</span>
          <span className="result-value">{hasResult ? result!.sell : "—"}</span>
          <button className="copy-button" disabled={!hasResult} onClick={copySell}>
            Copy
          </button>
        </div>
        <div className="result-row">
          <span className="result-label">Receive</span>
          <span className="result-value">{hasResult ? result!.receive : "—"}</span>
          <button className="copy-button" disabled={!hasResult} onClick={copyReceive}>
            Copy
          </button>
        </div>
        <p className="hint">Rate: {hasResult ? `~${result!.approxRate}` : "—"}</p>
      </div>

      <button className="primary-button" disabled={!hasResult} onClick={copyTradePair}>
        Copy Trade Pair
      </button>

      {queueActiveHere && clipboardQueue.status.nextValue !== null && (
        <p className="status">Next paste: {clipboardQueue.status.nextValue}</p>
      )}
    </div>
  );
}
