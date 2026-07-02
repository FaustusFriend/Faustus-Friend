import { describe, expect, it } from "vitest";
import {
  convertCurrency,
  optimizeBuyTrade,
  optimizeSellTrade,
  parsePricePerItem,
} from "./calculator";

function expectOk<T>(result: { ok: boolean; value?: T; error?: string }): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${result.error}`);
  }
  return result.value as T;
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
});

describe("optimizeSellTrade", () => {
  it("sells all items and floors the currency received", () => {
    const result = expectOk(optimizeSellTrade(62, "1.60"));
    expect(result.sell).toBe(62);
    expect(result.receive).toBe(99);
    expect(result.approxRate).toBe("1.60");
  });

  it("uses the full item count exactly when value divides evenly", () => {
    const result = expectOk(optimizeSellTrade(50, "2.00"));
    expect(result.sell).toBe(50);
    expect(result.receive).toBe(100);
  });

  it("floors currency received when the total value isn't a whole number", () => {
    const result = expectOk(optimizeSellTrade(3, "0.33"));
    expect(result.sell).toBe(3);
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
