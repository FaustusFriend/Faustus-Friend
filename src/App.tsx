import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";
import { useClipboardQueue } from "./lib/clipboardQueue";
import { CalculatorSection } from "./components/CalculatorSection";
import { CompareSection } from "./components/CompareSection";
import { NotesSection } from "./components/NotesSection";
import { GridSection } from "./components/GridSection";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

type MainTab = "calculate" | "compare" | "workspace";
export type SizeMode = "compact" | "wide";

// Named window presets. Resizing only ever happens in direct response to a
// button click (Settings' Compact/Wide, or Workspace's Maximize/Collapse Grid)
// — never reactively on tab switch. An earlier version resized the native
// window on every Workspace/Calculator tab change, which caused the window to
// jump to the top-left of the screen the next time a grid cell was clicked.
// Gating the resize behind an explicit, infrequent user gesture avoids that.
const COMPACT_SIZE = { width: 360, height: 480 };
const WIDE_SIZE = { width: 640, height: 600 };

function App() {
  const [hotkey, setHotkey] = useState(DEFAULT_SETTINGS.hotkey);
  const [mainTab, setMainTab] = useState<MainTab>("calculate");
  const [showSettings, setShowSettings] = useState(false);
  const [hotkeyStatus, setHotkeyStatus] = useState<string | null>(null);
  const [sizeMode, setSizeMode] = useState<SizeMode>("compact");
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

  // The CSS layout only ever needs to know the *requested* mode — `.overlay-wide`
  // just removes a width cap, so it stays safe (no overflow) even if the native
  // resize below fails, e.g. because we're not running inside Tauri at all.
  async function applySizeMode(mode: SizeMode): Promise<{ ok: boolean; error?: string }> {
    setSizeMode(mode);
    const size = mode === "compact" ? COMPACT_SIZE : WIDE_SIZE;
    try {
      await getCurrentWindow().setSize(new LogicalSize(size.width, size.height));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  return (
    <div className={`overlay ${sizeMode === "wide" ? "overlay-wide" : ""}`}>
      <header className="overlay-header" data-tauri-drag-region>
        <span className="overlay-title-group">
          <span className="overlay-title-glyph" aria-hidden="true">
            ◆
          </span>
          <span className="overlay-title">Faustus Friend</span>
        </span>
        <button className="icon-button" title="Settings" onClick={() => setShowSettings((v) => !v)}>
          ⚙
        </button>
      </header>

      {!showSettings && (
        <nav className="tab-bar">
          <button
            className={`tab ${mainTab === "calculate" ? "tab-active" : ""}`}
            onClick={() => setMainTab("calculate")}
          >
            Calculate
          </button>
          <button
            className={`tab ${mainTab === "compare" ? "tab-active" : ""}`}
            onClick={() => setMainTab("compare")}
          >
            Compare
          </button>
          <button
            className={`tab ${mainTab === "workspace" ? "tab-active" : ""}`}
            onClick={() => setMainTab("workspace")}
          >
            Scratchpad
          </button>
        </nav>
      )}

      <div className="content">
        {/* Every top-level panel stays mounted at all times — only visibility
            toggles via CSS — so switching tabs (or opening Settings) never
            resets in-progress Calculate/Compare input. Mirrors the same
            mount-all pattern CalculatorSection already uses for its own
            Buying/Selling sub-tabs. */}
        <div className={showSettings ? "" : "calc-panel-hidden"}>
          <h2 className="section-heading">Settings</h2>
          <SettingsPanel
            hotkey={hotkey}
            onHotkeySaved={setHotkey}
            sizeMode={sizeMode}
            onApplySizeMode={applySizeMode}
          />
        </div>
        <div className={!showSettings && mainTab === "calculate" ? "" : "calc-panel-hidden"}>
          <CalculatorSection clipboardQueue={clipboardQueue} />
        </div>
        <div className={!showSettings && mainTab === "compare" ? "" : "calc-panel-hidden"}>
          <CompareSection />
        </div>
        <div className={!showSettings && mainTab === "workspace" ? "" : "calc-panel-hidden"}>
          <h2 className="section-heading">Notes</h2>
          <NotesSection />

          <h2 className="section-heading">Grid</h2>
          <GridSection sizeMode={sizeMode} onApplySizeMode={applySizeMode} />
        </div>
        {hotkeyStatus && <p className="status">{hotkeyStatus}</p>}
      </div>
    </div>
  );
}

export default App;
