import { describe, expect, it } from "vitest";
import {
  convertCurrency,
  hasUsableTradeResult,
  optimizeBuyTrade,
  optimizeSellTrade,
  parseDecimal,
  parseExactRate,
  parsePricePerItem,
  quickMultiply,
  type BuyTradeResult,
  type ExactExchangeRate,
  type SellTradeResult,
} from "./calculator";

function expectOk<T>(result: { ok: boolean; value?: T; error?: string }): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${result.error}`);
  }
  return result.value as T;
}

// A currency-per-item rate exactly as the user typed it in the Price / Item
// field, and an items-per-currency rate typed in the Items / Currency field.
const cpi = (value: string): ExactExchangeRate => ({ mode: "currencyPerItem", value });
const ipc = (value: string): ExactExchangeRate => ({ mode: "itemsPerCurrency", value });

// --- Independent reference oracle (BigInt/string only) ---------------------
// Cross-checks optimizeBuyTrade/optimizeSellTrade against a second,
// independently written implementation of the exact-ratio spec. Never uses
// Number, parseFloat, or toFixed in any expected-value computation, so nothing
// here can reintroduce the imprecision the suite exists to rule out.

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** Reduces a plain decimal string, read as a currency-per-item price, into an
 * exact lowest-terms trade unit of C currency for I items — by string
 * splitting only, sharing no code with calculator.ts. */
function reducedUnitFromPrice(priceStr: string): { C: bigint; I: bigint } {
  const [whole, frac = ""] = priceStr.split(".");
  const numerator = BigInt((whole || "0") + frac);
  const denominator = 10n ** BigInt(frac.length);
  const g = gcd(numerator, denominator);
  return { C: numerator / g, I: denominator / g };
}

function expectedBuy(budget: number, priceStr: string): { spend: number; receive: number; remainingCurrency: number } {
  const { C, I } = reducedUnitFromPrice(priceStr);
  const batches = BigInt(budget) / C; // floor
  const spend = batches * C;
  return { spend: Number(spend), receive: Number(batches * I), remainingCurrency: Number(BigInt(budget) - spend) };
}

function expectedSell(stock: number, priceStr: string): { sell: number; remainder: number; receive: number } {
  const { C, I } = reducedUnitFromPrice(priceStr);
  const batches = BigInt(stock) / I; // floor
  const sell = batches * I;
  return { sell: Number(sell), remainder: Number(BigInt(stock) - sell), receive: Number(batches * C) };
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

// --- fix/exact-trade-ratios: exact decimal parsing + reduction -------------

describe("parseExactRate — exact decimal parsing and reduction", () => {
  it.each([
    ["7.25", 29n, 4n],
    ["7.1", 71n, 10n],
    ["7.2500", 29n, 4n], // trailing zeros reduce to the same unit
    [".5", 1n, 2n], // leading-decimal notation
    ["13.95", 1395n, 100n], // pre-reduction numerator/denominator...
  ])("currencyPerItem %s reduces to a lowest-terms currency:item unit", (value, _n, _d) => {
    const { currencyAmount, itemAmount } = expectOk(parseExactRate(cpi(value)));
    // The reduced pair is always coprime.
    expect(gcd(currencyAmount, itemAmount)).toBe(1n);
    // And exactly equals value as a fraction: currencyAmount/itemAmount === value.
    const { C, I } = reducedUnitFromPrice(value);
    expect(currencyAmount).toBe(C);
    expect(itemAmount).toBe(I);
  });

  it("currencyPerItem 7.25 -> 29 currency / 4 items", () => {
    expect(expectOk(parseExactRate(cpi("7.25")))).toEqual({ currencyAmount: 29n, itemAmount: 4n });
  });

  it("currencyPerItem 7.1 -> 71 currency / 10 items", () => {
    expect(expectOk(parseExactRate(cpi("7.1")))).toEqual({ currencyAmount: 71n, itemAmount: 10n });
  });

  it("currencyPerItem 7.2500 (trailing zeros) -> 29 currency / 4 items", () => {
    expect(expectOk(parseExactRate(cpi("7.2500")))).toEqual({ currencyAmount: 29n, itemAmount: 4n });
  });

  it("itemsPerCurrency 13.95 -> 20 currency / 279 items (279/20 reciprocal)", () => {
    expect(expectOk(parseExactRate(ipc("13.95")))).toEqual({ currencyAmount: 20n, itemAmount: 279n });
  });

  it("itemsPerCurrency 1.53 -> 100 currency / 153 items", () => {
    expect(expectOk(parseExactRate(ipc("1.53")))).toEqual({ currencyAmount: 100n, itemAmount: 153n });
  });

  it("itemsPerCurrency 1.6 -> 5 currency / 8 items (8/5 reciprocal)", () => {
    expect(expectOk(parseExactRate(ipc("1.6")))).toEqual({ currencyAmount: 5n, itemAmount: 8n });
  });

  it("leading-decimal .5 as currencyPerItem -> 1 currency / 2 items", () => {
    expect(expectOk(parseExactRate(cpi(".5")))).toEqual({ currencyAmount: 1n, itemAmount: 2n });
  });

  it("a currencyPerItem rate and its items-per-currency reciprocal reduce to swapped units", () => {
    const price = expectOk(parseExactRate(cpi("7.25"))); // 29 / 4
    const recip = expectOk(parseExactRate(ipc("7.25"))); // as items-per-currency
    expect(recip.currencyAmount).toBe(price.itemAmount);
    expect(recip.itemAmount).toBe(price.currencyAmount);
  });

  it("parses a high-precision decimal exactly, without rounding", () => {
    // 123456.789 = 123456789/1000; 123456789 is coprime with 1000.
    expect(expectOk(parseExactRate(cpi("123456.789")))).toEqual({
      currencyAmount: 123456789n,
      itemAmount: 1000n,
    });
  });

  it.each(["0", "0.00", ".0"])("rejects a zero rate (%s)", (value) => {
    expect(parseExactRate(cpi(value)).ok).toBe(false);
    expect(parseExactRate(ipc(value)).ok).toBe(false);
  });

  it.each(["-1", "-1.50"])("rejects a negative rate (%s)", (value) => {
    expect(parseExactRate(cpi(value)).ok).toBe(false);
  });

  it.each(["", "abc", ".", "5.", "1.2.3"])("rejects malformed input (%s)", (value) => {
    expect(parseExactRate(cpi(value)).ok).toBe(false);
    expect(parseExactRate(ipc(value)).ok).toBe(false);
  });
});

describe("optimizeBuyTrade", () => {
  it("takes the largest whole multiple of the exact unit: budget 100 at 1.60 (8/5)", () => {
    // 1.60 = 8/5 -> 8 currency for 5 items; floor(100/8) = 12 batches.
    const result = expectOk(optimizeBuyTrade(100, cpi("1.60")));
    expect(result.spend).toBe(96);
    expect(result.receive).toBe(60);
    expect(result.remainingCurrency).toBe(4);
  });

  it("uses the full budget exactly when it divides evenly", () => {
    const result = expectOk(optimizeBuyTrade(100, cpi("2.00")));
    expect(result.spend).toBe(100);
    expect(result.receive).toBe(50);
    expect(result.remainingCurrency).toBe(0);
  });

  it("cannot fully use the budget when the unit doesn't divide it evenly", () => {
    const result = expectOk(optimizeBuyTrade(10, cpi("3.00")));
    expect(result.spend).toBe(9);
    expect(result.receive).toBe(3);
    expect(result.spend).toBeLessThan(10);
  });

  it("returns zero when the budget is smaller than one trade unit", () => {
    const result = expectOk(optimizeBuyTrade(1, cpi("5.00")));
    expect(result.spend).toBe(0);
    expect(result.receive).toBe(0);
    expect(result.remainingCurrency).toBe(1);
  });

  it("never returns a spend greater than the budget", () => {
    const result = expectOk(optimizeBuyTrade(7, cpi("1.10")));
    expect(result.spend).toBeLessThanOrEqual(7);
  });

  it("proves the algorithm finds the maximum valid trade, not merely the first valid one", () => {
    // 2.35 = 47/20 -> 47 currency for 20 items. A brute-force search over
    // batch counts should never beat the optimizer's spend.
    const budget = 137;
    const result = expectOk(optimizeBuyTrade(budget, cpi("2.35")));

    const C = 47n;
    let bestBatches = 0n;
    for (let batches = 0n; batches <= 100n; batches++) {
      if (batches * C <= BigInt(budget) && batches > bestBatches) {
        bestBatches = batches;
      }
    }
    expect(BigInt(result.spend)).toBe(bestBatches * C);
    expect(bestBatches).toBeGreaterThan(0n);
  });

  it("accepts a higher-precision exact price (no 2-decimal cap in the calc path)", () => {
    // 1.999 = 1999/1000. Budget 4000 -> floor(4000/1999) = 2 batches.
    const result = expectOk(optimizeBuyTrade(4000, cpi("1.999")));
    expect(result.spend).toBe(3998);
    expect(result.receive).toBe(2000);
    // Exact ratio invariant holds: spend * I === receive * C.
    expect(3998n * 1000n).toBe(2000n * 1999n);
  });

  it("rejects a non-whole-number budget", () => {
    const result = optimizeBuyTrade("10.5", cpi("1.00"));
    expect(result.ok).toBe(false);
  });

  it("rejects a zero budget", () => {
    const result = optimizeBuyTrade(0, cpi("1.00"));
    expect(result.ok).toBe(false);
  });

  it("rejects a blank budget", () => {
    const result = optimizeBuyTrade("", cpi("1.00"));
    expect(result.ok).toBe(false);
  });

  it("rejects a zero rate", () => {
    expect(optimizeBuyTrade(100, cpi("0")).ok).toBe(false);
  });

  it("buying with a sub-1 price (0.5) yields 20 items for 10 spent", () => {
    const result = expectOk(optimizeBuyTrade(10, cpi("0.5")));
    expect(result.spend).toBe(10);
    expect(result.receive).toBe(20);
  });

  it("leading-decimal notation (.5) matches leading-zero (0.5)", () => {
    const dotForm = expectOk(optimizeBuyTrade(10, cpi(".5")));
    const zeroForm = expectOk(optimizeBuyTrade(10, cpi("0.5")));
    expect(dotForm).toEqual(zeroForm);
  });

  it("a currencyPerItem rate matches its items-per-currency reciprocal entry", () => {
    // 0.5 currency/item is the same rate as 2 items/currency.
    const viaPrice = expectOk(optimizeBuyTrade(21, cpi("0.5")));
    const viaReciprocal = expectOk(optimizeBuyTrade(21, ipc("2")));
    expect(viaPrice).toEqual(viaReciprocal);
  });
});

describe("optimizeSellTrade", () => {
  it("takes the largest whole multiple of the exact unit: stock 62 at 1.60 (8/5)", () => {
    // 1.60 = 8/5 -> 8 currency for 5 items; floor(62/5) = 12 batches.
    const result = expectOk(optimizeSellTrade(62, cpi("1.60")));
    expect(result.sell).toBe(60);
    expect(result.receive).toBe(96);
    expect(result.remainder).toBe(2);
  });

  it("uses the full item count exactly when it divides into whole units", () => {
    const result = expectOk(optimizeSellTrade(50, cpi("2.00")));
    expect(result.sell).toBe(50);
    expect(result.remainder).toBe(0);
    expect(result.receive).toBe(100);
  });

  it("excludes items that can't form another whole unit from the sell quantity", () => {
    // 0.20 = 1/5 -> 1 currency for 5 items. Stock 108 -> 21 whole units = 105
    // items for 21 currency; the other 3 can't make a unit.
    const result = expectOk(optimizeSellTrade(108, cpi("0.20")));
    expect(result.sell).toBe(105);
    expect(result.receive).toBe(21);
    expect(result.remainder).toBe(3);
  });

  it("reports zero sell quantity when the stock is smaller than one trade unit", () => {
    // 0.33 = 33/100 -> 33 currency for 100 items. Stock 3 -> no whole unit.
    const result = expectOk(optimizeSellTrade(3, cpi("0.33")));
    expect(result.sell).toBe(0);
    expect(result.remainder).toBe(3);
    expect(result.receive).toBe(0);
  });

  it("proves selling never spans a partial unit: stock 41 at 1.75 (7/4)", () => {
    // 1.75 = 7/4 -> 7 currency for 4 items; floor(41/4) = 10 batches.
    const result = expectOk(optimizeSellTrade(41, cpi("1.75")));
    expect(result.sell).toBe(40);
    expect(result.receive).toBe(70);
    expect(result.remainder).toBe(1);
    // Exact ratio invariant: sell * C === receive * I.
    expect(40n * 7n).toBe(70n * 4n);
  });

  it("rejects a non-whole-number item count", () => {
    const result = optimizeSellTrade("10.5", cpi("1.00"));
    expect(result.ok).toBe(false);
  });

  it("rejects a zero item count", () => {
    const result = optimizeSellTrade(0, cpi("1.00"));
    expect(result.ok).toBe(false);
  });

  it("rejects a blank item count", () => {
    const result = optimizeSellTrade("", cpi("1.00"));
    expect(result.ok).toBe(false);
  });

  it("accepts a higher-precision exact price (no 2-decimal cap in the calc path)", () => {
    // 1.234 = 617/500. Stock 1000 -> floor(1000/500) = 2 batches.
    const result = expectOk(optimizeSellTrade(1000, cpi("1.234")));
    expect(result.sell).toBe(1000);
    expect(result.receive).toBe(1234);
    expect(result.remainder).toBe(0);
  });

  it("selling with a sub-1 price (0.5) sells all 10 for 5", () => {
    const result = expectOk(optimizeSellTrade(10, cpi("0.5")));
    expect(result.sell).toBe(10);
    expect(result.remainder).toBe(0);
    expect(result.receive).toBe(5);
  });

  it("leading-decimal notation (.5) matches leading-zero (0.5)", () => {
    const dotForm = expectOk(optimizeSellTrade(10, cpi(".5")));
    const zeroForm = expectOk(optimizeSellTrade(10, cpi("0.5")));
    expect(dotForm).toEqual(zeroForm);
  });

  it.each(["0.25", "0.1", "0.01"])(
    "selling with a manually entered sub-1 price (%s) parses and computes without error",
    (price) => {
      const result = optimizeSellTrade(10, cpi(price));
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

// --- Deterministic Buying/Selling matrices + exact-ratio invariants --------

const MATRIX_BUDGETS = [1, 2, 5, 10, 21, 100, 1000];
const MATRIX_STOCKS = [1, 2, 3, 5, 10, 21, 108, 999, 1000];
const MATRIX_PRICES = [
  "0.01", "0.02", "0.04", "0.05", "0.1", "0.2", "0.25", "0.33", "0.5",
  "0.67", "0.99", "1", "1.01", "1.25", "1.5", "2", "2.5", "3", "5", "10", "99.99",
];

const BUY_MATRIX = MATRIX_BUDGETS.flatMap((budget) => MATRIX_PRICES.map((price) => [budget, price] as const));
const SELL_MATRIX = MATRIX_STOCKS.flatMap((stock) => MATRIX_PRICES.map((price) => [stock, price] as const));

describe("Buying — deterministic matrix + exact-ratio invariants", () => {
  it.each(BUY_MATRIX)("budget %s, price %s/item", (budget, price) => {
    const result = expectOk(optimizeBuyTrade(budget, cpi(price)));
    const expected = expectedBuy(budget, price);

    // Matches the independent oracle exactly.
    expect(result.spend).toBe(expected.spend);
    expect(result.receive).toBe(expected.receive);
    expect(result.remainingCurrency).toBe(expected.remainingCurrency);

    const { C, I } = reducedUnitFromPrice(price);
    const spend = BigInt(result.spend);
    const receive = BigInt(result.receive);

    // Whole amounts, spend within budget.
    expect(Number.isInteger(result.spend)).toBe(true);
    expect(Number.isInteger(result.receive)).toBe(true);
    expect(spend).toBeLessThanOrEqual(BigInt(budget));

    // Exact-ratio invariant: spend * itemAmount === receive * currencyAmount.
    expect(spend * I).toBe(receive * C);

    // Maximality: one more whole unit would exceed the budget.
    expect(spend + C).toBeGreaterThan(BigInt(budget));

    // Spend + remaining reconstructs the budget.
    expect(spend + BigInt(result.remainingCurrency)).toBe(BigInt(budget));
  });

  it("awkward examples with leftover budget compute the documented results", () => {
    expect(expectOk(optimizeBuyTrade(10, cpi("3")))).toMatchObject({ spend: 9, receive: 3 });
    expect(expectOk(optimizeBuyTrade(21, cpi("2.5")))).toMatchObject({ spend: 20, receive: 8 });
    expect(expectOk(optimizeBuyTrade(5, cpi("0.67")))).toMatchObject(expectedBuy(5, "0.67"));
    expect(expectOk(optimizeBuyTrade(1, cpi("0.33")))).toMatchObject(expectedBuy(1, "0.33"));
  });

  it(".5 and 0.5 produce identical results across every matrix budget", () => {
    for (const budget of MATRIX_BUDGETS) {
      expect(expectOk(optimizeBuyTrade(budget, cpi(".5")))).toEqual(expectOk(optimizeBuyTrade(budget, cpi("0.5"))));
    }
  });
});

describe("Selling — deterministic matrix + exact-ratio invariants", () => {
  it.each(SELL_MATRIX)("stock %s, price %s/item", (stock, price) => {
    const result = expectOk(optimizeSellTrade(stock, cpi(price)));
    const expected = expectedSell(stock, price);

    expect(result.sell).toBe(expected.sell);
    expect(result.remainder).toBe(expected.remainder);
    expect(result.receive).toBe(expected.receive);

    const { C, I } = reducedUnitFromPrice(price);
    const sell = BigInt(result.sell);
    const remainder = BigInt(result.remainder);
    const receive = BigInt(result.receive);
    const stockBig = BigInt(stock);

    // Whole amounts, non-negative, sell + remainder reconstruct the stock.
    expect(sell).toBeGreaterThanOrEqual(0n);
    expect(remainder).toBeGreaterThanOrEqual(0n);
    expect(receive).toBeGreaterThanOrEqual(0n);
    expect(sell + remainder).toBe(stockBig);

    // Exact-ratio invariant: sell * currencyAmount === receive * itemAmount.
    expect(sell * C).toBe(receive * I);

    // Maximality: one more whole unit would exceed the stock.
    expect(sell + I).toBeGreaterThan(stockBig);
  });

  it("awkward examples with a leftover remainder compute the documented results", () => {
    expect(expectOk(optimizeSellTrade(10, cpi("0.25")))).toMatchObject(expectedSell(10, "0.25"));
    expect(expectOk(optimizeSellTrade(10, cpi("0.33")))).toMatchObject(expectedSell(10, "0.33"));
    expect(expectOk(optimizeSellTrade(21, cpi("0.5")))).toMatchObject(expectedSell(21, "0.5"));
    expect(expectOk(optimizeSellTrade(3, cpi("0.1")))).toMatchObject(expectedSell(3, "0.1"));
    expect(expectOk(optimizeSellTrade(999, cpi("0.67")))).toMatchObject(expectedSell(999, "0.67"));
  });

  it("stock 108 at 5 items/currency (0.20/item) leaves 3 unsellable", () => {
    const result = expectOk(optimizeSellTrade(108, cpi("0.20")));
    expect(result.sell).toBe(105);
    expect(result.receive).toBe(21);
    expect(result.remainder).toBe(3);
  });

  it(".5 and 0.5 produce identical results across every matrix stock level", () => {
    for (const stock of MATRIX_STOCKS) {
      expect(expectOk(optimizeSellTrade(stock, cpi(".5")))).toEqual(expectOk(optimizeSellTrade(stock, cpi("0.5"))));
    }
  });
});

// --- Boundary behaviour ----------------------------------------------------

describe("boundary behaviour around the exact trade unit", () => {
  // 7.25 = 29 currency / 4 items.
  it("budget below one unit yields nothing", () => {
    const result = expectOk(optimizeBuyTrade(28, cpi("7.25")));
    expect(result).toMatchObject({ spend: 0, receive: 0, remainingCurrency: 28 });
  });

  it("budget of exactly one unit yields exactly one unit", () => {
    const result = expectOk(optimizeBuyTrade(29, cpi("7.25")));
    expect(result).toMatchObject({ spend: 29, receive: 4, remainingCurrency: 0 });
  });

  it("budget one below the next multiple stops at the current multiple", () => {
    // 2 units = 58; one below the 3rd unit (87) is 86.
    const result = expectOk(optimizeBuyTrade(86, cpi("7.25")));
    expect(result).toMatchObject({ spend: 58, receive: 8, remainingCurrency: 28 });
  });

  it("budget of an exact multiple uses all of it", () => {
    const result = expectOk(optimizeBuyTrade(87, cpi("7.25")));
    expect(result).toMatchObject({ spend: 87, receive: 12, remainingCurrency: 0 });
  });

  // Selling with 1.53 items/currency = 100 currency / 153 items.
  it("stock below one unit sells nothing", () => {
    const result = expectOk(optimizeSellTrade(152, ipc("1.53")));
    expect(result).toMatchObject({ sell: 0, receive: 0, remainder: 152 });
  });

  it("stock of exactly one unit sells one unit", () => {
    const result = expectOk(optimizeSellTrade(153, ipc("1.53")));
    expect(result).toMatchObject({ sell: 153, receive: 100, remainder: 0 });
  });

  it("stock one below the next multiple stops at the current multiple", () => {
    // 2 units = 306; one below the 3rd (459) is 458.
    const result = expectOk(optimizeSellTrade(458, ipc("1.53")));
    expect(result).toMatchObject({ sell: 306, receive: 200, remainder: 152 });
  });

  it("handles very large BigInt-safe values without overflow or float error", () => {
    // Budget 1,000,000,000 at 7.25 (29/4): floor(1e9 / 29) = 34,482,758 units.
    const result = expectOk(optimizeBuyTrade(1_000_000_000, cpi("7.25")));
    expect(result.spend).toBe(34_482_758 * 29);
    expect(result.receive).toBe(34_482_758 * 4);
    // Still exact and within Number's safe integer range.
    expect(Number.isSafeInteger(result.receive)).toBe(true);
    expect(BigInt(result.spend) * 4n).toBe(BigInt(result.receive) * 29n);
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
    // 1 item at 0.50 (1 currency / 2 items): can't form a whole unit.
    const sell = expectOk<SellTradeResult>(optimizeSellTrade("1", cpi("0.50")));
    expect(sell.receive).toBe(0);
    expect(hasUsableTradeResult(sell)).toBe(false);

    // Parity with buying: 1 currency at 2.00/item can't afford a single unit.
    const buy = expectOk<BuyTradeResult>(optimizeBuyTrade("1", cpi("2.00")));
    expect(buy.receive).toBe(0);
    expect(hasUsableTradeResult(buy)).toBe(false);

    // A sell that does earn currency is still usable.
    const okSell = expectOk<SellTradeResult>(optimizeSellTrade("2", cpi("1.00")));
    expect(okSell.receive).toBeGreaterThan(0);
    expect(hasUsableTradeResult(okSell)).toBe(true);
  });
});
