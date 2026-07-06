import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";
import { useClipboardQueue } from "./lib/clipboardQueue";
import { BuyingSection } from "./components/BuyingSection";
import { SellingSection } from "./components/SellingSection";
import { ConversionSection } from "./components/ConversionSection";
import { NotesSection } from "./components/NotesSection";
import { GridSection } from "./components/GridSection";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

type MainTab = "calculator" | "workspace";

function App() {
  const [hotkey, setHotkey] = useState(DEFAULT_SETTINGS.hotkey);
  const [mainTab, setMainTab] = useState<MainTab>("calculator");
  const [showSettings, setShowSettings] = useState(false);
  const [hotkeyStatus, setHotkeyStatus] = useState<string | null>(null);
  const clipboardQueue = useClipboardQueue();

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      setHotkey(settings.hotkey);
      try {
        await invoke("register_hotkey", { shortcut: settings.hotkey });
      } catch (err) {
        setHotkeyStatus(`Failed to register hotkey "${settings.hotkey}": ${err}`);
      }
    })();
  }, []);

  return (
    <div className="overlay">
      <header className="overlay-header" data-tauri-drag-region>
        <span className="overlay-title">Faustus Friend</span>
        <button className="icon-button" title="Settings" onClick={() => setShowSettings((v) => !v)}>
          ⚙
        </button>
      </header>

      {!showSettings && (
        <nav className="tab-bar">
          <button
            className={`tab ${mainTab === "calculator" ? "tab-active" : ""}`}
            onClick={() => setMainTab("calculator")}
          >
            Calculator
          </button>
          <button
            className={`tab ${mainTab === "workspace" ? "tab-active" : ""}`}
            onClick={() => setMainTab("workspace")}
          >
            Workspace
          </button>
        </nav>
      )}

      <div className="content">
        {showSettings ? (
          <SettingsPanel hotkey={hotkey} onHotkeySaved={setHotkey} />
        ) : mainTab === "calculator" ? (
          <>
            <h2 className="section-heading">Buying</h2>
            <BuyingSection clipboardQueue={clipboardQueue} />

            <h2 className="section-heading">Selling</h2>
            <SellingSection clipboardQueue={clipboardQueue} />

            <h2 className="section-heading">Currency Conversion</h2>
            <ConversionSection />
          </>
        ) : (
          <>
            <h2 className="section-heading">Notes</h2>
            <NotesSection />

            <h2 className="section-heading">Grid</h2>
            <GridSection />
          </>
        )}
        {hotkeyStatus && <p className="status">{hotkeyStatus}</p>}
      </div>
    </div>
  );
}

export default App;
