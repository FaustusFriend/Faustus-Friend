import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { saveHotkey } from "../settings";
import { findConflict, HOTKEY_ACTIONS, validateShortcut, type HotkeyAction, type HotkeyMap } from "../lib/hotkeys";

interface SettingsPanelProps {
  hotkeys: HotkeyMap;
  onHotkeysChanged: (hotkeys: HotkeyMap) => void;
}

export function SettingsPanel({ hotkeys, onHotkeysChanged }: SettingsPanelProps) {
  return (
    <div className="section">
      {HOTKEY_ACTIONS.map((action) => (
        <HotkeyField key={action.id} action={action} hotkeys={hotkeys} onHotkeysChanged={onHotkeysChanged} />
      ))}
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

  function handleInputChange(value: string) {
    setInput(value);
    setDirty(true);
  }

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

  return (
    <>
      <label className="field">
        <span>{action.label} hotkey</span>
        <input
          className="hotkey-input"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="e.g. Ctrl+Shift+Space"
        />
      </label>
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
