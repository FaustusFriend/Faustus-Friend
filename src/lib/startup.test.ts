import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../settings";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const loadSettingsMock = vi.fn();
vi.mock("../settings", () => ({
  loadSettings: () => loadSettingsMock(),
}));

const { runStartupInitialization, __resetStartupGuardForTests } = await import("./startup");

const SETTINGS: AppSettings = { hotkeys: { toggleOverlay: "Ctrl+Shift+Space" } };

beforeEach(() => {
  invokeMock.mockReset();
  loadSettingsMock.mockReset();
  __resetStartupGuardForTests();
});

describe("runStartupInitialization", () => {
  it("loads settings and registers the hotkey exactly once when called concurrently (Strict Mode double-invoke)", async () => {
    loadSettingsMock.mockResolvedValue(SETTINGS);
    invokeMock.mockResolvedValue(undefined);

    const [first, second] = await Promise.all([runStartupInitialization(), runStartupInitialization()]);

    expect(loadSettingsMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("register_hotkey", { shortcut: "Ctrl+Shift+Space" });
    expect(first).toEqual({ settings: SETTINGS, hotkeyError: null });
    expect(second).toEqual({ settings: SETTINGS, hotkeyError: null });
  });

  it("does not re-run startup on a later call after the first has already resolved", async () => {
    loadSettingsMock.mockResolvedValue(SETTINGS);
    invokeMock.mockResolvedValue(undefined);

    await runStartupInitialization();
    await runStartupInitialization();

    expect(loadSettingsMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a hotkey registration failure without retrying on a second call", async () => {
    loadSettingsMock.mockResolvedValue(SETTINGS);
    invokeMock.mockRejectedValue(new Error("shortcut already in use"));

    const [first, second] = await Promise.all([runStartupInitialization(), runStartupInitialization()]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(first.hotkeyError).toContain("shortcut already in use");
    expect(second.hotkeyError).toContain("shortcut already in use");
  });

  it("runs again after __resetStartupGuardForTests, proving the guard is what's blocking re-entry", async () => {
    loadSettingsMock.mockResolvedValue(SETTINGS);
    invokeMock.mockResolvedValue(undefined);

    await runStartupInitialization();
    __resetStartupGuardForTests();
    await runStartupInitialization();

    expect(loadSettingsMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
