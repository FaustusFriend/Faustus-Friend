import { invoke } from "@tauri-apps/api/core";
import { loadSettings, type AppSettings } from "../settings";

export interface StartupResult {
  settings: AppSettings;
  hotkeyError: string | null;
}

async function performStartup(): Promise<StartupResult> {
  const settings = await loadSettings();
  let hotkeyError: string | null = null;
  try {
    await invoke("register_hotkey", { shortcut: settings.hotkeys.toggleOverlay });
  } catch (err) {
    hotkeyError = `Failed to register hotkey "${settings.hotkeys.toggleOverlay}": ${err}`;
  }
  return { settings, hotkeyError };
}

// React 18 Strict Mode deliberately mounts, cleans up, and remounts every
// effect once in development to flag missing cleanup logic. The startup
// effect that calls this has no meaningful cleanup — there's nothing to
// undo about having loaded settings or registered a hotkey — so without a
// guard here, Strict Mode would run loadSettings()/register_hotkey twice,
// doubling the settings_load and hotkey_register diagnostics events. A
// module-level singleton promise makes the sequence run at most once per
// app/frontend lifetime, no matter how many times or how concurrently
// callers invoke it.
let startupPromise: Promise<StartupResult> | null = null;

/** Loads settings and registers the startup hotkey exactly once per
 * application lifetime. Safe to call from multiple effect invocations
 * (e.g. Strict Mode's double-invoke) — later calls just await the same
 * in-flight or already-resolved result instead of re-running startup. */
export function runStartupInitialization(): Promise<StartupResult> {
  if (!startupPromise) {
    startupPromise = performStartup();
  }
  return startupPromise;
}

/** Test-only: clears the singleton so each test starts a fresh run. */
export function __resetStartupGuardForTests(): void {
  startupPromise = null;
}
