import { useEffect, useRef, useState } from "react";
import { computeCellDisplay } from "../lib/formula";
import {
  GRID_COLS,
  GRID_ROWS,
  cloneGrid,
  columnLabel,
  clearRange,
  createEmptyGrid,
  getSelectedCellTexts,
  isCellInRange,
  isSingleCellRange,
  loadGrid,
  parseClipboardBlock,
  pasteBlock,
  saveGrid,
  serializeSelection,
  summarizeCells,
  type CellPosition,
  type Grid,
  type SelectionRange,
} from "../lib/grid";

const SAVE_DEBOUNCE_MS = 400;
const MAX_HISTORY = 100;
/** Minimum pointer movement (px) before a mousedown counts as a drag rather
 * than a stationary click — avoids tiny border-pixel jitter turning a plain
 * click into a two-cell selection. */
const DRAG_THRESHOLD_PX = 4;

function cellsEqual(a: CellPosition, b: CellPosition): boolean {
  return a.row === b.row && a.col === b.col;
}

function clampRow(row: number): number {
  return Math.min(Math.max(row, 0), GRID_ROWS - 1);
}

function clampCol(col: number): number {
  return Math.min(Math.max(col, 0), GRID_COLS - 1);
}

/** The cell `deltaRow`/`deltaCol` away from `cell`, clamped to grid bounds. */
function cellDelta(cell: CellPosition, deltaRow: number, deltaCol: number): CellPosition {
  return { row: clampRow(cell.row + deltaRow), col: clampCol(cell.col + deltaCol) };
}

const ARROW_KEY_DELTAS: Record<string, { row: number; col: number }> = {
  ArrowUp: { row: -1, col: 0 },
  ArrowDown: { row: 1, col: 0 },
  ArrowLeft: { row: 0, col: -1 },
  ArrowRight: { row: 0, col: 1 },
};

