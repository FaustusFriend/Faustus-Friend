import { describe, expect, it } from "vitest";
import {
  convertCurrency,
  hasUsableTradeResult,
  optimizeBuyTrade,
  optimizeSellTrade,
  parseDecimal,
  parsePricePerItem,
  quickMultiply,
  type BuyTradeResult,
  type SellTradeResult,
} from "./calculator";

function expectOk<T>(result: { ok: boolean; value?: T; error?: string }): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${result.error}`);
  }
  return result.value as T;
}

// --- Task 21B: independent reference oracle -------------------------------
// Cross-checks optimizeBuyTrade/optimizeSellTrade against a second,
// independently written implementation of the same spec. Deliberately
// re-parses decimal strings by hand instead of calling parseDecimal /
// parsePricePerItem, so a shared parsing bug can't hide identically in both
// the code under test and its oracle. Only BigInt and string arithmetic are
// used — never Number, parseFloat, or toFixed — so nothing here can
// introduce the kind of imprecision this suite is trying to rule out.

/** Parses a plain "123", "1.6", "1.60", or ".5" style string into integer
 * cents, via string splitting only (no shared code with calculator.ts). */
function centsFromDecimalStr(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  const paddedFrac = (frac + "00").slice(0, 2);
  return BigInt((whole || "0") + paddedFrac);
}

function centsToPriceStr(cents: bigint): string {
  const whole = cents / 100n;
  const frac = cents % 100n;
  return `${whole}.${frac.toString().padStart(2, "0")}`;
}

/** Exact price-per-item <-> items-per-currency pairs — 10000n divides evenly
 * by every one of these, so converting between the two forms needs no
 * rounding at all, keeping this table itself exact. */
const EXACT_RECIPROCALS: ReadonlyArray<{ price: string; itemsPerCurrency: bigint }> = [
  { price: "0.5", itemsPerCurrency: 2n },
  { price: "0.25", itemsPerCurrency: 4n },
  { price: "0.2", itemsPerCurrency: 5n },
  { price: "0.1", itemsPerCurrency: 10n },
  { price: "0.05", itemsPerCurrency: 20n },
  { price: "0.04", itemsPerCurrency: 25n },
  { price: "0.02", itemsPerCurrency: 50n },
  { price: "0.01", itemsPerCurrency: 100n },
];

/** Re-derives price-per-item cents from items-per-currency (a plain integer
 * count, not itself cents-scaled) using only exact BigInt division — throws
 * rather than silently rounding if the pair given doesn't divide evenly,
 * since this oracle must never approximate. */
function priceCentsFromItemsPerCurrency(itemsPerCurrency: bigint): bigint {
  if (100n % itemsPerCurrency !== 0n) {
    throw new Error(`${itemsPerCurrency} does not divide 100 evenly — not a valid exact-reciprocal fixture`);
  }
  return 100n / itemsPerCurrency;
}

function expectedBuy(budget: number, priceStr: string): { spend: number; receive: number } {
  const priceCents = centsFromDecimalStr(priceStr);
  const budgetCents = BigInt(budget) * 100n;
  const receive = budgetCents / priceCents; // floor
  const spend = (receive * priceCents) / 100n; // floor
  return { spend: Number(spend), receive: Number(receive) };
}

function expectedSell(stock: number, priceStr: string): { sell: number; remainder: number; receive: number } {
  const priceCents = centsFromDecimalStr(priceStr);
  const items = BigInt(stock);
  const totalCents = items * priceCents; // exact
  const receive = totalCents / 100n; // floor
  const sell = receive === 0n ? 0n : (receive * 100n + priceCents - 1n) / priceCents; // ceil
  const remainder = items - sell;
  return { sell: Number(sell), remainder: Number(remainder), receive: Number(receive) };
}

describe("parsePricePerItem", () => {
  it("accepts a whole-number price", () => {
    const result = parsePricePerItem("2");
    expect(expectOk(result)).toBe(200n);
  });

  it("accepts a one-decimal price", () => {
    const result = parsePricePerItem("1.6");
    expect(expectOk(result)).toBe(160n);
  });

  it("accepts a two-decimal price", () => {
    const result = parsePricePerItem("1.60");
    expect(expectOk(result)).toBe(160n);
  });

  it("rejects a price with more than 2 decimal places", () => {
    const result = parsePricePerItem("1.605");
    expect(result.ok).toBe(false);
  });

  it("rejects a zero price", () => {
    const result = parsePricePerItem("0");
    expect(result.ok).toBe(false);
  });

  it("rejects a negative price", () => {
    const result = parsePricePerItem("-1.50");
    expect(result.ok).toBe(false);
  });

  it("rejects a blank price", () => {
    const result = parsePricePerItem("");
    expect(result.ok).toBe(false);
  });

  it("rejects a non-numeric price", () => {
    const result = parsePricePerItem("abc");
    expect(result.ok).toBe(false);
  });

  // Task 21: manually entered prices below 1 must parse the same as their
  // computed reciprocals, whether typed with or without the leading zero.
  it.each([
    ["0.5", 50n],
    [".5", 50n],
    ["0.25", 25n],
    [".25", 25n],
    ["0.1", 10n],
    [".1", 10n],
    ["0.01", 1n],
    [".01", 1n],
  ])("accepts %s as a valid sub-1 price (%d cents)", (input, cents) => {
    expect(expectOk(parsePricePerItem(input))).toBe(cents);
  });

  it("parses leading-decimal notation identically to its leading-zero form", () => {
    expect(expectOk(parsePricePerItem(".5"))).toBe(expectOk(parsePricePerItem("0.5")));
  });

  it("still rejects a bare decimal point", () => {
    const result = parsePricePerItem(".");
    expect(result.ok).toBe(false);
  });

  it("still rejects a trailing decimal point with no fractional digits", () => {
    const result = parsePricePerItem("5.");
    expect(result.ok).toBe(false);
  });

  it("still rejects multiple decimal points", () => {
    const result = parsePricePerItem("1.2.3");
    expect(result.ok).toBe(false);
  });
});

describe("parseDecimal — leading-decimal notation", () => {
  it("parses \".5\" the same as \"0.5\"", () => {
    const dotForm = expectOk(parseDecimal(".5", "Price"));
    const zeroForm = expectOk(parseDecimal("0.5", "Price"));
    expect(dotForm.scaled).toBe(zeroForm.scaled);
    expect(dotForm.decimals).toBe(zeroForm.decimals);
  });

  it("rejects an incomplete leading-decimal input (bare '.')", () => {
    expect(parseDecimal(".", "Price").ok).toBe(false);
  });
});

describe("optimizeBuyTrade", () => {
  it("matches the spec example: budget 100, price 1.60 => spend 99, receive 62", () => {
    const result = expectOk(optimizeBuyTrade(100, "1.60"));
    expect(result.spend).toBe(99);
    expect(result.receive).toBe(62);
    expect(result.approxRate).toBe("1.60");
  });

  it("uses the full budget exactly when it divides evenly", () => {
    const result = expectOk(optimizeBuyTrade(100, "2.00"));
    expect(result.spend).toBe(100);
    expect(result.receive).toBe(50);
    expect(result.approxRate).toBe("2.00");
  });

  it("cannot fully use the budget when price doesn't divide evenly", () => {
    const result = expectOk(optimizeBuyTrade(10, "3.00"));
    expect(result.spend).toBe(9);
    expect(result.receive).toBe(3);
    expect(result.spend).toBeLessThan(10);
  });

  it("returns zero when the budget is smaller than one item", () => {
    const result = expectOk(optimizeBuyTrade(1, "5.00"));
    expect(result.spend).toBe(0);
    expect(result.receive).toBe(0);
  });

  it("never returns a spend greater than the budget", () => {
    const result = expectOk(optimizeBuyTrade(7, "1.10"));
    expect(result.spend).toBeLessThanOrEqual(7);
  });

  it("proves the algorithm finds the maximum valid trade, not merely the first valid one", () => {
    // A brute-force search over every possible receive quantity should never
    // find a larger valid receive than the optimizer returns.
    const budget = 137;
    const price = "2.35"; // 235 cents
    const result = expectOk(optimizeBuyTrade(budget, price));

    const priceCents = 235n;
    const budgetCents = BigInt(budget) * 100n;
    let bestBruteForceReceive = 0n;
    for (let receive = 0n; receive <= 100n; receive++) {
      const cost = receive * priceCents;
      if (cost <= budgetCents && receive > bestBruteForceReceive) {
        bestBruteForceReceive = receive;
      }
    }

    expect(BigInt(result.receive)).toBe(bestBruteForceReceive);
    expect(bestBruteForceReceive).toBeGreaterThan(0n);
  });

  it("rejects a budget with more than 2 decimal places passed through price validation", () => {
    const result = optimizeBuyTrade(100, "1.999");
    expect(result.ok).toBe(false);
  });

  it("rejects a non-whole-number budget", () => {
    const result = optimizeBuyTrade("10.5", "1.00");
    expect(result.ok).toBe(false);
  });

  it("rejects a zero budget", () => {
    const result = optimizeBuyTrade(0, "1.00");
    expect(result.ok).toBe(false);
  });

  it("rejects a blank budget", () => {
    const result = optimizeBuyTrade("", "1.00");
    expect(result.ok).toBe(false);
  });

  // Task 21 regression: budget 10, price 0.5/item => 20 items for 10 spent.
  it("Task 21: buying with a manually entered sub-1 price (0.5)", () => {
    const result = expectOk(optimizeBuyTrade(10, "0.5"));
    expect(result.spend).toBe(10);
    expect(result.receive).toBe(20);
  });

  it("Task 21: buying with leading-decimal notation (.5) matches leading-zero (0.5)", () => {
    const dotForm = expectOk(optimizeBuyTrade(10, ".5"));
    const zeroForm = expectOk(optimizeBuyTrade(10, "0.5"));
    expect(dotForm).toEqual(zeroForm);
  });

  // Task 21B Part 1: the previous version of this test derived the
  // reciprocal price with `(1 / Number(itemsPerCurrency)).toFixed(2)` —
  // floating-point division establishing a "mathematical truth" the test
  // then checked itself against. Replaced with the exact reciprocal table
  // and a BigInt-only re-derivation (see EXACT_RECIPROCALS /
  // priceCentsFromItemsPerCurrency above), so no float ever enters the
  // expected-value computation.
  it.each(EXACT_RECIPROCALS)(
    "Task 21: price $price matches its reciprocal of $itemsPerCurrency items-per-currency",
    ({ price, itemsPerCurrency }) => {
      // Sanity: the fixture table is internally consistent — compare by cents
      // value, not by string, since "0.5" and "0.50" are equal prices with
      // different (both valid) decimal-place formatting.
      expect(priceCentsFromItemsPerCurrency(itemsPerCurrency)).toBe(centsFromDecimalStr(price));

      const derivedPrice = centsToPriceStr(priceCentsFromItemsPerCurrency(itemsPerCurrency));
      const viaPrice = expectOk(optimizeBuyTrade(10, price));
      const viaReciprocal = expectOk(optimizeBuyTrade(10, derivedPrice));
      expect(viaPrice).toEqual(viaReciprocal);
    },
  );
});

describe("optimizeSellTrade", () => {
  it("sells all items and floors the currency received", () => {
    const result = expectOk(optimizeSellTrade(62, "1.60"));
    expect(result.sell).toBe(62);
    expect(result.remainder).toBe(0);
    expect(result.receive).toBe(99);
    expect(result.approxRate).toBe("1.60");
  });

  it("uses the full item count exactly when value divides evenly", () => {
    const result = expectOk(optimizeSellTrade(50, "2.00"));
    expect(result.sell).toBe(50);
    expect(result.remainder).toBe(0);
    expect(result.receive).toBe(100);
  });

  it("Task 20 Bug 1: excludes items that would floor away for zero currency from the sell quantity", () => {
    // Stock 108 at a rate of 5 items per currency (price per item = 1/5 =
    // 0.20). Only 105 items (21 full lots of 5) are needed to earn the 21
    // currency received — the other 3 would be handed over for nothing.
    const result = expectOk(optimizeSellTrade(108, "0.20"));
    expect(result.sell).toBe(105);
    expect(result.receive).toBe(21);
    expect(result.remainder).toBe(3);
  });

  it("reports zero sell quantity (not the full stock) when the total value floors to zero currency", () => {
    // Task 20 Bug 1 follow-through: if even the full stock's value floors
    // to 0 currency, selling any of it earns nothing, so none of it should
    // be reported as sellable — the previous behavior recommended selling
    // all 3 items away for 0 currency in return.
    const result = expectOk(optimizeSellTrade(3, "0.33"));
    expect(result.sell).toBe(0);
    expect(result.remainder).toBe(3);
    expect(result.receive).toBe(0); // 0.99 total, floored to 0 whole currency
  });

  it("proves selling fewer items never yields more currency than selling all of them", () => {
    const items = 41;
    const price = "1.75"; // 175 cents
    const result = expectOk(optimizeSellTrade(items, price));

    const priceCents = 175n;
    let bestBruteForceReceive = -1n;
    for (let sell = 0n; sell <= BigInt(items); sell++) {
      const receive = (sell * priceCents) / 100n;
      if (receive > bestBruteForceReceive) {
        bestBruteForceReceive = receive;
      }
    }

    expect(result.sell).toBe(items);
    expect(result.remainder).toBe(0);
    expect(BigInt(result.receive)).toBe(bestBruteForceReceive);
  });

  it("rejects a non-whole-number item count", () => {
    const result = optimizeSellTrade("10.5", "1.00");
    expect(result.ok).toBe(false);
  });

  it("rejects a zero item count", () => {
    const result = optimizeSellTrade(0, "1.00");
    expect(result.ok).toBe(false);
  });

  it("rejects a blank item count", () => {
    const result = optimizeSellTrade("", "1.00");
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid price with more than 2 decimals", () => {
    const result = optimizeSellTrade(10, "1.234");
    expect(result.ok).toBe(false);
  });

  // Task 21 regression: stock 10, price 0.5/item => sell all 10, receive 5.
  it("Task 21: selling with a manually entered sub-1 price (0.5)", () => {
    const result = expectOk(optimizeSellTrade(10, "0.5"));
    expect(result.sell).toBe(10);
    expect(result.remainder).toBe(0);
    expect(result.receive).toBe(5);
  });

  it("Task 21: selling with leading-decimal notation (.5) matches leading-zero (0.5)", () => {
    const dotForm = expectOk(optimizeSellTrade(10, ".5"));
    const zeroForm = expectOk(optimizeSellTrade(10, "0.5"));
    expect(dotForm).toEqual(zeroForm);
  });

  it.each(["0.25", "0.1", "0.01"])(
    "Task 21: selling with a manually entered sub-1 price (%s) parses and computes without error",
    (price) => {
      const result = optimizeSellTrade(10, price);
      expect(result.ok).toBe(true);
    },
  );
});

describe("convertCurrency", () => {
  it("converts Divine to Chaos using the exchange rate", () => {
    const result = expectOk(
      convertCurrency({ amount: "2", exchangeRate: "150", direction: "divineToChaos" }),
    );
    expect(result).toBe("300.00");
  });

  it("converts Chaos to Divine using the exchange rate", () => {
    const result = expectOk(
      convertCurrency({ amount: "300", exchangeRate: "150", direction: "chaosToDivine" }),
    );
    expect(result).toBe("2.00");
  });

  it("rounds a non-exact conversion to 2 decimals", () => {
    const result = expectOk(
      convertCurrency({ amount: "1", exchangeRate: "3", direction: "chaosToDivine" }),
    );
    expect(result).toBe("0.33");
  });

  it("rejects a zero exchange rate", () => {
    const result = convertCurrency({ amount: "10", exchangeRate: "0", direction: "chaosToDivine" });
    expect(result.ok).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = convertCurrency({ amount: "-5", exchangeRate: "150", direction: "divineToChaos" });
    expect(result.ok).toBe(false);
  });

  it("rejects a blank amount", () => {
    const result = convertCurrency({ amount: "", exchangeRate: "150", direction: "divineToChaos" });
    expect(result.ok).toBe(false);
  });
});

describe("quickMultiply", () => {
  it("multiplies two whole numbers", () => {
    const result = expectOk(quickMultiply("8", "40"));
    expect(result).toBe("320.00");
  });

  it("multiplies decimal price by whole quantity", () => {
    const result = expectOk(quickMultiply("1.5", "3"));
    expect(result).toBe("4.50");
  });

  it("multiplies two decimal values", () => {
    const result = expectOk(quickMultiply("1.25", "2.5"));
    expect(result).toBe("3.13");
  });

  it("rounds a non-exact product to 2 decimals (round-half-up)", () => {
    const result = expectOk(quickMultiply("1", "0.335"));
    // 1 * 0.335 = 0.335 -> rounds to 0.34
    expect(result).toBe("0.34");
  });

  it("does not floor to whole items — fractional quantities are exact", () => {
    const result = expectOk(quickMultiply("10", "1.5"));
    expect(result).toBe("15.00");
  });

  it("allows a zero price (plain multiplication, not a trade-optimization price)", () => {
    const result = expectOk(quickMultiply("0", "5"));
    expect(result).toBe("0.00");
  });

  it("rejects a blank price", () => {
    const result = quickMultiply("", "5");
    expect(result.ok).toBe(false);
  });

  it("rejects a blank quantity", () => {
    const result = quickMultiply("5", "");
    expect(result.ok).toBe(false);
  });

  it("rejects a non-numeric price", () => {
    const result = quickMultiply("abc", "5");
    expect(result.ok).toBe(false);
  });

  it("rejects a negative quantity", () => {
    const result = quickMultiply("5", "-2");
    expect(result.ok).toBe(false);
  });
});

// --- Task 21B Part 2: deterministic Buying/Selling matrices ---------------

const MATRIX_BUDGETS = [1, 2, 5, 10, 21, 100, 1000];
const MATRIX_STOCKS = [1, 2, 3, 5, 10, 21, 108, 999, 1000];
const MATRIX_PRICES = [
  "0.01", "0.02", "0.04", "0.05", "0.1", "0.2", "0.25", "0.33", "0.5",
  "0.67", "0.99", "1", "1.01", "1.25", "1.5", "2", "2.5", "3", "5", "10", "99.99",
];

const BUY_MATRIX = MATRIX_BUDGETS.flatMap((budget) => MATRIX_PRICES.map((price) => [budget, price] as const));
const SELL_MATRIX = MATRIX_STOCKS.flatMap((stock) => MATRIX_PRICES.map((price) => [stock, price] as const));

describe("Task 21B: Buying — deterministic matrix + invariants", () => {
  it.each(BUY_MATRIX)("budget %s, price %s/item", (budget, price) => {
    const result = expectOk(optimizeBuyTrade(budget, price));
    const expected = expectedBuy(budget, price);

    // Matches the independent oracle exactly.
    expect(result.spend).toBe(expected.spend);
    expect(result.receive).toBe(expected.receive);

    const priceCents = centsFromDecimalStr(price);
    const budgetCents = BigInt(budget) * 100n;
    const receive = BigInt(result.receive);
    const spend = BigInt(result.spend);

    // spend/receive are whole amounts and spend never exceeds the budget.
    expect(Number.isInteger(result.spend)).toBe(true);
    expect(Number.isInteger(result.receive)).toBe(true);
    expect(spend).toBeLessThanOrEqual(budgetCents / 100n);

    // Reported spend satisfies the exact listing ratio (floor of receive * price).
    expect(spend).toBe((receive * priceCents) / 100n);

    // Maximality: no larger whole-item receive quantity fits the same budget.
    expect((receive + 1n) * priceCents).toBeGreaterThan(budgetCents);
  });

  it("awkward examples with leftover budget compute the documented results", () => {
    expect(expectOk(optimizeBuyTrade(10, "3"))).toMatchObject({ spend: 9, receive: 3 });
    expect(expectOk(optimizeBuyTrade(21, "2.5"))).toMatchObject({ spend: 20, receive: 8 });
    expect(expectOk(optimizeBuyTrade(5, "0.67"))).toMatchObject(expectedBuy(5, "0.67"));
    expect(expectOk(optimizeBuyTrade(1, "0.33"))).toMatchObject(expectedBuy(1, "0.33"));
  });

  it(".5 and 0.5 produce identical results across every matrix budget", () => {
    for (const budget of MATRIX_BUDGETS) {
      expect(expectOk(optimizeBuyTrade(budget, ".5"))).toEqual(expectOk(optimizeBuyTrade(budget, "0.5")));
    }
  });

  it("price-per-item and its exact items-per-currency reciprocal produce identical results", () => {
    for (const { price, itemsPerCurrency } of EXACT_RECIPROCALS) {
      const derivedPrice = centsToPriceStr(priceCentsFromItemsPerCurrency(itemsPerCurrency));
      for (const budget of MATRIX_BUDGETS) {
        expect(expectOk(optimizeBuyTrade(budget, price))).toEqual(expectOk(optimizeBuyTrade(budget, derivedPrice)));
      }
    }
  });
});

describe("Task 21B: Selling — deterministic matrix + invariants", () => {
  it.each(SELL_MATRIX)("stock %s, price %s/item", (stock, price) => {
    const result = expectOk(optimizeSellTrade(stock, price));
    const expected = expectedSell(stock, price);

    expect(result.sell).toBe(expected.sell);
    expect(result.remainder).toBe(expected.remainder);
    expect(result.receive).toBe(expected.receive);

    const priceCents = centsFromDecimalStr(price);
    const sell = BigInt(result.sell);
    const remainder = BigInt(result.remainder);
    const receive = BigInt(result.receive);
    const stockBig = BigInt(stock);

    // Whole amounts, non-negative, and sell + remainder reconstruct the stock.
    expect(sell).toBeGreaterThanOrEqual(0n);
    expect(remainder).toBeGreaterThanOrEqual(0n);
    expect(receive).toBeGreaterThanOrEqual(0n);
    expect(sell + remainder).toBe(stockBig);

    // No item is handed over without contributing to the received amount:
    // selling the full stock floors to the same whole-currency receive.
    expect((stockBig * priceCents) / 100n).toBe(receive);

    // sell is the minimum quantity whose value covers receive (a ceiling):
    // one fewer item would fall short, `sell` itself covers or exceeds it.
    expect((sell * priceCents) / 100n).toBeGreaterThanOrEqual(receive);
    if (sell > 0n) {
      expect(((sell - 1n) * priceCents) / 100n).toBeLessThan(receive);
    }
  });

  it("awkward examples with a leftover remainder compute the documented results", () => {
    expect(expectOk(optimizeSellTrade(10, "0.25"))).toMatchObject(expectedSell(10, "0.25"));
    expect(expectOk(optimizeSellTrade(10, "0.33"))).toMatchObject(expectedSell(10, "0.33"));
    expect(expectOk(optimizeSellTrade(21, "0.5"))).toMatchObject(expectedSell(21, "0.5"));
    expect(expectOk(optimizeSellTrade(3, "0.1"))).toMatchObject(expectedSell(3, "0.1"));
    expect(expectOk(optimizeSellTrade(999, "0.67"))).toMatchObject(expectedSell(999, "0.67"));
  });

  it("the known Task 20 regression remains correct: stock 108 at 5 items/currency", () => {
    // 5 items per currency == price 0.20/item (an exact reciprocal).
    const result = expectOk(optimizeSellTrade(108, "0.20"));
    expect(result.sell).toBe(105);
    expect(result.receive).toBe(21);
    expect(result.remainder).toBe(3);
  });

  it(".5 and 0.5 produce identical results across every matrix stock level", () => {
    for (const stock of MATRIX_STOCKS) {
      expect(expectOk(optimizeSellTrade(stock, ".5"))).toEqual(expectOk(optimizeSellTrade(stock, "0.5")));
    }
  });

  it("price-per-item and its exact items-per-currency reciprocal produce identical results", () => {
    for (const { price, itemsPerCurrency } of EXACT_RECIPROCALS) {
      const derivedPrice = centsToPriceStr(priceCentsFromItemsPerCurrency(itemsPerCurrency));
      for (const stock of MATRIX_STOCKS) {
        expect(expectOk(optimizeSellTrade(stock, price))).toEqual(expectOk(optimizeSellTrade(stock, derivedPrice)));
      }
    }
  });
});

describe("Task 21B Part 4: formatting invariants", () => {
  const NUMERIC_2DP = /^-?\d+\.\d{2}$/; // no NaN, no Infinity, no scientific notation, exactly 2dp

  it("optimizeBuyTrade never reports a non-numeric or malformed approxRate", () => {
    for (const [budget, price] of BUY_MATRIX) {
      const result = expectOk(optimizeBuyTrade(budget, price));
      expect(result.approxRate).toMatch(NUMERIC_2DP);
      expect(result.approxRate).not.toBe("-0.00");
    }
  });

  it("optimizeSellTrade never reports a non-numeric or malformed approxRate", () => {
    for (const [stock, price] of SELL_MATRIX) {
      const result = expectOk(optimizeSellTrade(stock, price));
      expect(result.approxRate).toMatch(NUMERIC_2DP);
      expect(result.approxRate).not.toBe("-0.00");
    }
  });

  it("quickMultiply and convertCurrency never produce NaN/Infinity/scientific notation", () => {
    expect(expectOk(quickMultiply("99.99", "1000"))).toMatch(NUMERIC_2DP);
    expect(expectOk(quickMultiply("0.01", "0.01"))).toMatch(NUMERIC_2DP);
    expect(expectOk(convertCurrency({ amount: "1000", exchangeRate: "0.01", direction: "chaosToDivine" }))).toMatch(
      NUMERIC_2DP,
    );
  });
});

describe("hasUsableTradeResult", () => {
  it("rejects a null result", () => {
    expect(hasUsableTradeResult(null)).toBe(false);
  });

  it("rejects a zero-receive result as unavailable", () => {
    expect(hasUsableTradeResult({ receive: 0 })).toBe(false);
  });

  it("accepts a positive-receive result", () => {
    expect(hasUsableTradeResult({ receive: 5 })).toBe(true);
  });

  it("treats a sell that yields no currency as unavailable, matching buy", () => {
    // 1 item at 0.50 each: total value 0.50 floors to 0 currency received.
    const sell = expectOk<SellTradeResult>(optimizeSellTrade("1", "0.50"));
    expect(sell.receive).toBe(0);
    expect(hasUsableTradeResult(sell)).toBe(false);

    // Parity with buying: 1 currency at 2.00/item can't afford a single item.
    const buy = expectOk<BuyTradeResult>(optimizeBuyTrade("1", "2.00"));
    expect(buy.receive).toBe(0);
    expect(hasUsableTradeResult(buy)).toBe(false);

    // A sell that does earn currency is still usable.
    const okSell = expectOk<SellTradeResult>(optimizeSellTrade("2", "1.00"));
    expect(okSell.receive).toBeGreaterThan(0);
    expect(hasUsableTradeResult(okSell)).toBe(true);
  });
});
