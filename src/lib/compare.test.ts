import { describe, expect, it } from "vitest";
import { compareListings, formatCompareVerdict } from "./compare";

function expectOk<T>(result: { ok: boolean; value?: T; error?: string }): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${result.error}`);
  }
  return result.value as T;
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
