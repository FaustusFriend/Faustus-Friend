import { useEffect, useRef, useState } from "react";
import { loadNotes, saveNotes } from "../lib/notes";

const SAVE_DEBOUNCE_MS = 400;

export function NotesSection() {
  const [notes, setNotes] = useState("");
  const loadedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await loadNotes();
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
      void saveNotes(value);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleClear() {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Clear through execCommand (not a direct state assignment) so the
    // browser's native undo stack sees this as a normal edit — Ctrl+Z can
    // restore the previous text as long as focus stays in the textarea.
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.select();
      const cleared = document.execCommand("insertText", false, "");
      if (!cleared) {
        setNotes("");
        void saveNotes("");
      }
      // The resulting "input" event drives handleChange via onChange, which
      // updates state and schedules the debounced save.
    } else {
      setNotes("");
      void saveNotes("");
    }
  }

  return (
    <div className="section">
      <textarea
        ref={textareaRef}
        className="scratchpad-textarea"
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Jot down notes while trading…"
        spellCheck={false}
      />
      <button className="copy-button" onClick={handleClear}>
        Clear Notes
      </button>
    </div>
  );
}
