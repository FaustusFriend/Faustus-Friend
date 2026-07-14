import { describe, expect, it } from "vitest";
import { splitQuickCalcResult } from "./quickCalcFormat";

describe("splitQuickCalcResult", () => {
  it("marks a whole-number result as whole and strips the trailing zeros", () => {
    expect(splitQuickCalcResult("1425.00")).toEqual({ whole: "1425", isWhole: true });
  });

  it("marks a fractional result as not whole and keeps only the integer portion", () => {
    expect(splitQuickCalcResult("1425.37")).toEqual({ whole: "1425", isWhole: false });
  });

  it("treats zero as whole", () => {
    expect(splitQuickCalcResult("0.00")).toEqual({ whole: "0", isWhole: true });
  });

  it("treats a sub-one fractional result as not whole", () => {
    expect(splitQuickCalcResult("0.01")).toEqual({ whole: "0", isWhole: false });
  });

  it("handles large whole-number results", () => {
    expect(splitQuickCalcResult("999999.00")).toEqual({ whole: "999999", isWhole: true });
  });

  it("handles a single trailing nonzero fractional digit", () => {
    expect(splitQuickCalcResult("100.10")).toEqual({ whole: "100", isWhole: false });
  });

  it("never includes a decimal point, comma, space, or asterisk in the whole value", () => {
    const { whole } = splitQuickCalcResult("1425.37");
    expect(whole).toMatch(/^\d+$/);
  });
});
