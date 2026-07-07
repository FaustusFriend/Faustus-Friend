import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";
import { useClipboardQueue } from "./lib/clipboardQueue";
import type { HotkeyMap } from "./lib/hotkeys";
import { CalculatorSection } from "./components/CalculatorSection";
import { CompareSection } from "./components/CompareSection";
import { NotesSection } from "./components/NotesSection";
import { GridSection } from "./components/GridSection";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

type MainTab = "calculate" | "compare" | "workspace";

// Native per-tab window width — height never changes (stays at the
// tauri.conf.json default) so the Scratchpad scrollbar fix can't regress.
// Calculate/Compare/Settings share the narrow width; Scratchpad alone widens.
const NARROW_WIDTH = 400;
const WIDE_WIDTH = 450;
const WINDOW_HEIGHT = 660;

function App() {
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(DEFAULT_SETTINGS.hotkeys);
  const [mainTab, setMainTab] = useState<MainTab>("calculate");
  const [showSettings, setShowSettings] = useState(false);
  const [hotkeyStatus, setHotkeyStatus] = useState<string | null>(null);
  const clipboardQueue = useClipboardQueue();
  const didMountRef = useRef(false);

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      setHotkeys(settings.hotkeys);
      const toggleOverlayShortcut = settings.hotkeys.toggleOverlay;
      try {
        await invoke("register_hotkey", { shortcut: toggleOverlayShortcut });
      } catch (err) {
        setHotkeyStatus(`Failed to register hotkey "${toggleOverlayShortcut}": ${err}`);
      }
    })();
  }, []);

  useEffect(() => {
    // Fired by the tray menu's "Settings" item, which shows the window and
    // then needs to also switch the already-mounted app over to Settings.
    const unlistenPromise = listen("open-settings", () => {
      setShowSettings(true);
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const isWide = !showSettings && mainTab === "workspace";

  useEffect(() => {
    // Skip the initial mount — the window already opens at NARROW_WIDTH per
    // tauri.conf.json, so there's nothing to resize until the tab changes.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    (async () => {
      const win = getCurrentWindow();
      const width = isWide ? WIDE_WIDTH : NARROW_WIDTH;
      try {
        // Capture the window's on-screen position and re-assert it right
        // after resizing. An earlier per-tab resize implementation skipped
        // this and the window would jump to the screen's top-left corner
        // the next time the user clicked inside the Workspace grid —
        // re-asserting position closes that gap regardless of what the
        // OS/webview does internally during the resize itself. Only width
        // changes here; height is never touched.
        const position = await win.outerPosition();
        await win.setSize(new LogicalSize(width, WINDOW_HEIGHT));
        await win.setPosition(position);
      } catch {
        // Not running inside Tauri (e.g. the plain browser preview) — the
        // CSS layout works fine without the native resize.
      }
    })();
  }, [isWide]);

  return (
    <div className="overlay">
      <header className="overlay-header" data-tauri-drag-region="deep">
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
          <SettingsPanel hotkeys={hotkeys} onHotkeysChanged={setHotkeys} />
        </div>
        <div className={!showSettings && mainTab === "calculate" ? "" : "calc-panel-hidden"}>
          <CalculatorSection clipboardQueue={clipboardQueue} />
        </div>
        <div className={!showSettings && mainTab === "compare" ? "" : "calc-panel-hidden"}>
          <CompareSection />
        </div>
        <div className={!showSettings && mainTab === "workspace" ? "workspace-panel" : "calc-panel-hidden"}>
          <h2 className="section-heading">Notes</h2>
          <NotesSection />

          <h2 className="section-heading">Grid</h2>
          <GridSection />
        </div>
        {hotkeyStatus && <p className="status">{hotkeyStatus}</p>}
      </div>
    </div>
  );
}

export default App;
