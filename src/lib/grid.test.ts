import { describe, expect, it } from "vitest";
import {
  GRID_COLS,
  GRID_ROWS,
  cellNumericValue,
  clearRange,
  columnLabel,
  createEmptyGrid,
  getSelectedCellTexts,
  isCellInRange,
  isSingleCellRange,
  normalizeGridShape,
  normalizeRange,
  parseClipboardBlock,
  parsePlainNumber,
  pasteBlock,
  serializeSelection,
  summarizeCells,
  type SelectionRange,
} from "./grid";

describe("createEmptyGrid", () => {
  it("creates a grid of the configured dimensions, all empty", () => {
    const grid = createEmptyGrid();
    expect(grid.length).toBe(GRID_ROWS);
    for (const row of grid) {
      expect(row.length).toBe(GRID_COLS);
      expect(row.every((cell) => cell === "")).toBe(true);
    }
  });
});

describe("columnLabel", () => {
  it("labels columns as letters", () => {
    expect(columnLabel(0)).toBe("A");
    expect(columnLabel(9)).toBe("J");
  });
});

describe("parsePlainNumber", () => {
  it("parses whole numbers", () => {
    expect(parsePlainNumber("42")).toBe(42);
  });

  it("parses decimals and negatives", () => {
    expect(parsePlainNumber("-3.5")).toBe(-3.5);
  });

  it("ignores empty cells", () => {
    expect(parsePlainNumber("")).toBeNull();
    expect(parsePlainNumber("   ")).toBeNull();
  });

  it("ignores text mixed with numbers", () => {
    expect(parsePlainNumber("42 chaos")).toBeNull();
    expect(parsePlainNumber("~42")).toBeNull();
  });

  it("ignores plain text", () => {
    expect(parsePlainNumber("hello")).toBeNull();
  });
});

describe("cellNumericValue", () => {
  it("returns the numeric value of a plain number cell", () => {
    expect(cellNumericValue("15")).toBe(15);
  });

  it("returns the evaluated result of a valid formula", () => {
    expect(cellNumericValue("=2*3+4")).toBe(10);
  });

  it("returns null for an invalid formula", () => {
    expect(cellNumericValue("=1+")).toBeNull();
  });

  it("returns null for an empty cell", () => {
    expect(cellNumericValue("")).toBeNull();
  });

  it("returns null for a text cell", () => {
    expect(cellNumericValue("headhunter")).toBeNull();
  });
});

function range(anchorRow: number, anchorCol: number, focusRow: number, focusCol: number): SelectionRange {
  return { anchor: { row: anchorRow, col: anchorCol }, focus: { row: focusRow, col: focusCol } };
}

describe("normalizeRange / isCellInRange / isSingleCellRange", () => {
  it("normalizes regardless of drag direction", () => {
    expect(normalizeRange(range(3, 3, 1, 1))).toEqual({ minRow: 1, maxRow: 3, minCol: 1, maxCol: 3 });
  });

  it("detects cells inside and outside a range", () => {
    const r = range(0, 0, 1, 1);
    expect(isCellInRange(1, 1, r)).toBe(true);
    expect(isCellInRange(2, 2, r)).toBe(false);
  });

  it("detects a single-cell range", () => {
    expect(isSingleCellRange(range(2, 2, 2, 2))).toBe(true);
    expect(isSingleCellRange(range(2, 2, 2, 3))).toBe(false);
  });
});

describe("getSelectedCellTexts / serializeSelection", () => {
  it("reads a rectangular block in row-major order", () => {
    const grid = createEmptyGrid();
    grid[0][0] = "1";
    grid[0][1] = "2";
    grid[1][0] = "3";
    grid[1][1] = "4";
    const r = range(0, 0, 1, 1);
    expect(getSelectedCellTexts(grid, r)).toEqual(["1", "2", "3", "4"]);
    expect(serializeSelection(grid, r)).toBe("1\t2\n3\t4");
  });
});

