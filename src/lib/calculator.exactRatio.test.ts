import { describe, expect, it } from "vitest";
import { optimizeBuyTrade, optimizeSellTrade } from "./calculator";

// --- fix/exact-trade-ratios: exact rational ratio regression suite ---------
//
// These tests pin down the *intended* Trade Maximizer contract:
//
//   The rate the user enters is an EXACT rational number. A valid trade is a
//   whole-number multiple of that rate's reduced (lowest-terms) ratio, and
//   nothing else. The maximizer returns the largest such multiple that fits
//   the available currency (Buying) or stock (Selling).
//
// The current implementation instead maximizes item/currency *count* against
// a 2-decimal (cents) price and then floors the counterpart amount to a whole
// unit. That silently invents an effective rate different from the one the
// user typed — e.g. 41 items for 297 currency at a "7.25" price is an
// effective 7.2439.../item, not 7.25. Every case below therefore FAILS
// against the current engine; each is expected to pass once the engine
// preserves the exact reduced ratio.
//
// No Number/parseFloat/toFixed appears in any expected value — the fixtures
// are the whole-integer results the reduced ratio produces, taken directly
// from the exact fractions noted per case.

function expectOk<T>(result: { ok: boolean; value?: T; error?: string }): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${result.error}`);
  }
  return result.value as T;
}

// The reciprocal ("N items per currency") cases cannot be expressed as a
// finite 2-decimal price-per-item (1/13.95, 1/1.53, 1/1.6 are non-terminating
// or exceed 2 dp), so they cannot go through the current price-per-item string
// argument without discarding the exact rate. The fix must let the maximizer
// accept the exact rate the user actually entered. This is the proposed
// contract the reciprocal cases are written against; the cast keeps the
// regression suite compiling until the engine's signature is widened to
// accept it.
type ExactRate = { currencyPerItem: string } | { itemsPerCurrency: string };
const asRate = (rate: ExactRate) => rate as unknown as string;

describe("Trade Maximizer — Buying preserves the exact entered ratio", () => {
  // Case A. 7.25 = 29/4 currency per item -> reduced currency:item = 29:4.
  // Whole lots of (29 currency, 4 items). Budget 300 -> 10 lots = 290/40;
  // an 11th lot would cost 319 > 300. Current engine returns 297/41, an
  // effective 7.2439.../item.
  it("A: budget 300 at 7.25 (29/4) => receive 40, spend 290", () => {
    const result = expectOk(optimizeBuyTrade("300", "7.25"));
    expect(result.receive).toBe(40);
    expect(result.spend).toBe(290);
  });

  // Case B. 7.1 = 71/10 -> reduced 71:10. Budget 300 -> 4 lots = 284/40; a
  // 5th lot would cost 355 > 300. Current engine returns 298/42.
  it("B: budget 300 at 7.1 (71/10) => receive 40, spend 284", () => {
    const result = expectOk(optimizeBuyTrade("300", "7.1"));
    expect(result.receive).toBe(40);
    expect(result.spend).toBe(284);
  });

  // Case C. Entered as 13.95 items per currency = 279/20 -> reduced
  // currency:item = 20:279. Budget 200 -> 10 lots = 200 currency / 2790 items
  // exactly. This exact reciprocal rate cannot survive the 2-decimal
  // price-per-item conversion at all, so it must be accepted as an exact rate.
  it("C: budget 200 at 13.95 items/currency (279/20) => receive 2790, spend 200", () => {
    const result = expectOk(optimizeBuyTrade("200", asRate({ itemsPerCurrency: "13.95" })));
    expect(result.receive).toBe(2790);
    expect(result.spend).toBe(200);
  });
});

describe("Trade Maximizer — Selling preserves the exact entered ratio", () => {
  // Case D. Entered as 1.53 items per currency = 153/100 -> reduced
  // items:currency = 153:100. Stock 335 -> 2 lots = sell 306 for 200; a 3rd
  // lot would need 459 items. 335 - 306 = 29 remain.
  it("D: stock 335 at 1.53 items/currency (153/100) => receive 200, sell 306, remaining 29", () => {
    const result = expectOk(optimizeSellTrade("335", asRate({ itemsPerCurrency: "1.53" })));
    expect(result.receive).toBe(200);
    expect(result.sell).toBe(306);
    expect(result.remainder).toBe(29);
  });

  // Case E. Entered as 1.6 items per currency = 8/5 -> reduced items:currency
  // = 8:5. Stock 903 -> 112 lots = sell 896 for 560; a 113th lot would need
  // 904 items. 903 - 896 = 7 remain.
  it("E: stock 903 at 1.6 items/currency (8/5) => receive 560, sell 896, remaining 7", () => {
    const result = expectOk(optimizeSellTrade("903", asRate({ itemsPerCurrency: "1.6" })));
    expect(result.receive).toBe(560);
    expect(result.sell).toBe(896);
    expect(result.remainder).toBe(7);
  });
});
