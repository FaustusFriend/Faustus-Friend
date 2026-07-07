import { describe, expect, it } from "vitest";
import { compareListings } from "./compare";

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