describe("parseClipboardBlock / pasteBlock", () => {
  it("parses tab/newline-delimited text into a block", () => {
    expect(parseClipboardBlock("1\t2\n3\t4")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("drops a single trailing empty line from a copied block", () => {
    expect(parseClipboardBlock("1\t2\n")).toEqual([["1", "2"]]);
  });

  it("pastes a block at the given origin", () => {
    const grid = createEmptyGrid();
    const pasted = pasteBlock(grid, { row: 1, col: 1 }, [
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(pasted[1][1]).toBe("a");
    expect(pasted[1][2]).toBe("b");
    expect(pasted[2][1]).toBe("c");
    expect(pasted[2][2]).toBe("d");
    expect(grid[1][1]).toBe(""); // original untouched
  });

  it("clips a paste that would overflow the grid", () => {
    const grid = createEmptyGrid();
    const pasted = pasteBlock(grid, { row: GRID_ROWS - 1, col: GRID_COLS - 1 }, [
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(pasted[GRID_ROWS - 1][GRID_COLS - 1]).toBe("a");
    // out-of-bounds cells simply don't exist; nothing should throw
  });
});

describe("clearRange", () => {
  it("clears only the cells within range, leaving others untouched", () => {
    const grid = createEmptyGrid();
    grid[0][0] = "1";
    grid[5][5] = "keep";
    const cleared = clearRange(grid, range(0, 0, 0, 0));
    expect(cleared[0][0]).toBe("");
    expect(cleared[5][5]).toBe("keep");
  });
});

describe("normalizeGridShape", () => {
  it("returns an empty grid for undefined/null saved data", () => {
    expect(normalizeGridShape(undefined)).toEqual(createEmptyGrid());
    expect(normalizeGridShape(null)).toEqual(createEmptyGrid());
  });

  it("returns an empty grid for malformed (non-array) saved data", () => {
    expect(normalizeGridShape("not a grid")).toEqual(createEmptyGrid());
    expect(normalizeGridShape({ not: "a grid" })).toEqual(createEmptyGrid());
  });

  it("keeps data that fits within the current bounds unchanged", () => {
    const saved = createEmptyGrid();
    saved[0][0] = "42";
    saved[GRID_ROWS - 1][GRID_COLS - 1] = "last";
    expect(normalizeGridShape(saved)).toEqual(saved);
  });

  it("truncates a larger saved grid (e.g. from before a worksheet resize) to the current bounds", () => {
    const oversized = Array.from({ length: GRID_ROWS + 12 }, () =>
      Array.from({ length: GRID_COLS + 5 }, () => "x"),
    );
    // Mark one cell inside the new bounds and one outside, on both axes.
    oversized[0][0] = "kept";
    oversized[GRID_ROWS][0] = "dropped-row";
    oversized[0][GRID_COLS] = "dropped-col";

    const result = normalizeGridShape(oversized);
    expect(result.length).toBe(GRID_ROWS);
    expect(result.every((row) => row.length === GRID_COLS)).toBe(true);
    expect(result[0][0]).toBe("kept");
  });

  it("pads a smaller saved grid with empty cells rather than crashing", () => {
    const undersized = [["a", "b"]];
    const result = normalizeGridShape(undersized);
    expect(result.length).toBe(GRID_ROWS);
    expect(result[0][0]).toBe("a");
    expect(result[0][1]).toBe("b");
    expect(result[0][2]).toBe("");
    expect(result[1][0]).toBe("");
  });

  it("tolerates a row that isn't itself an array", () => {
    const malformed = [null, ["a"], undefined];
    expect(() => normalizeGridShape(malformed)).not.toThrow();
    const result = normalizeGridShape(malformed);
    expect(result[0].every((cell) => cell === "")).toBe(true);
    expect(result[1][0]).toBe("a");
  });
});

describe("summarizeCells", () => {
  it("reports zero numbers when nothing numeric is selected", () => {
    expect(summarizeCells(["", "hello", ""])).toEqual({ count: 3, numbers: 0 });
  });

  it("computes sum/average/min/max over numeric and valid-formula cells", () => {
    const summary = summarizeCells(["1", "=2*3", "text", "", "10"]);
    expect(summary.count).toBe(5);
    expect(summary.numbers).toBe(3);
    expect(summary.sum).toBe(17);
    expect(summary.average).toBeCloseTo(17 / 3);
    expect(summary.min).toBe(1);
    expect(summary.max).toBe(10);
  });

  it("excludes invalid formulas from the summary", () => {
    const summary = summarizeCells(["1", "=1+", "2"]);
    expect(summary.numbers).toBe(2);
    expect(summary.sum).toBe(3);
  });
});
