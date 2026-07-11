import { describe, expect, it } from "vitest";
import { compareListings, formatCompareVerdict } from "./compare";

function expectOk<T>(result: { ok: boolean; value?: T; error?: string }): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${result.error}`);
  }
  return result.value as T;
}

// --- Task 21B Part 3: independent reference oracle for compareListings ----
// A second, independently written fraction-based implementation of the same
// buy/sell comparison spec, used to cross-check compareListings' math.
// Deliberately re-parses decimals by hand rather than reusing parseDecimal /
// parsePricePerItem from calculator.ts, and never touches Number, parseFloat,
// or toFixed — only BigInt and string arithmetic, so it can't hide a shared
// parsing or rounding bug behind agreement-with-itself.

interface Frac {
  num: bigint;
  den: bigint;
}

function centsFromDecimalStr(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  const paddedFrac = (frac + "00").slice(0, 2);
  return BigInt((whole || "0") + paddedFrac);
}

/** Price-per-item fraction (num/den, in cents) from either a direct "price"
 * entry or an "qty" (items-per-currency) entry via its reciprocal. */
function priceFrac(value: string, format: "price" | "qty"): Frac {
  const cents = centsFromDecimalStr(value);
  if (format === "price") return { num: cents, den: 1n };
  return { num: 10000n, den: cents }; // 100 / (cents/100), kept exact
}

function toChaosEquivalentFrac(divFrac: Frac, rateStr: string): Frac {
  const rateCents = centsFromDecimalStr(rateStr);
  return { num: divFrac.num * rateCents, den: divFrac.den * 100n };
}

function cmpFrac(a: Frac, b: Frac): -1 | 0 | 1 {
  const left = a.num * b.den;
  const right = b.num * a.den;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Formats a cents-fraction (num/den, in cents) as a plain 2dp currency
 * string, rounded half-up, using only BigInt math. */
function formatCentsFracStr(frac: Frac): string {
  const negative = (frac.num < 0n) !== (frac.den < 0n);
  const n = frac.num < 0n ? -frac.num : frac.num;
  const d = (frac.den < 0n ? -frac.den : frac.den) * 100n;
  const scale = 100n;
  const scaledNum = n * scale;
  let result = scaledNum / d;
  const remainder = scaledNum % d;
  if (remainder * 2n >= d) result += 1n;
  const whole = result / scale;
  const fracDigits = result % scale;
  const sign = negative && result !== 0n ? "-" : "";
  return `${sign}${whole}.${fracDigits.toString().padStart(2, "0")}`;
}

type ListingFormatT = "price" | "qty";
type CompareModeT = "buying" | "selling";

function expectedCompare(
  mode: CompareModeT,
  rate: string,
  chaos: string,
  chaosFormat: ListingFormatT,
  div: string,
  divFormat: ListingFormatT,
): { chaosPerItem: string; divChaosPerItem: string; winner: "chaos" | "divine" | "tie" } {
  const chaosFraction = priceFrac(chaos, chaosFormat);
  const divFraction = priceFrac(div, divFormat);
  const divChaosFraction = toChaosEquivalentFrac(divFraction, rate);
  const cmp = cmpFrac(chaosFraction, divChaosFraction);

  let winner: "chaos" | "divine" | "tie";
  if (cmp === 0) winner = "tie";
  else if (mode === "buying") winner = cmp < 0 ? "chaos" : "divine";
  else winner = cmp > 0 ? "chaos" : "divine";

  return {
    chaosPerItem: formatCentsFracStr(chaosFraction),
    divChaosPerItem: formatCentsFracStr(divChaosFraction),
    winner,
  };
}

describe("compareListings", () => {
  it("matches the design example: rate 215, chaos 42/item, divine 0.2/item => Chaos wins buying", () => {
    const result = expectOk(
      compareListings({
        mode: "buying",
        rate: "215",
        chaos: "42",
        chaosFormat: "price",
        div: "0.2",
        divFormat: "price",
      }),
    );
    expect(result.chaosPerItem).toBe("42.00");
    expect(result.divChaosPerItem).toBe("43.00");
    expect(result.winner).toBe("chaos");
    expect(result.diffChaos).toBe("1.00");
    expect(result.diffPercent).toBe("2.33"); // 1 / 43, the pricier side
  });

  it("recommends the cheaper listing when buying", () => {
    const result = expectOk(
      compareListings({
        mode: "buying",
        rate: "150",
        chaos: "10",
        chaosFormat: "price",
        div: "1",
        divFormat: "price",
      }),
    );
    // chaos = 10, divine chaos-equivalent = 1 * 150 = 150 -> chaos is cheaper
    expect(result.winner).toBe("chaos");
  });

  it("recommends the more valuable listing when selling", () => {
    const result = expectOk(
      compareListings({
        mode: "selling",
        rate: "150",
        chaos: "10",
        chaosFormat: "price",
        div: "1",
        divFormat: "price",
      }),
    );
    // Selling: higher chaos-equivalent wins, so divine (150) beats chaos (10)
    expect(result.winner).toBe("divine");
  });

  it("declares a tie when both sides are exactly equal", () => {
    const result = expectOk(
      compareListings({
        mode: "buying",
        rate: "150",
        chaos: "150",
        chaosFormat: "price",
        div: "1",
        divFormat: "price",
      }),
    );
    expect(result.winner).toBe("tie");
    expect(result.diffChaos).toBe("0.00");
  });

  it("normalizes a qty-format listing via its reciprocal", () => {
    // 0.20 items per chaos == 5 chaos per item
    const result = expectOk(
      compareListings({
        mode: "buying",
        rate: "150",
        chaos: "0.20",
        chaosFormat: "qty",
        div: "1",
        divFormat: "price",
      }),
    );
    expect(result.chaosPerItem).toBe("5.00");
  });

  it("normalizes a qty-format divine listing via its reciprocal", () => {
    // 2 items per divine == 0.50 divine per item
    const result = expectOk(
      compareListings({
        mode: "buying",
        rate: "100",
        chaos: "10",
        chaosFormat: "price",
        div: "2",
        divFormat: "qty",
      }),
    );
    expect(result.divChaosPerItem).toBe("50.00");
  });

  it("rejects a zero exchange rate", () => {
    const result = compareListings({
      mode: "buying",
      rate: "0",
      chaos: "10",
      chaosFormat: "price",
      div: "1",
      divFormat: "price",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a blank chaos listing", () => {
    const result = compareListings({
      mode: "buying",
      rate: "150",
      chaos: "",
      chaosFormat: "price",
      div: "1",
      divFormat: "price",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a zero-quantity listing rather than dividing by zero", () => {
    const result = compareListings({
      mode: "buying",
      rate: "150",
      chaos: "0",
      chaosFormat: "qty",
      div: "1",
      divFormat: "price",
    });
    expect(result.ok).toBe(false);
  });
});

describe("Task 20 Bug 3: qty-format listings above ~200 items/currency no longer error", () => {
  // Previously, converting a "qty" (items-per-currency) listing to a price
  // rounded to the nearest cent immediately, which collapses to exactly
  // zero for any rate much above 200 items/currency and was then rejected
  // as "too large to convert". None of 200/300/500 are actually invalid.
  it("accepts 200 items per currency for a divine qty listing when buying", () => {
    const result = compareListings({
      mode: "buying",
      rate: "100",
      chaos: "1",
      chaosFormat: "price",
      div: "200",
      divFormat: "qty",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts 300 items per currency for a divine qty listing when buying", () => {
    const result = compareListings({
      mode: "buying",
      rate: "100",
      chaos: "1",
      chaosFormat: "price",
      div: "300",
      divFormat: "qty",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts 500 items per currency for a divine qty listing when buying", () => {
    const result = compareListings({
      mode: "buying",
      rate: "100",
      chaos: "1",
      chaosFormat: "price",
      div: "500",
      divFormat: "qty",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts 200 items per currency for a divine qty listing when selling", () => {
    const result = compareListings({
      mode: "selling",
      rate: "100",
      chaos: "1",
      chaosFormat: "price",
      div: "200",
      divFormat: "qty",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts 300 items per currency for a divine qty listing when selling", () => {
    const result = compareListings({
      mode: "selling",
      rate: "100",
      chaos: "1",
      chaosFormat: "price",
      div: "300",
      divFormat: "qty",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts 500 items per currency for a divine qty listing when selling", () => {
    const result = compareListings({
      mode: "selling",
      rate: "100",
      chaos: "1",
      chaosFormat: "price",
      div: "500",
      divFormat: "qty",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a 300-items-per-currency qty listing on the Chaos side too, not just Divine", () => {
    const result = compareListings({
      mode: "buying",
      rate: "100",
      chaos: "300",
      chaosFormat: "qty",
      div: "1",
      divFormat: "price",
    });
    expect(result.ok).toBe(true);
  });

  it("keeps the comparison exact for a 300 items/currency rate rather than treating it as zero-value", () => {
    // 300 items per currency => 1/3 chaos-cent per item, i.e. a very cheap
    // per-item price. Against a comparatively expensive 1 chaos/item listing,
    // the qty-format side should still clearly win when buying.
    const result = expectOk(
      compareListings({
        mode: "buying",
        rate: "100",
        chaos: "1",
        chaosFormat: "price",
        div: "300",
        divFormat: "qty",
      }),
    );
    expect(result.winner).toBe("divine");
  });
});

describe("formatCompareVerdict", () => {
  it("buying: chaos cheaper", () => {
    const result = expectOk(
      compareListings({ mode: "buying", rate: "215", chaos: "42", chaosFormat: "price", div: "0.2", divFormat: "price" }),
    );
    const verdict = formatCompareVerdict("buying", result);
    expect(verdict.subline).toBe("The Chaos listing costs 1 less chaos per item.");
  });

  it("buying: divine cheaper", () => {
    const result = expectOk(
      compareListings({ mode: "buying", rate: "100", chaos: "10", chaosFormat: "price", div: "0.05", divFormat: "price" }),
    );
    expect(result.winner).toBe("divine");
    const verdict = formatCompareVerdict("buying", result);
    expect(verdict.subline).toBe("The Divine listing costs 5 less chaos per item.");
  });

  it("buying: equal results", () => {
    const result = expectOk(
      compareListings({ mode: "buying", rate: "150", chaos: "150", chaosFormat: "price", div: "1", divFormat: "price" }),
    );
    expect(result.winner).toBe("tie");
    const verdict = formatCompareVerdict("buying", result);
    expect(verdict.subline).toBe("Both listings cost the same per item.");
  });

  it("selling: chaos more profitable", () => {
    const result = expectOk(
      compareListings({ mode: "selling", rate: "100", chaos: "10", chaosFormat: "price", div: "0.05", divFormat: "price" }),
    );
    expect(result.winner).toBe("chaos");
    const verdict = formatCompareVerdict("selling", result);
    expect(verdict.subline).toBe("Selling in Chaos earns 5 more chaos per item.");
    expect(verdict.subline).not.toMatch(/costs less/);
  });

  it("selling: divine more profitable", () => {
    const result = expectOk(
      compareListings({ mode: "selling", rate: "150", chaos: "10", chaosFormat: "price", div: "1", divFormat: "price" }),
    );
    expect(result.winner).toBe("divine");
    const verdict = formatCompareVerdict("selling", result);
    expect(verdict.subline).toBe("Selling in Divines earns 140 more chaos per item.");
    expect(verdict.subline).not.toMatch(/costs less/);
  });

  it("selling: equal results", () => {
    const result = expectOk(
      compareListings({ mode: "selling", rate: "150", chaos: "150", chaosFormat: "price", div: "1", divFormat: "price" }),
    );
    expect(result.winner).toBe("tie");
    const verdict = formatCompareVerdict("selling", result);
    expect(verdict.subline).toBe("Both options earn the same amount per item.");
  });
});

describe("Task 21: sub-1 manually entered listing prices", () => {
  it("buying: completes and produces the correct verdict with a chaos listing below 1", () => {
    const result = expectOk(
      compareListings({ mode: "buying", rate: "150", chaos: "0.5", chaosFormat: "price", div: "1", divFormat: "price" }),
    );
    expect(result.chaosPerItem).toBe("0.50");
    expect(result.divChaosPerItem).toBe("150.00");
    expect(result.winner).toBe("chaos");
  });

  it("selling: completes and produces the correct profitability verdict with a chaos listing below 1", () => {
    const result = expectOk(
      compareListings({ mode: "selling", rate: "150", chaos: "0.5", chaosFormat: "price", div: "1", divFormat: "price" }),
    );
    expect(result.chaosPerItem).toBe("0.50");
    expect(result.winner).toBe("divine"); // higher chaos-equivalent (150) is more profitable to sell into
    const verdict = formatCompareVerdict("selling", result);
    expect(verdict.subline).toContain("more chaos per item");
  });

  it("leading-decimal notation (.5) produces the identical result to its leading-zero form (0.5)", () => {
    const dotForm = expectOk(
      compareListings({ mode: "buying", rate: "150", chaos: ".5", chaosFormat: "price", div: "1", divFormat: "price" }),
    );
    const zeroForm = expectOk(
      compareListings({ mode: "buying", rate: "150", chaos: "0.5", chaosFormat: "price", div: "1", divFormat: "price" }),
    );
    expect(dotForm).toEqual(zeroForm);
  });

  it.each(["0.25", "0.1", "0.01"])("accepts a chaos listing price of %s without error", (price) => {
    const result = compareListings({
      mode: "buying",
      rate: "150",
      chaos: price,
      chaosFormat: "price",
      div: "1",
      divFormat: "price",
    });
    expect(result.ok).toBe(true);
  });
});

// --- Task 21B Part 3: deterministic Compare matrix -------------------------

const MATRIX_RATES = ["1", "10", "50", "100", "150", "200", "500", "1000"];
const MATRIX_VALUES = ["0.01", "0.1", "0.25", "0.5", "0.99", "1", "1.5", "2", "5", "10", "100", "200", "300", "500", "1000"];
const MATRIX_MODES: CompareModeT[] = ["buying", "selling"];

function checkAgainstOracle(mode: CompareModeT, rate: string, chaos: string, chaosFormat: ListingFormatT, div: string, divFormat: ListingFormatT) {
  const result = expectOk(compareListings({ mode, rate, chaos, chaosFormat, div, divFormat }));
  const expected = expectedCompare(mode, rate, chaos, chaosFormat, div, divFormat);
  expect(result.chaosPerItem).toBe(expected.chaosPerItem);
  expect(result.divChaosPerItem).toBe(expected.divChaosPerItem);
  expect(result.winner).toBe(expected.winner);
  return result;
}

describe("Task 21B: Compare — value matrix (price/price, independent oracle)", () => {
  // Full cross-product of listing values, both directions, at a fixed
  // representative rate — this is the core "is the math right for every
  // value" sweep (buying-vs-selling flips which side of a tie wins, and
  // covers every equal/chaos-better/divine-better combination that occurs
  // naturally when a value is compared against every other value, including
  // itself).
  const VALUE_MATRIX = MATRIX_VALUES.flatMap((chaos) =>
    MATRIX_VALUES.flatMap((div) => MATRIX_MODES.map((mode) => [mode, chaos, div] as const)),
  );

  it.each(VALUE_MATRIX)("%s: chaos %s/item vs divine %s/item at rate 150", (mode, chaos, div) => {
    checkAgainstOracle(mode, "150", chaos, "price", div, "price");
  });
});

describe("Task 21B: Compare — rate matrix (independent oracle)", () => {
  it.each(MATRIX_RATES.flatMap((rate) => MATRIX_MODES.map((mode) => [mode, rate] as const)))(
    "%s: chaos 10/item vs divine 1/item at rate %s",
    (mode, rate) => {
      checkAgainstOracle(mode, rate, "10", "price", "1", "price");
    },
  );
});

describe("Task 21B: Compare — listing format coverage (independent oracle)", () => {
  const FORMAT_COMBOS: Array<[ListingFormatT, ListingFormatT]> = [
    ["price", "price"],
    ["price", "qty"],
    ["qty", "price"],
    ["qty", "qty"],
  ];

  it.each(
    FORMAT_COMBOS.flatMap(([chaosFormat, divFormat]) =>
      MATRIX_VALUES.flatMap((chaos) => MATRIX_VALUES.flatMap((div) => MATRIX_MODES.map((mode) => [mode, chaosFormat, divFormat, chaos, div] as const))),
    ),
  )("%s: chaos %s(%s) vs divine %s(%s) at rate 150", (mode, chaosFormat, divFormat, chaos, div) => {
    checkAgainstOracle(mode, "150", chaos, chaosFormat, div, divFormat);
  });
});

describe("Task 21B: Compare — named scenarios (independent oracle)", () => {
  it("both listings equal", () => {
    const result = checkAgainstOracle("buying", "150", "150", "price", "1", "price");
    expect(result.winner).toBe("tie");
  });

  it("chaos clearly better when buying", () => {
    const result = checkAgainstOracle("buying", "150", "1", "price", "5", "price");
    expect(result.winner).toBe("chaos");
  });

  it("divine clearly better when buying", () => {
    const result = checkAgainstOracle("buying", "150", "500", "price", "1", "price");
    expect(result.winner).toBe("divine");
  });

  it("very small decimal prices (0.01) still compare correctly", () => {
    checkAgainstOracle("buying", "150", "0.01", "price", "0.01", "price");
    checkAgainstOracle("selling", "1000", "0.01", "price", "0.01", "qty");
  });

  it("very large items-per-currency ratios (1000) still compare correctly", () => {
    checkAgainstOracle("buying", "150", "1000", "qty", "1000", "qty");
    checkAgainstOracle("selling", "500", "1", "price", "1000", "qty");
  });
});

describe("Task 21B: Compare — verdict wording invariants across the matrix", () => {
  it("buying verdicts always use 'costs ... less chaos per item' (non-tie) or the equal wording (tie)", () => {
    for (const chaos of MATRIX_VALUES) {
      for (const div of MATRIX_VALUES) {
        const result = expectOk(compareListings({ mode: "buying", rate: "150", chaos, chaosFormat: "price", div, divFormat: "price" }));
        const verdict = formatCompareVerdict("buying", result);
        if (result.winner === "tie") {
          expect(verdict.subline).toBe("Both listings cost the same per item.");
        } else {
          expect(verdict.subline).toMatch(/costs .+ less chaos per item\.$/);
        }
      }
    }
  });

  it("selling verdicts always use 'earns ... more chaos per item' (non-tie) or the equal wording (tie), and never buying's 'costs less' wording", () => {
    for (const chaos of MATRIX_VALUES) {
      for (const div of MATRIX_VALUES) {
        const result = expectOk(compareListings({ mode: "selling", rate: "150", chaos, chaosFormat: "price", div, divFormat: "price" }));
        const verdict = formatCompareVerdict("selling", result);
        expect(verdict.subline).not.toMatch(/costs less/);
        if (result.winner === "tie") {
          expect(verdict.subline).toBe("Both options earn the same amount per item.");
        } else {
          expect(verdict.subline).toMatch(/earns .+ more chaos per item\.$/);
        }
      }
    }
  });

  it("never produces a blank verdict for valid inputs", () => {
    for (const chaos of MATRIX_VALUES) {
      const result = expectOk(compareListings({ mode: "buying", rate: "150", chaos, chaosFormat: "price", div: "1", divFormat: "price" }));
      const verdict = formatCompareVerdict("buying", result);
      expect(verdict.title.length).toBeGreaterThan(0);
      expect(verdict.subline.length).toBeGreaterThan(0);
    }
  });
});

describe("Task 21B Part 4: Compare formatting invariants", () => {
  const NUMERIC_2DP = /^-?\d+\.\d{2}$/;

  it("chaosPerItem/divChaosPerItem/diffChaos/diffPercent are always well-formed 2dp numbers", () => {
    for (const chaos of MATRIX_VALUES) {
      for (const div of MATRIX_VALUES) {
        const result = expectOk(compareListings({ mode: "buying", rate: "150", chaos, chaosFormat: "price", div, divFormat: "price" }));
        expect(result.chaosPerItem).toMatch(NUMERIC_2DP);
        expect(result.divChaosPerItem).toMatch(NUMERIC_2DP);
        expect(result.diffChaos).toMatch(NUMERIC_2DP);
        expect(result.diffPercent).toMatch(NUMERIC_2DP);
        expect(result.chaosPerItem).not.toBe("-0.00");
        expect(result.divChaosPerItem).not.toBe("-0.00");
      }
    }
  });

  it("reciprocal invariants: exact price <-> items-per-currency pairs produce identical comparisons throughout Compare", () => {
    const EXACT_RECIPROCALS: Array<[string, string]> = [
      ["0.5", "2"],
      ["0.25", "4"],
      ["0.2", "5"],
      ["0.1", "10"],
      ["0.05", "20"],
      ["0.04", "25"],
      ["0.02", "50"],
      ["0.01", "100"],
    ];
    for (const [price, itemsPerCurrency] of EXACT_RECIPROCALS) {
      for (const mode of MATRIX_MODES) {
        const viaPrice = expectOk(compareListings({ mode, rate: "150", chaos: price, chaosFormat: "price", div: "1", divFormat: "price" }));
        const viaQty = expectOk(compareListings({ mode, rate: "150", chaos: itemsPerCurrency, chaosFormat: "qty", div: "1", divFormat: "price" }));
        expect(viaQty.chaosPerItem).toBe(viaPrice.chaosPerItem);
        expect(viaQty.winner).toBe(viaPrice.winner);
      }
    }
  });
});
