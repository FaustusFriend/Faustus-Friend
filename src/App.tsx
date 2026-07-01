import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS, loadSettings, saveHotkey } from "./settings";
import "./App.css";

// Placeholder field labels only — no calculation logic yet.
const CALC_FIELDS = [
  "Item Cost",
  "Reroll Cost",
  "Rolls Attempted",
  "Target Sell Price",
];

function App() {
  const [hotkey, setHotkey] = useState(DEFAULT_SETTINGS.hotkey);
  const [hotkeyInput, setHotkeyInput] = useState(DEFAULT_SETTINGS.hotkey);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      setHotkey(settings.hotkey);
      setHotkeyInput(settings.hotkey);
      try {
        await invoke("register_hotkey", { shortcut: settings.hotkey });
      } catch (err) {
        setStatus(`Failed to register hotkey "${settings.hotkey}": ${err}`);
      }
    })();
  }, []);

  async function handleSaveHotkey() {
    setStatus(null);
    try {
      await invoke("register_hotkey", { shortcut: hotkeyInput });
      await saveHotkey(hotkeyInput);
      setHotkey(hotkeyInput);
      setStatus(`Hotkey set to "${hotkeyInput}".`);
    } catch (err) {
      setStatus(`Could not set hotkey: ${err}`);
    }
  }

  return (
    <div className="overlay">
      <header className="overlay-header" data-tauri-drag-region>
        <span className="overlay-title">Faustus Friend</span>
        <button
          className="icon-button"
          title="Settings"
          onClick={() => setShowSettings((v) => !v)}
        >
          ⚙
        </button>
      </header>

      {showSettings ? (
        <div className="panel">
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
      ) : (
        <div className="panel">
          {CALC_FIELDS.map((label) => (
            <label className="field" key={label}>
              <span>{label}</span>
              <input type="number" placeholder="0" />
            </label>
          ))}
          <button className="primary-button" disabled title="Not implemented yet">
            Calculate
          </button>
          <p className="hint">Formulas not implemented yet — placeholder layout only.</p>
        </div>
      )}
    </div>
  );
}

export default App;
