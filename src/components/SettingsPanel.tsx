import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { saveHotkey } from "../settings";
import {
  captureShortcutFromKeyEvent,
  findConflict,
  HOTKEY_ACTIONS,
  validateShortcut,
  type HotkeyAction,
  type HotkeyMap,
} from "../lib/hotkeys";

interface SettingsPanelProps {
  hotkeys: HotkeyMap;
  onHotkeysChanged: (hotkeys: HotkeyMap) => void;
  onOpenAbout: () => void;
}

export function SettingsPanel({ hotkeys, onHotkeysChanged, onOpenAbout }: SettingsPanelProps) {
  return (
    <div className="section">
      {HOTKEY_ACTIONS.map((action) => (
        <HotkeyField key={action.id} action={action} hotkeys={hotkeys} onHotkeysChanged={onHotkeysChanged} />
      ))}
      <div className="button-row">
        <button className="secondary-button" onClick={onOpenAbout}>
          About &amp; Support...
        </button>
      </div>
    </div>
  );
}

interface HotkeyFieldProps {
  action: HotkeyAction;
  hotkeys: HotkeyMap;
  onHotkeysChanged: (hotkeys: HotkeyMap) => void;
}

function HotkeyField({ action, hotkeys, onHotkeysChanged }: HotkeyFieldProps) {
  const currentValue = hotkeys[action.id];
  const [input, setInput] = useState(currentValue ?? "");
  const [dirty, setDirty] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  // Settings load asynchronously (App.tsx's loadSettings() runs in a
  // useEffect, after this component's first render) and this panel never
  // unmounts — every tab stays mounted for the app's lifetime so switching
  // tabs never resets in-progress input. That means the `useState` above
  // only ever captures whatever `currentValue` was at that very first
  // render: the hardcoded default, not the real persisted value, and
  // nothing re-syncs it afterward. Result: the field always showed
  // "Ctrl+Shift+Space" regardless of what was actually saved or active,
  // which read as "can't change the hotkey" even though Save/Clear worked
  // correctly underneath. Re-sync whenever the persisted value changes,
  // but only while the user hasn't started editing, so an in-progress edit
  // is never clobbered out from under them.
  useEffect(() => {
    if (!dirty) {
      setInput(currentValue ?? "");
    }
  }, [currentValue, dirty]);

  // Belt-and-suspenders alongside the Escape handling in
  // handleRecorderKeyDown below: in the real WebView2 runtime (not the
  // plain-browser dev preview), an Escape keydown on the focused recorder
  // button doesn't reliably reach that element's own onKeyDown, even though
  // every other key (letters, Tab, modifier combos) does. A window-level,
  // capture-phase listener catches it regardless of exactly where focus
  // ends up, without changing behavior for any other key.
  useEffect(() => {
    if (!isRecording) return;
    function handleWindowEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsRecording(false);
      }
    }
    window.addEventListener("keydown", handleWindowEscape, { capture: true });
    return () => window.removeEventListener("keydown", handleWindowEscape, { capture: true });
  }, [isRecording]);

  // Registers `shortcut` (or unregisters, for `null`) with the native side
  // first — only persisted once the OS has actually accepted it, so a
  // rejected shortcut never gets saved as if it were active.
  async function applyShortcut(shortcut: string | null, successMessage: string) {
    try {
      await invoke("register_hotkey", { shortcut });
    } catch (err) {
      setStatus(`Could not register shortcut: ${err}`);
      setIsError(true);
      return;
    }
    const updated = await saveHotkey(action.id, shortcut);
    onHotkeysChanged(updated);
    setStatus(successMessage);
    setIsError(false);
    setDirty(false);
  }

  async function handleSave() {
    const trimmed = input.trim();
    if (!trimmed) {
      setStatus("Enter a shortcut, or use Clear to disable it.");
      setIsError(true);
      return;
    }

    const result = validateShortcut(trimmed);
    if (!result.ok || !result.normalized) {
      setStatus(result.error ?? "Invalid shortcut.");
      setIsError(true);
      return;
    }

    const conflict = findConflict(result.normalized, hotkeys, action.id);
    if (conflict) {
      setStatus(`"${result.normalized}" is already used by ${conflict.label}.`);
      setIsError(true);
      return;
    }

    setInput(result.normalized);
    await applyShortcut(result.normalized, `${action.label} shortcut set to "${result.normalized}".`);
  }

  async function handleClear() {
    setDirty(true);
    setInput("");
    await applyShortcut(null, `${action.label} shortcut disabled.`);
  }

  function startRecording() {
    setIsRecording(true);
    setStatus(null);
  }

  // Handles both states of the recorder button:
  //  - idle (focused, not recording): Backspace/Delete clears the shortcut.
  //    Enter/Space need no handling here — native <button> behavior already
  //    fires onClick (startRecording) for those.
  //  - recording: every keydown is candidate shortcut input except Escape,
  //    which cancels. `input` is never touched until a key combo is either
  //    captured or the recording is cancelled, so cancelling automatically
  //    "restores" the previous value simply by never having changed it.
  function handleRecorderKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!isRecording) {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        void handleClear();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setIsRecording(false);
      return;
    }

    const raw = captureShortcutFromKeyEvent(event);
    if (raw === null) {
      // Bare modifier press (e.g. just Ctrl) — keep waiting for the main key.
      return;
    }

    const result = validateShortcut(raw);
    setIsRecording(false);
    if (!result.ok || !result.normalized) {
      setStatus(result.error ?? "Unrecognized key combination.");
      setIsError(true);
      return;
    }
    setInput(result.normalized);
    setDirty(true);
    setStatus(null);
  }

  return (
    <>
      <label className="field">
        <span>{action.label} hotkey</span>
        <button
          type="button"
          className={`hotkey-recorder${isRecording ? " hotkey-recorder-active" : ""}`}
          onClick={startRecording}
          onKeyDown={handleRecorderKeyDown}
          onBlur={() => setIsRecording(false)}
          aria-live="polite"
        >
          {isRecording ? "Press shortcut…" : input || "Click to set shortcut"}
        </button>
      </label>
      {isRecording && <p className="hotkey-recording-hint">Esc = Cancel</p>}
      <div className="button-row">
        <button className="primary-button" onClick={handleSave}>
          Save
        </button>
        <button className="secondary-button" onClick={handleClear}>
          Clear
        </button>
      </div>
      <p className="hint">Current: {currentValue ?? "disabled"}</p>
      {status && <p className={isError ? "error" : "status"}>{status}</p>}
    </>
  );
}
