import { useEffect, useRef, useState } from "react";
import { optimizeSellTrade, type SellTradeResult } from "../lib/calculator";
import { sanitizeWholeNumberInput } from "../lib/inputSanitize";
import { selectAllOnFocus } from "../lib/selectAllOnFocus";
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
  const [copyFailed, setCopyFailed] = useState(false);
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
    setCopyFailed(!(await clipboardQueue.copySingle(String(result.sell))));
  }

  async function copyReceive() {
    if (!result) return;
    setCopyFailed(!(await clipboardQueue.copySingle(String(result.receive))));
  }

  async function copyTradePair() {
    if (!result) return;
    armedPairRef.current = { sell: result.sell, receive: result.receive };
    const ok = await clipboardQueue.start(SECTION_ID, String(result.receive), String(result.sell));
    if (!ok) armedPairRef.current = null;
    setCopyFailed(!ok);
  }

  const queueActiveHere = clipboardQueue.status.armedForSection === SECTION_ID;

  return (
    <div className="section">
      <h2 className="section-heading">
        <span>Inputs</span>
      </h2>
      <label className="field">
        <span>Items to Sell</span>
        <input
          inputMode="numeric"
          value={itemsToSell}
          onChange={(e) => setItemsToSell(sanitizeWholeNumberInput(e.target.value))}
          placeholder="0"
          {...selectAllOnFocus}
        />
      </label>

      <ExchangeRateInput onPriceChange={setPricePerItem} />

      {error && <p className="error">{error}</p>}

      <h2 className="section-heading calc-result-divider">
        <span>Result</span>
      </h2>
      <div className="result-block">
        <div className="result-row">
          <span className="result-label">Receive</span>
          <span className="result-value result-value-sell">{hasResult ? result!.receive : "—"}</span>
          <button className="copy-button" title="Copy" disabled={!hasResult} onClick={copyReceive}>
            ⧉
          </button>
        </div>
        <div className="result-row">
          <span className="result-label">Sell</span>
          <span className="result-value">{hasResult ? result!.sell : "—"}</span>
          <button className="copy-button" title="Copy" disabled={!hasResult} onClick={copySell}>
            ⧉
          </button>
        </div>
        {hasResult && result!.remainder > 0 && (
          <div className="result-row">
            <span className="result-label">Remaining</span>
            <span className="result-value">{result!.remainder}</span>
          </div>
        )}
      </div>

      <button className="primary-button" disabled={!hasResult} onClick={copyTradePair}>
        Copy Trade Pair
      </button>

      {copyFailed && <p className="error">Copy failed — try again.</p>}
      {queueActiveHere && clipboardQueue.status.nextValue !== null && (
        <p className="status">Next paste: {clipboardQueue.status.nextValue}</p>
      )}
    </div>
  );
}
