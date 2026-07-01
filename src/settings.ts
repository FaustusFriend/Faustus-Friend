import { load, type Store } from "@tauri-apps/plugin-store";

export interface AppSettings {
  hotkey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "F9",
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
  const hotkey = await store.get<string>("hotkey");
  return {
    hotkey: hotkey ?? DEFAULT_SETTINGS.hotkey,
  };
}

export async function saveHotkey(hotkey: string): Promise<void> {
  const store = await getStore();
  await store.set("hotkey", hotkey);
  await store.save();
}
