import { useEffect, useRef, useState } from "react";
import { optimizeBuyTrade, type BuyTradeResult } from "../lib/calculator";
import { sanitizeWholeNumberInput } from "../lib/inputSanitize";
import type { useClipboardQueue } from "../lib/clipboardQueue";
import { ExchangeRateInput } from "./ExchangeRateInput";

const SECTION_ID = "buy";

interface BuyingSectionProps {
  clipboardQueue: ReturnType<typeof useClipboardQueue>;
}

export function BuyingSection({ clipboardQueue }: BuyingSectionProps) {
  const [currencyToSpend, setCurrencyToSpend] = useState("");
  const [pricePerItem, setPricePerItem] = useState<string | null>(null);
  const [result, setResult] = useState<BuyTradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const armedPairRef = useRef<{ spend: number; receive: number } | null>(null);

  useEffect(() => {
    if (currencyToSpend === "" || pricePerItem === null) {
      setResult(null);
      setError(null);
      return;
    }
    const outcome = optimizeBuyTrade(currencyToSpend, pricePerItem);
    if (outcome.ok) {
      setResult(outcome.value);
      setError(null);
    } else {
      setResult(null);
      setError(outcome.error);
    }
  }, [currencyToSpend, pricePerItem]);

  useEffect(() => {
    const armed = clipboardQueue.status.armedForSection === SECTION_ID;
    if (!armed || !armedPairRef.current) return;
    const changed =
      !result ||
      result.spend !== armedPairRef.current.spend ||
      result.receive !== armedPairRef.current.receive;
    if (changed) {
      clipboardQueue.cancelIfOwnedBy(SECTION_ID);
      armedPairRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const hasResult = result !== null && result.receive > 0;

  async function copySpend() {
    if (!result) return;
    await clipboardQueue.copySingle(String(result.spend));
  }

  async function copyReceive() {
    if (!result) return;
    await clipboardQueue.copySingle(String(result.receive));
  }

  async function copyTradePair() {
    if (!result) return;
    armedPairRef.current = { spend: result.spend, receive: result.receive };
    await clipboardQueue.start(SECTION_ID, String(result.spend), String(result.receive));
  }

  const queueActiveHere = clipboardQueue.status.armedForSection === SECTION_ID;

  return (
    <div className="section">
      <h2 className="section-heading">
        <span>Inputs</span>
      </h2>
      <label className="field">
        <span>Currency to Spend</span>
        <input
          inputMode="numeric"
          value={currencyToSpend}
          onChange={(e) => setCurrencyToSpend(sanitizeWholeNumberInput(e.target.value))}
          placeholder="0"
        />
      </label>

      <ExchangeRateInput onPriceChange={setPricePerItem} />

      {error && <p className="error">{error}</p>}

      <h2 className="section-heading section-heading-divider">
        <span>Result</span>
      </h2>
      <div className="result-block">
        <div className="result-row">
          <span className="result-label">Spend</span>
          <span className="result-value">{hasResult ? result!.spend : "—"}</span>
          <button className="copy-button" title="Copy" disabled={!hasResult} onClick={copySpend}>
            ⧉
          </button>
        </div>
        <div className="result-row">
          <span className="result-label">Receive</span>
          <span className="result-value result-value-buy">{hasResult ? result!.receive : "—"}</span>
          <button className="copy-button" title="Copy" disabled={!hasResult} onClick={copyReceive}>
            ⧉
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
