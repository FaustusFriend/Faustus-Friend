import { describe, expect, it } from "vitest";
import { editItems, editPrice, emptyRateEntry } from "./rateEntry";
import { optimizeBuyTrade } from "./calculator";

function expectOk<T>(result: { ok: boolean; value?: T; error?: string }): T {
  if (!result.ok) throw new Error(`Expected ok result, got error: ${result.error}`);
  return result.value as T;
}

describe("rateEntry — authoritative exact rate is preserved", () => {
  it("direct Price / Item entry reaches the engine unchanged", () => {
    const state = editPrice(emptyRateEntry, "7.25");
    expect(state.mode).toBe("currencyPerItem");
    expect(state.priceText).toBe("7.25");
    expect(state.rate).toEqual({ mode: "currencyPerItem", value: "7.25" });

    // The exact rate drives the maximizer to the exact-ratio result.
    const result = expectOk(optimizeBuyTrade("300", state.rate!));
    expect(result).toMatchObject({ spend: 290, receive: 40 });
  });

  it("direct Items / Currency entry reaches the engine unchanged", () => {
    const state = editItems(emptyRateEntry, "13.95");
    expect(state.mode).toBe("itemsPerCurrency");
    expect(state.itemsText).toBe("13.95");
    expect(state.rate).toEqual({ mode: "itemsPerCurrency", value: "13.95" });

    const result = expectOk(optimizeBuyTrade("200", state.rate!));
    expect(result).toMatchObject({ spend: 200, receive: 2790 });
  });

  it("shows a display reciprocal in the other field without making it authoritative", () => {
    const state = editItems(emptyRateEntry, "13.95");
    // Convenience reciprocal for the Price / Item field, rounded for display.
    expect(state.priceText).toBe("0.07");
    // ...but the authoritative rate is still the exact items-per-currency entry,
    // NOT the rounded 0.07 that the other field displays.
    expect(state.rate).toEqual({ mode: "itemsPerCurrency", value: "13.95" });

    // Proof it matters: the rounded display value would give a different,
    // wrong result if it were used as the rate.
    const authoritative = expectOk(optimizeBuyTrade("200", state.rate!));
    const viaDisplayed = expectOk(optimizeBuyTrade("200", { mode: "currencyPerItem", value: state.priceText }));
    expect(authoritative.receive).toBe(2790);
    expect(viaDisplayed.receive).not.toBe(2790);
  });

  it("editing the newly selected mode makes that mode authoritative", () => {
    const afterItems = editItems(emptyRateEntry, "13.95");
    expect(afterItems.rate).toEqual({ mode: "itemsPerCurrency", value: "13.95" });

    // User now edits the Price / Item field — that becomes the source of truth.
    const afterPrice = editPrice(afterItems, "5");
    expect(afterPrice.mode).toBe("currencyPerItem");
    expect(afterPrice.rate).toEqual({ mode: "currencyPerItem", value: "5" });
  });

  it("mid-typing keeps the last authoritative rate instead of dropping it", () => {
    const complete = editPrice(emptyRateEntry, "7.25");
    const typing = editPrice(complete, "7."); // incomplete
    expect(typing.priceText).toBe("7.");
    expect(typing.error).toBeNull();
    expect(typing.rate).toEqual({ mode: "currencyPerItem", value: "7.25" });
  });

  it("clearing a field resets the authoritative rate to null", () => {
    const state = editPrice(emptyRateEntry, "7.25");
    const cleared = editPrice(state, "");
    expect(cleared.rate).toBeNull();
    expect(cleared.priceText).toBe("");
    expect(cleared.itemsText).toBe("");
  });

  it("surfaces a validation error for a zero rate and emits no rate", () => {
    const state = editItems(emptyRateEntry, "0");
    expect(state.rate).toBeNull();
    expect(state.error).toBeTruthy();
  });
});
