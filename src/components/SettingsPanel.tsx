import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SizeMode } from "../App";
import { saveHotkey } from "../settings";

interface SettingsPanelProps {
  hotkey: string;
  onHotkeySaved: (hotkey: string) => void;
  sizeMode: SizeMode;
  onApplySizeMode: (mode: SizeMode) => Promise<{ ok: boolean; error?: string }>;
}

export function SettingsPanel({ hotkey, onHotkeySaved, sizeMode, onApplySizeMode }: SettingsPanelProps) {
  const [hotkeyInput, setHotkeyInput] = useState(hotkey);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSaveHotkey() {
    setStatus(null);
    try {
      await invoke("register_hotkey", { shortcut: hotkeyInput });
      await saveHotkey(hotkeyInput);
      onHotkeySaved(hotkeyInput);
      setStatus(`Hotkey set to "${hotkeyInput}".`);
    } catch (err) {
      setStatus(`Could not set hotkey: ${err}`);
    }
  }

  async function handleApplySize(label: string, mode: SizeMode) {
    setStatus(null);
    const result = await onApplySizeMode(mode);
    setStatus(result.ok ? `Window resized to ${label}.` : `Could not resize window: ${result.error}`);
  }

  return (
    <div className="section">
      <label className="field">
        <span>Show/hide hotkey</span>
        <input
          value={hotkeyInput}
          onChange={(e) => setHotkeyInput(e.target.value)}
          placeholder="e.g. F9, Alt+C"
        />
      </label>
      <button className="primary-button" onClick={handleSaveHotkey}>
        Save hotkey
      </button>
      <p className="hint">Current hotkey: {hotkey}</p>

      <div className="field">
        <span>Window size ({sizeMode})</span>
        <div className="button-row">
          <button className="secondary-button" onClick={() => handleApplySize("Compact", "compact")}>
            Compact
          </button>
          <button className="secondary-button" onClick={() => handleApplySize("Wide", "wide")}>
            Wide
          </button>
        </div>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
