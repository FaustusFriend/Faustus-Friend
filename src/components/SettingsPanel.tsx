import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { saveHotkey } from "../settings";

interface SettingsPanelProps {
  hotkey: string;
  onHotkeySaved: (hotkey: string) => void;
}

export function SettingsPanel({ hotkey, onHotkeySaved }: SettingsPanelProps) {
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
      {status && <p className="status">{status}</p>}
      <p className="hint">Current hotkey: {hotkey}</p>
    </div>
  );
}
