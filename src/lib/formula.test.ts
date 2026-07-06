import { describe, expect, it } from "vitest";
import { computeCellDisplay, evaluateFormula, formatFormulaValue, isFormula } from "./formula";

describe("isFormula", () => {
  it("recognizes a leading =", () => {
    expect(isFormula("=1+2")).toBe(true);
  });

  it("rejects plain text/numbers", () => {
    expect(isFormula("42")).toBe(false);
    expect(isFormula("hello")).toBe(false);
    expect(isFormula("")).toBe(false);
  });
});

describe("evaluateFormula", () => {
  it("evaluates simple addition", () => {
    const result = evaluateFormula("=1+2");
    expect(result).toEqual({ ok: true, value: 3 });
  });

  it("evaluates operator precedence", () => {
    const result = evaluateFormula("=2*3+4");
    expect(result).toEqual({ ok: true, value: 10 });
  });

  it("evaluates parentheses", () => {
    const result = evaluateFormula("=(2+3)*4");
    expect(result).toEqual({ ok: true, value: 20 });
  });

  it("evaluates division", () => {
    const result = evaluateFormula("=10/4");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(2.5);
  });

  it("handles whitespace", () => {
    const result = evaluateFormula("=  1 +  2  ");
    expect(result).toEqual({ ok: true, value: 3 });
  });

  it("handles unary minus", () => {
    const result = evaluateFormula("=-5+10");
    expect(result).toEqual({ ok: true, value: 5 });
  });

  it("handles nested parentheses", () => {
    const result = evaluateFormula("=((1+2)*(3+4))");
    expect(result).toEqual({ ok: true, value: 21 });
  });

  it("rejects division by zero", () => {
    const result = evaluateFormula("=1/0");
    expect(result.ok).toBe(false);
  });

  it("rejects cell references", () => {
    const result = evaluateFormula("=A1+1");
    expect(result.ok).toBe(false);
  });

  it("rejects SUM()-style function calls", () => {
    const result = evaluateFormula("=SUM(1,2)");
    expect(result.ok).toBe(false);
  });

  it("rejects unbalanced parentheses", () => {
    const result = evaluateFormula("=(1+2");
    expect(result.ok).toBe(false);
  });

  it("rejects trailing garbage", () => {
    const result = evaluateFormula("=1+2)");
    expect(result.ok).toBe(false);
  });

  it("rejects an empty formula", () => {
    const result = evaluateFormula("=");
    expect(result.ok).toBe(false);
  });

  it("rejects non-formula input", () => {
    const result = evaluateFormula("42");
    expect(result.ok).toBe(false);
  });
});

describe("formatFormulaValue", () => {
  it("formats integers without decimals", () => {
    expect(formatFormulaValue(10)).toBe("10");
  });

  it("formats decimals cleanly", () => {
    expect(formatFormulaValue(2.5)).toBe("2.5");
  });

  it("avoids floating-point noise", () => {
    expect(formatFormulaValue(0.1 + 0.2)).toBe("0.3");
  });
});

describe("computeCellDisplay", () => {
  it("shows plain text/numbers verbatim", () => {
    expect(computeCellDisplay("42")).toEqual({ display: "42", isError: false });
    expect(computeCellDisplay("hello")).toEqual({ display: "hello", isError: false });
  });

  it("shows the computed value for a valid formula", () => {
    expect(computeCellDisplay("=2*3+4")).toEqual({ display: "10", isError: false });
  });

  it("preserves original text and flags an error for an invalid formula", () => {
    expect(computeCellDisplay("=1+")).toEqual({ display: "=1+", isError: true });
  });
});