export function GridSection() {
  const [grid, setGrid] = useState<Grid>(createEmptyGrid);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const loadedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<{ past: Grid[]; future: Grid[] }>({ past: [], future: [] });
  const isSelectingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  // Set right before we programmatically end an edit (commit or cancel), so
  // the blur that follows — either from an explicit containerRef.focus()
  // call or from React unmounting the <input> — doesn't trigger a second,
  // stale commitEdit() that clobbers the moveTo target we just set (see
  // commitEdit/handleInputBlur below).
  const suppressBlurRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await loadGrid();
      setGrid(saved);
      loadedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void saveGrid(grid);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [grid]);

  useEffect(() => {
    function handleWindowMouseUp() {
      isSelectingRef.current = false;
      hasDraggedRef.current = false;
      dragStartPosRef.current = null;
    }
    function handleWindowMouseMove(e: MouseEvent) {
      if (!isSelectingRef.current || hasDraggedRef.current || !dragStartPosRef.current) return;
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        hasDraggedRef.current = true;
      }
    }
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("mousemove", handleWindowMouseMove);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("mousemove", handleWindowMouseMove);
    };
  }, []);

  useEffect(() => {
    if (editingCell) {
      inputRef.current?.focus();
    }
  }, [editingCell]);

  function commitGrid(newGrid: Grid) {
    historyRef.current.past.push(grid);
    if (historyRef.current.past.length > MAX_HISTORY) historyRef.current.past.shift();
    historyRef.current.future = [];
    setGrid(newGrid);
  }

  function undo() {
    const { past } = historyRef.current;
    if (past.length === 0) return;
    const previous = past.pop()!;
    historyRef.current.future.push(grid);
    setGrid(previous);
  }

  function redo() {
    const { future } = historyRef.current;
    if (future.length === 0) return;
    const next = future.pop()!;
    historyRef.current.past.push(grid);
    setGrid(next);
  }

  function beginEdit(row: number, col: number, initialValue?: string) {
    setSelection({ anchor: { row, col }, focus: { row, col } });
    setEditingCell({ row, col });
    setEditingValue(initialValue !== undefined ? initialValue : grid[row][col]);
  }

  function commitEdit(moveTo?: CellPosition) {
    if (!editingCell) return;
    suppressBlurRef.current = true;
    const { row, col } = editingCell;
    if (editingValue !== grid[row][col]) {
      const next = cloneGrid(grid);
      next[row][col] = editingValue;
      commitGrid(next);
    }
    setEditingCell(null);
    const target = moveTo ?? { row, col };
    setSelection({ anchor: target, focus: target });
    containerRef.current?.focus();
  }

  function cancelEdit() {
    if (!editingCell) return;
    suppressBlurRef.current = true;
    const target = editingCell;
    setEditingCell(null);
    setSelection({ anchor: target, focus: target });
    containerRef.current?.focus();
  }

  function handleInputBlur() {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false;
      return;
    }
    commitEdit();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (!editingCell) return;
      const rowDelta = e.shiftKey ? -1 : 1;
      commitEdit(cellDelta(editingCell, rowDelta, 0));
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (!editingCell) return;
      const colDelta = e.shiftKey ? -1 : 1;
      commitEdit(cellDelta(editingCell, 0, colDelta));
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
      // While editing a single cell, defer to the input's own native undo
      // rather than the grid-level history.
      e.stopPropagation();
    }
  }

  /** Moves the focus cell by (deltaRow, deltaCol). Extends from the current
   * anchor when `extend` is true (Shift+Arrow); otherwise collapses the
   * selection to the single new cell. */
  function moveSelection(deltaRow: number, deltaCol: number, extend: boolean) {
    if (!selection) return;
    const next = cellDelta(selection.focus, deltaRow, deltaCol);
    setSelection(extend ? { anchor: selection.anchor, focus: next } : { anchor: next, focus: next });
  }

  /** Extends the selection from the current anchor to (row, col) — used by
   * Shift+Click. Falls back to a plain single-cell selection if there's no
   * existing anchor to extend from. */
  function extendSelectionTo(row: number, col: number) {
    setSelection((prev) => (prev ? { anchor: prev.anchor, focus: { row, col } } : { anchor: { row, col }, focus: { row, col } }));
  }

  function handleCellMouseDown(e: React.MouseEvent, row: number, col: number) {
    e.preventDefault();
    if (editingCell && !cellsEqual(editingCell, { row, col })) {
      commitEdit();
    }
    isSelectingRef.current = true;
    hasDraggedRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    if (e.shiftKey) {
      extendSelectionTo(row, col);
    } else {
      setSelection({ anchor: { row, col }, focus: { row, col } });
    }
    containerRef.current?.focus();
  }

  function handleCellMouseEnter(row: number, col: number) {
    // Only extend the selection once the pointer has genuinely moved past
    // the drag threshold — a plain click landing near a cell border can
    // still fire an enter event for the neighboring cell without this.
    if (!isSelectingRef.current || !hasDraggedRef.current) return;
    setSelection((prev) => (prev ? { anchor: prev.anchor, focus: { row, col } } : prev));
  }

  function clearSelectedCells() {
    if (!selection) return;
    commitGrid(clearRange(grid, selection));
  }

  function handleContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // While a cell is being edited, the input's own onKeyDown owns Enter/Tab/
    // Escape/undo (and stops propagation for those); everything else —
    // regular typing, backspace, arrows, text selection — must be left to
    // native input behavior. Without this guard, keys that bubble up here
    // (anything the input didn't stopPropagation on) get reprocessed by the
    // "type starts editing" branch below, resetting the edit to just that
    // one key on every keystroke.
    if (editingCell) return;

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    if (isCtrlOrCmd && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undo();
      return;
    }
    if (isCtrlOrCmd && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      redo();
      return;
    }
    if (!selection) return;

    if (e.key === "Tab") {
      // Keep Tab inside the grid instead of letting the browser move focus
      // to the next focusable element on the page.
      e.preventDefault();
      moveSelection(0, e.shiftKey ? -1 : 1, false);
      return;
    }

    const arrowDelta = ARROW_KEY_DELTAS[e.key];
    if (arrowDelta) {
      e.preventDefault();
      moveSelection(arrowDelta.row, arrowDelta.col, e.shiftKey);
      return;
    }

    const isSingle = isSingleCellRange(selection);

    if (e.key === "Enter") {
      e.preventDefault();
      if (isSingle) beginEdit(selection.focus.row, selection.focus.col);
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      clearSelectedCells();
      return;
    }

    if (isSingle && e.key.length === 1 && !isCtrlOrCmd && !e.altKey) {
      e.preventDefault();
      beginEdit(selection.focus.row, selection.focus.col, e.key);
    }
  }

  function handleCopy(e: React.ClipboardEvent<HTMLDivElement>) {
    if (editingCell || !selection) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", serializeSelection(grid, selection));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (editingCell) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const block = parseClipboardBlock(text);
    const origin = selection ? selection.anchor : { row: 0, col: 0 };
    commitGrid(pasteBlock(grid, origin, block));
  }

  function handleClearGrid() {
    commitGrid(createEmptyGrid());
  }

  const summary = selection ? summarizeCells(getSelectedCellTexts(grid, selection)) : null;

  return (
    <div className="section">
      <div
        ref={containerRef}
        className="grid-scroll"
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        onCopy={handleCopy}
        onPaste={handlePaste}
      >
        <table className="grid-table">
          <thead>
            <tr>
              <th className="grid-corner" />
              {Array.from({ length: GRID_COLS }, (_, col) => (
                <th key={col} className="grid-header-cell">
                  {columnLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: GRID_ROWS }, (_, row) => (
              <tr key={row}>
                <th className="grid-header-cell">{row + 1}</th>
                {Array.from({ length: GRID_COLS }, (_, col) => {
                  const isEditing = editingCell !== null && cellsEqual(editingCell, { row, col });
                  const isSelected = selection !== null && isCellInRange(row, col, selection);
                  const { display, isError } = computeCellDisplay(grid[row][col]);
                  const className = [
                    "grid-cell",
                    isSelected ? "grid-cell-selected" : "",
                    isError ? "grid-cell-error" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <td
                      key={col}
                      className={className}
                      onMouseDown={(e) => handleCellMouseDown(e, row, col)}
                      onMouseEnter={() => handleCellMouseEnter(row, col)}
                      onDoubleClick={() => beginEdit(row, col)}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="grid-cell-input"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={handleInputBlur}
                          onKeyDown={handleInputKeyDown}
                        />
                      ) : (
                        display
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-summary">
        {summary ? (
          <>
            <span>Selected: {summary.count} cells</span>
            <span>Numbers: {summary.numbers}</span>
            {summary.numbers > 0 && (
              <>
                <span>Sum: {summary.sum}</span>
                <span>Average: {summary.average?.toFixed(2)}</span>
                <span>Minimum: {summary.min}</span>
                <span>Maximum: {summary.max}</span>
              </>
            )}
          </>
        ) : (
          <span>No selection</span>
        )}
      </div>

      <button className="secondary-button" onClick={handleClearGrid}>
        Clear Grid
      </button>
    </div>
  );
}

