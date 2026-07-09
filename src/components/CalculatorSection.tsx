import { useState } from "react";
import type { useClipboardQueue } from "../lib/clipboardQueue";
import { BuyingSection } from "./BuyingSection";
import { SellingSection } from "./SellingSection";
import { QuickCalcSection } from "./QuickCalcSection";

type CalcSubTab = "buying" | "selling";

interface CalculatorSectionProps {
  clipboardQueue: ReturnType<typeof useClipboardQueue>;
}

export function CalculatorSection({ clipboardQueue }: CalculatorSectionProps) {
  const [subTab, setSubTab] = useState<CalcSubTab>("buying");

  return (
    <div className="calc-tabs">
      <QuickCalcSection clipboardQueue={clipboardQueue} />

      <h2 className="calc-primary-heading calc-primary-heading-divider">Trade Maximizer</h2>

      <nav className="subtab-bar">
        <button
          className={`subtab ${subTab === "buying" ? "subtab-active" : ""}`}
          onClick={() => setSubTab("buying")}
        >
          Buying
        </button>
        <button
          className={`subtab ${subTab === "selling" ? "subtab-active" : ""}`}
          onClick={() => setSubTab("selling")}
        >
          Selling
        </button>
      </nav>

      {/* Both panels stay mounted at all times — only visibility toggles via
          CSS — so switching sub-tabs never resets in-progress input. */}
      <div className={subTab === "buying" ? "" : "calc-panel-hidden"}>
        <BuyingSection clipboardQueue={clipboardQueue} />
      </div>
      <div className={subTab === "selling" ? "" : "calc-panel-hidden"}>
        <SellingSection clipboardQueue={clipboardQueue} />
      </div>
    </div>
  );
}
