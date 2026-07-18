import { useState } from "react";
import {
  compareListings,
  formatCompareVerdict,
  listingAnnotation,
  trimTrailingZeros,
  type CompareMode,
  type ListingFormat,
} from "../lib/compare";
import { sanitizeDecimalInput } from "../lib/inputSanitize";
import { selectAllOnFocus } from "../lib/selectAllOnFocus";

interface CompareSideState {
  rate: string;
  chaos: string;
  chaosFormat: ListingFormat;
  div: string;
  divFormat: ListingFormat;
}

const EMPTY_SIDE: CompareSideState = {
  rate: "",
  chaos: "",
  chaosFormat: "price",
  div: "",
  divFormat: "price",
};

interface CompareFormProps {
  mode: CompareMode;
  state: CompareSideState;
  onChange: (patch: Partial<CompareSideState>) => void;
}

function CompareForm({ mode, state, onChange }: CompareFormProps) {
  const hasAllInputs = state.rate !== "" && state.chaos !== "" && state.div !== "";
  const outcome = hasAllInputs
    ? compareListings({
        mode,
        rate: state.rate,
        chaos: state.chaos,
        chaosFormat: state.chaosFormat,
        div: state.div,
        divFormat: state.divFormat,
      })
    : null;

  const result = outcome && outcome.ok ? outcome.value : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const winnerAccentClass =
    result && result.winner !== "tie" ? (mode === "buying" ? "compare-accent-buy" : "compare-accent-sell") : "";

  const chaosAnnotation = listingAnnotation(state.chaos, state.chaosFormat, "C");
  const divAnnotation = listingAnnotation(state.div, state.divFormat, "D");

  let verdictTitle = "Awaiting values";
  let verdictSubline = "";
  if (error) {
    verdictSubline = error;
  } else if (result) {
    const verdict = formatCompareVerdict(mode, result);
    verdictTitle = verdict.title;
    verdictSubline = verdict.subline;
  }

  return (
    <div className="section">
      <h2 className="section-heading">
        <span>Inputs</span>
        <span className="section-heading-note">enter all three</span>
      </h2>
      <label className="field">
        <span>Rate (C/D)</span>
        <input
          inputMode="decimal"
          value={state.rate}
          onChange={(e) => onChange({ rate: sanitizeDecimalInput(e.target.value, 2) })}
          placeholder="Chaos per Divine"
          {...selectAllOnFocus}
        />
      </label>

      <div className="compare-listing-row">
        <span className="compare-listing-label">Chaos</span>
        <div className="format-toggle-row">
          <button
            className={`format-toggle ${state.chaosFormat === "price" ? "format-toggle-active" : ""}`}
            onClick={() => onChange({ chaosFormat: "price" })}
          >
            C/item
          </button>
          <button
            className={`format-toggle ${state.chaosFormat === "qty" ? "format-toggle-active" : ""}`}
            onClick={() => onChange({ chaosFormat: "qty" })}
          >
            #/C
          </button>
        </div>
        <input
          className="compare-listing-input"
          inputMode="decimal"
          value={state.chaos}
          onChange={(e) => onChange({ chaos: sanitizeDecimalInput(e.target.value, 2) })}
          placeholder={state.chaosFormat === "price" ? "Chaos per item" : "Items per chaos"}
          {...selectAllOnFocus}
        />
      </div>

      <div className="compare-listing-row">
        <span className="compare-listing-label">Divine</span>
        <div className="format-toggle-row">
          <button
            className={`format-toggle ${state.divFormat === "price" ? "format-toggle-active" : ""}`}
            onClick={() => onChange({ divFormat: "price" })}
          >
            D/item
          </button>
          <button
            className={`format-toggle ${state.divFormat === "qty" ? "format-toggle-active" : ""}`}
            onClick={() => onChange({ divFormat: "qty" })}
          >
            #/D
          </button>
        </div>
        <input
          className="compare-listing-input"
          inputMode="decimal"
          value={state.div}
          onChange={(e) => onChange({ div: sanitizeDecimalInput(e.target.value, 2) })}
          placeholder={state.divFormat === "price" ? "Divine per item" : "Items per divine"}
          {...selectAllOnFocus}
        />
      </div>

      <h2 className="section-heading section-heading-divider">
        <span>Verdict</span>
      </h2>
      <div className={`compare-verdict ${winnerAccentClass}`}>
        <p className={`compare-verdict-title ${winnerAccentClass}`}>{verdictTitle}</p>
        {verdictSubline && <p className="compare-verdict-subline">{verdictSubline}</p>}
      </div>

      <div className={`compare-math-row ${result?.winner === "chaos" ? winnerAccentClass : ""}`}>
        <span className="compare-math-label">Chaos {chaosAnnotation ? `(${chaosAnnotation})` : ""}</span>
        {result?.winner === "chaos" && (
          <span className={`compare-winner-chip ${winnerAccentClass}`}>
            {mode === "buying" ? "Best Buy" : "Best Sale"}
          </span>
        )}
        <span className="compare-math-value">
          {result ? trimTrailingZeros(result.chaosPerItem) : "—"}
          <span className="compare-math-value-suffix">C</span>
        </span>
      </div>
      <div className={`compare-math-row ${result?.winner === "divine" ? winnerAccentClass : ""}`}>
        <span className="compare-math-label">
          Divine {divAnnotation ? `(${divAnnotation})` : ""}
        </span>
        {result?.winner === "divine" && (
          <span className={`compare-winner-chip ${winnerAccentClass}`}>
            {mode === "buying" ? "Best Buy" : "Best Sale"}
          </span>
        )}
        <span className="compare-math-value">
          {result ? trimTrailingZeros(result.divChaosPerItem) : "—"}
          <span className="compare-math-value-suffix">C</span>
        </span>
      </div>
    </div>
  );
}

export function CompareSection() {
  const [subTab, setSubTab] = useState<CompareMode>("buying");
  const [buyState, setBuyState] = useState<CompareSideState>(EMPTY_SIDE);
  const [sellState, setSellState] = useState<CompareSideState>(EMPTY_SIDE);

  function patchActiveState(patch: Partial<CompareSideState>) {
    if (subTab === "buying") {
      setBuyState((prev) => ({ ...prev, ...patch }));
    } else {
      setSellState((prev) => ({ ...prev, ...patch }));
    }
  }

  return (
    <div className="calc-tabs">
      <div className="compare-segmented">
        <button
          className={`compare-segment ${subTab === "buying" ? "compare-segment-buy-active" : ""}`}
          onClick={() => setSubTab("buying")}
        >
          Buying
        </button>
        <div className="compare-transfer-stack">
          <button
            className="compare-transfer-arrow"
            title="Copy Buying values into Selling"
            onClick={() => setSellState({ ...buyState })}
          >
            →
          </button>
          <button
            className="compare-transfer-arrow"
            title="Copy Selling values into Buying"
            onClick={() => setBuyState({ ...sellState })}
          >
            ←
          </button>
        </div>
        <button
          className={`compare-segment ${subTab === "selling" ? "compare-segment-sell-active" : ""}`}
          onClick={() => setSubTab("selling")}
        >
          Selling
        </button>
      </div>

      {subTab === "buying" ? (
        <CompareForm mode="buying" state={buyState} onChange={patchActiveState} />
      ) : (
        <CompareForm mode="selling" state={sellState} onChange={patchActiveState} />
      )}
    </div>
  );
}
