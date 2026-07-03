import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";
import { useClipboardQueue } from "./lib/clipboardQueue";
import { BuyingSection } from "./components/BuyingSection";
import { SellingSection } from "./components/SellingSection";
import { ConversionSection } from "./components/ConversionSection";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

type Page = "calculator" | "settings";

function App() {
  const [hotkey, setHotkey] = useState(DEFAULT_SETTINGS.hotkey);
  const [page, setPage] = useState<Page>("calculator");
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
        <button
          className="icon-button"
          title="Settings"
          onClick={() => setPage((p) => (p === "settings" ? "calculator" : "settings"))}
        >
          ⚙
        </button>
      </header>

      <div className="content">
        {page === "settings" ? (
          <SettingsPanel hotkey={hotkey} onHotkeySaved={setHotkey} />
        ) : (
          <>
            <h2 className="section-heading">Buying</h2>
            <BuyingSection clipboardQueue={clipboardQueue} />

            <h2 className="section-heading">Selling</h2>
            <SellingSection clipboardQueue={clipboardQueue} />

            <h2 className="section-heading">Currency Conversion</h2>
            <ConversionSection />
          </>
        )}
        {hotkeyStatus && <p className="status">{hotkeyStatus}</p>}
      </div>
    </div>
  );
}

export default App;
