import { useRef, useState } from "react";
import { convertCurrency } from "../lib/calculator";
import { sanitizeDecimalInput } from "../lib/inputSanitize";

// Conversion amounts aren't restricted to 2 decimals like trade prices —
// just guarded against garbage input (multiple dots, non-numeric chars).
const AMOUNT_MAX_DECIMALS = 8;

export function ConversionSection() {
  const [exchangeRate, setExchangeRate] = useState("");
  const [chaos, setChaos] = useState("");
  const [divines, setDivines] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lastEdited = useRef<"chaos" | "divines" | null>(null);

  function recompute(rate: string, source: "chaos" | "divines", amount: string) {
    if (rate === "" || amount === "") {
      setError(null);
      return;
    }
    const direction = source === "chaos" ? "chaosToDivine" : "divineToChaos";
    const outcome = convertCurrency({ amount, exchangeRate: rate, direction });
    if (outcome.ok) {
      setError(null);
      if (source === "chaos") {
        setDivines(outcome.value);
      } else {
        setChaos(outcome.value);
      }
    } else {
      setError(outcome.error);
    }
  }

  function handleExchangeRateChange(raw: string) {
    const sanitized = sanitizeDecimalInput(raw, AMOUNT_MAX_DECIMALS);
    setExchangeRate(sanitized);
    if (lastEdited.current === "chaos") {
      recompute(sanitized, "chaos", chaos);
    } else if (lastEdited.current === "divines") {
      recompute(sanitized, "divines", divines);
    }
  }

  function handleChaosChange(raw: string) {
    const sanitized = sanitizeDecimalInput(raw, AMOUNT_MAX_DECIMALS);
    lastEdited.current = "chaos";
    setChaos(sanitized);
    if (sanitized === "") {
      setDivines("");
      setError(null);
      return;
    }
    recompute(exchangeRate, "chaos", sanitized);
  }

  function handleDivinesChange(raw: string) {
    const sanitized = sanitizeDecimalInput(raw, AMOUNT_MAX_DECIMALS);
    lastEdited.current = "divines";
    setDivines(sanitized);
    if (sanitized === "") {
      setChaos("");
      setError(null);
      return;
    }
    recompute(exchangeRate, "divines", sanitized);
  }

  return (
    <div className="section">
      <label className="field">
        <span>Exchange Rate</span>
        <input
          inputMode="decimal"
          value={exchangeRate}
          onChange={(e) => handleExchangeRateChange(e.target.value)}
          placeholder="Chaos per Divine"
        />
      </label>

      <label className="field">
        <span>Chaos</span>
        <input
          inputMode="decimal"
          value={chaos}
          onChange={(e) => handleChaosChange(e.target.value)}
          placeholder="0"
        />
      </label>

      <label className="field">
        <span>Divines</span>
        <input
          inputMode="decimal"
          value={divines}
          onChange={(e) => handleDivinesChange(e.target.value)}
          placeholder="0"
        />
      </label>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
