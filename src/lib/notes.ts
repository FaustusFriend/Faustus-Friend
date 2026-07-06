import { load, type Store } from "@tauri-apps/plugin-store";

const NOTES_KEY = "notes";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load("notes.json", { defaults: {}, autoSave: true });
  }
  return storePromise;
}

export async function loadNotes(): Promise<string> {
  const store = await getStore();
  const notes = await store.get<string>(NOTES_KEY);
  return notes ?? "";
}

export async function saveNotes(notes: string): Promise<void> {
  const store = await getStore();
  await store.set(NOTES_KEY, notes);
  await store.save();
}
