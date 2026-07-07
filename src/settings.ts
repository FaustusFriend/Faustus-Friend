import { load, type Store } from "@tauri-apps/plugin-store";
import { HOTKEY_ACTIONS, type HotkeyActionId, type HotkeyMap } from "./lib/hotkeys";

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

export async function loadSettings(): Promise<AppSettings> {
  const store = await getStore();
  const stored = await store.get<HotkeyMap>("hotkeys");
  if (stored) {
    return { hotkeys: { ...defaultHotkeys(), ...stored } };
  }

  // Migrate the pre-Task-10A single-hotkey field (`hotkey: string`) into the
  // new per-action map, so upgrading doesn't silently reset a user's
  // already-configured shortcut back to the default.
  const legacyHotkey = await store.get<string>("hotkey");
  if (legacyHotkey) {
    return { hotkeys: { ...defaultHotkeys(), toggleOverlay: legacyHotkey } };
  }

  return { hotkeys: defaultHotkeys() };
}

export async function saveHotkey(actionId: HotkeyActionId, shortcut: string | null): Promise<HotkeyMap> {
  const store = await getStore();
  const current = (await store.get<HotkeyMap>("hotkeys")) ?? defaultHotkeys();
  const next = { ...current, [actionId]: shortcut };
  await store.set("hotkeys", next);
  await store.save();
  return next;
}
