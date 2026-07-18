import { beforeEach, describe, expect, it, vi } from "vitest";

const storeState: Record<string, unknown> = {};
const storeMock = {
  get: vi.fn(async (key: string) => storeState[key]),
  set: vi.fn(async (key: string, value: unknown) => {
    storeState[key] = value;
  }),
  save: vi.fn(async () => {}),
};
const loadMock = vi.fn(async (..._args: unknown[]) => storeMock);
vi.mock("@tauri-apps/plugin-store", () => ({
  load: (...args: unknown[]) => loadMock(...args),
}));

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const logEventMock = vi.fn();
vi.mock("./lib/diagnostics", () => ({
  logEvent: (...args: unknown[]) => logEventMock(...args),
}));

const { loadSettings, saveHotkey } = await import("./settings");

beforeEach(() => {
  for (const key of Object.keys(storeState)) delete storeState[key];
  storeMock.get.mockClear();
  storeMock.set.mockClear();
  storeMock.save.mockClear();
  loadMock.mockClear();
  invokeMock.mockReset();
  logEventMock.mockClear();
});

describe("saveHotkey", () => {
  it("persists a user-driven hotkey change and logs settings_save, independent of startup", async () => {
    // Simulate that startup (loadSettings + register_hotkey) already ran —
    // saveHotkey has no startup guard and must still fire normally after.
    await loadSettings();
    logEventMock.mockClear();

    const updated = await saveHotkey("toggleOverlay", "Ctrl+Alt+K");

    expect(updated.toggleOverlay).toBe("Ctrl+Alt+K");
    expect(storeMock.set).toHaveBeenCalledWith("hotkeys", expect.objectContaining({ toggleOverlay: "Ctrl+Alt+K" }));
    expect(storeMock.save).toHaveBeenCalledTimes(1);
    expect(logEventMock).toHaveBeenCalledWith("settings_save", "info", { actionId: "toggleOverlay" });
  });

  it("logs a settings_save error and rethrows when persistence fails", async () => {
    storeMock.set.mockRejectedValueOnce(new Error("disk full"));

    await expect(saveHotkey("toggleOverlay", "Ctrl+Alt+K")).rejects.toThrow("disk full");
    expect(logEventMock).toHaveBeenCalledWith(
      "settings_save",
      "error",
      expect.objectContaining({ actionId: "toggleOverlay" }),
    );
  });
});

describe("loadSettings", () => {
  it("logs settings_load and returns stored hotkeys", async () => {
    storeState.hotkeys = { toggleOverlay: "Ctrl+Shift+Space" };

    const settings = await loadSettings();

    expect(settings.hotkeys.toggleOverlay).toBe("Ctrl+Shift+Space");
    expect(logEventMock).toHaveBeenCalledWith("settings_load", "info", { source: "hotkeys" });
  });
});
