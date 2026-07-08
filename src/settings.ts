import { invoke } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";
import { HOTKEY_ACTIONS, type HotkeyActionId, type HotkeyMap } from "./lib/hotkeys";
import { logEvent } from "./lib/diagnostics";

export interface AppSettings {
  hotkeys: HotkeyMap;
}

function defaultHotkeys(): HotkeyMap {
  return Object.fromEntries(HOTKEY_ACTIONS.map((action) => [action.id, action.defaultShortcut]));
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkeys: defaultHotkeys(),
};

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load("settings.json", { defaults: {}, autoSave: true });
  }
  return storePromise;
}

async function checkSettingsStoreStatus(): Promise<string> {
  try {
    return await invoke<string>("settings_store_status");
  } catch {
    // The check itself failing (e.g. no Tauri context) shouldn't be
    // reported as a settings corruption — treat it as "can't tell".
    return "unknown";
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const stored = await store.get<HotkeyMap>("hotkeys");
    if (stored) {
      void logEvent("settings_load", "info", { source: "hotkeys" });
      return { hotkeys: { ...defaultHotkeys(), ...stored } };
    }

    // Migrate the pre-Task-10A single-hotkey field (`hotkey: string`) into the
    // new per-action map, so upgrading doesn't silently reset a user's
    // already-configured shortcut back to the default.
    const legacyHotkey = await store.get<string>("hotkey");
    if (legacyHotkey) {
      void logEvent("settings_load", "info", { source: "legacy_hotkey" });
      return { hotkeys: { ...defaultHotkeys(), toggleOverlay: legacyHotkey } };
    }

    // tauri-plugin-store silently swallows a read/parse failure on its
    // initial load and just falls back to an empty in-memory store — from
    // here, a corrupted settings.json is indistinguishable from one that
    // never existed. Ask the Rust side, which reads the file directly, so
    // "first run" and "your settings file is broken" don't get logged
    // identically.
    const storeStatus = await checkSettingsStoreStatus();
    if (storeStatus === "corrupted") {
      void logEvent("settings_load", "error", { source: "corrupted" });
    } else {
      void logEvent("settings_load", "info", { source: "defaults" });
    }
    return { hotkeys: defaultHotkeys() };
  } catch (err) {
    void logEvent("settings_load", "error", { error: String(err) });
    return { hotkeys: defaultHotkeys() };
  }
}

export async function saveHotkey(actionId: HotkeyActionId, shortcut: string | null): Promise<HotkeyMap> {
  try {
    const store = await getStore();
    const current = (await store.get<HotkeyMap>("hotkeys")) ?? defaultHotkeys();
    const next = { ...current, [actionId]: shortcut };
    await store.set("hotkeys", next);
    await store.save();
    void logEvent("settings_save", "info", { actionId });
    return next;
  } catch (err) {
    void logEvent("settings_save", "error", { actionId, error: String(err) });
    throw err;
  }
}
