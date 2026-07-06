import { useEffect, useRef, useState } from "react";
import { loadScratchpad, saveScratchpad } from "../lib/scratchpad";

const SAVE_DEBOUNCE_MS = 400;

export function ScratchpadSection() {
  const [notes, setNotes] = useState("");
  const loadedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await loadScratchpad();
      setNotes(saved);
      loadedRef.current = true;
    })();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  function handleChange(value: string) {
    setNotes(value);
    if (!loadedRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      void saveScratchpad(value);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleClear() {
    const confirmed = window.confirm("Clear the scratchpad? This cannot be undone.");
    if (!confirmed) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setNotes("");
    void saveScratchpad("");
  }

  return (
    <div className="section">
      <textarea
        className="scratchpad-textarea"
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Jot down notes while trading…"
        spellCheck={false}
      />
      <button className="copy-button" onClick={handleClear}>
        Clear
      </button>
    </div>
  );
}
