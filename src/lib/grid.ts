import { load, type Store } from "@tauri-apps/plugin-store";
import { computeCellDisplay, evaluateFormula, isFormula } from "./formula";

export const GRID_ROWS = 20;
export const GRID_COLS = 10;

export type Grid = string[][];

export function createEmptyGrid(): Grid {
  return Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => ""));
}

/** Deep-clones a grid so history snapshots don't alias mutable rows. */
export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

/** Column header letters: A, B, C, ... */
export function columnLabel(col: number): string {
  return String.fromCharCode(65 + col);
}

const PLAIN_NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

/** Parses a plain numeric cell string conservatively — no partial matches. */
export function parsePlainNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "" || !PLAIN_NUMBER_PATTERN.test(trimmed)) return null;
  return parseFloat(trimmed);
}

/** The numeric value a cell contributes to the selection summary, if any. */
export function cellNumericValue(text: string): number | null {
  if (text.trim() === "") return null;
  if (isFormula(text)) {
    const result = evaluateFormula(text);
    return result.ok ? result.value : null;
  }
  return parsePlainNumber(text);
}

export { computeCellDisplay };

export interface CellPosition {
  row: number;
  col: number;
}

export interface SelectionRange {
  anchor: CellPosition;
  focus: CellPosition;
}

export interface NormalizedRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

export function normalizeRange(range: SelectionRange): NormalizedRange {
  return {
    minRow: Math.min(range.anchor.row, range.focus.row),
    maxRow: Math.max(range.anchor.row, range.focus.row),
    minCol: Math.min(range.anchor.col, range.focus.col),
    maxCol: Math.max(range.anchor.col, range.focus.col),
  };
}

export function isCellInRange(row: number, col: number, range: SelectionRange): boolean {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(range);
  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
}

export function isSingleCellRange(range: SelectionRange): boolean {
  return range.anchor.row === range.focus.row && range.anchor.col === range.focus.col;
}

export function getSelectedCellTexts(grid: Grid, range: SelectionRange): string[] {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(range);
  const cells: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      cells.push(grid[r][c]);
    }
  }
  return cells;
}

/** Tab/newline-delimited text for the selected rectangular range. */
export function serializeSelection(grid: Grid, range: SelectionRange): string {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(range);
  const lines: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    const cells: string[] = [];
    for (let c = minCol; c <= maxCol; c++) cells.push(grid[r][c]);
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/** Parses tab/newline-delimited clipboard text into a rectangular block. */
export function parseClipboardBlock(text: string): string[][] {
  const rows = text.replace(/\r/g, "").split("\n");
  while (rows.length > 1 && rows[rows.length - 1] === "") rows.pop();
  return rows.map((row) => row.split("\t"));
}

/** Returns a new grid with a tab/newline-delimited block pasted at `origin`, clipped to bounds. */
export function pasteBlock(grid: Grid, origin: CellPosition, block: string[][]): Grid {
  const next = cloneGrid(grid);
  for (let r = 0; r < block.length; r++) {
    for (let c = 0; c < block[r].length; c++) {
      const targetRow = origin.row + r;
      const targetCol = origin.col + c;
      if (targetRow < GRID_ROWS && targetCol < GRID_COLS) {
        next[targetRow][targetCol] = block[r][c];
      }
    }
  }
  return next;
}

/** Returns a new grid with all cells in the range cleared. */
export function clearRange(grid: Grid, range: SelectionRange): Grid {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(range);
  const next = cloneGrid(grid);
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) next[r][c] = "";
  }
  return next;
}

export interface SelectionSummary {
  count: number;
  numbers: number;
  sum?: number;
  average?: number;
  min?: number;
  max?: number;
}

export function summarizeCells(cellTexts: string[]): SelectionSummary {
  const numericValues: number[] = [];
  for (const text of cellTexts) {
    const value = cellNumericValue(text);
    if (value !== null) numericValues.push(value);
  }
  if (numericValues.length === 0) {
    return { count: cellTexts.length, numbers: 0 };
  }
  const sum = numericValues.reduce((a, b) => a + b, 0);
  return {
    count: cellTexts.length,
    numbers: numericValues.length,
    sum,
    average: sum / numericValues.length,
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
  };
}

const GRID_KEY = "cells";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load("grid.json", { defaults: {}, autoSave: true });
  }
  return storePromise;
}

export async function loadGrid(): Promise<Grid> {
  const store = await getStore();
  const saved = await store.get<Grid>(GRID_KEY);
  if (!saved || saved.length !== GRID_ROWS || saved.some((row) => row.length !== GRID_COLS)) {
    return createEmptyGrid();
  }
  return saved;
}

export async function saveGrid(grid: Grid): Promise<void> {
  const store = await getStore();
  await store.set(GRID_KEY, grid);
  await store.save();
}
