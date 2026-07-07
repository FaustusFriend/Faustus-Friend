import { describe, expect, it } from "vitest";
import { findConflict, shortcutsEqual, validateShortcut, type HotkeyAction, type HotkeyMap } from "./hotkeys";

describe("validateShortcut", () => {
  it("accepts a single key with no modifiers", () => {
    expect(validateShortcut("F9")).toEqual({ ok: true, normalized: "F9" });
  });

  it("accepts a modifier + key combo and normalizes casing", () => {
    expect(validateShortcut("ctrl+shift+space")).toEqual({ ok: true, normalized: "Ctrl+Shift+Space" });
  });

  it("normalizes modifier order regardless of input order", () => {
    expect(validateShortcut("Shift+Ctrl+C")).toEqual({ ok: true, normalized: "Ctrl+Shift+C" });
    expect(validateShortcut("Alt+Super+Ctrl+Shift+A")).toEqual({ ok: true, normalized: "Ctrl+Alt+Shift+Super+A" });
  });

  it("resolves modifier aliases", () => {
    expect(validateShortcut("Control+Option+C")).toEqual({ ok: true, normalized: "Ctrl+Alt+C" });
    expect(validateShortcut("Cmd+C")).toEqual({ ok: true, normalized: "Super+C" });
    expect(validateShortcut("CmdOrCtrl+C")).toEqual({ ok: true, normalized: "Ctrl+C" });
  });

  it("resolves key aliases (digits, punctuation, named keys)", () => {
    expect(validateShortcut("Ctrl+5")).toEqual({ ok: true, normalized: "Ctrl+5" });
    expect(validateShortcut("Ctrl+Digit5")).toEqual({ ok: true, normalized: "Ctrl+5" });
    expect(validateShortcut("Ctrl+,")).toEqual({ ok: true, normalized: "Ctrl+," });
    expect(validateShortcut("Ctrl+Up")).toEqual({ ok: true, normalized: "Ctrl+ArrowUp" });
    expect(validateShortcut("Esc")).toEqual({ ok: true, normalized: "Escape" });
  });

  it("rejects an empty or whitespace-only shortcut", () => {
    expect(validateShortcut("").ok).toBe(false);
    expect(validateShortcut("   ").ok).toBe(false);
  });

  it("rejects an unrecognized key", () => {
    const result = validateShortcut("Ctrl+Foo");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unrecognized key/);
  });

  it("rejects more than one main key", () => {
    expect(validateShortcut("Ctrl+A+B").ok).toBe(false);
  });

  it("rejects a modifier appearing after the key", () => {
    expect(validateShortcut("Ctrl+C+Shift").ok).toBe(false);
  });

  it("rejects stray '+' characters producing empty tokens", () => {
    expect(validateShortcut("Ctrl++C").ok).toBe(false);
    expect(validateShortcut("Ctrl+C+").ok).toBe(false);
  });

  it("rejects modifiers with no key at all", () => {
    expect(validateShortcut("Ctrl+Shift").ok).toBe(false);
  });
});

describe("shortcutsEqual", () => {
  it("treats different order/casing of the same combo as equal", () => {
    expect(shortcutsEqual("Ctrl+Shift+Space", "shift+ctrl+SPACE")).toBe(true);
  });

  it("treats different combos as not equal", () => {
    expect(shortcutsEqual("Ctrl+Shift+Space", "Ctrl+Space")).toBe(false);
  });

  it("treats invalid input as never equal", () => {
    expect(shortcutsEqual("Ctrl+Foo", "Ctrl+Foo")).toBe(false);
    expect(shortcutsEqual("", "F9")).toBe(false);
  });
});

describe("findConflict", () => {
  const actions: HotkeyAction[] = [
    { id: "actionA", label: "Action A", defaultShortcut: "F1" },
    { id: "actionB", label: "Action B", defaultShortcut: "F2" },
  ];
  const hotkeys: HotkeyMap = { actionA: "Ctrl+C", actionB: "Ctrl+Shift+X" };

  it("finds the other action already using an equivalent shortcut", () => {
    expect(findConflict("ctrl+c", hotkeys, "actionB", actions)?.id).toBe("actionA");
  });

  it("excludes the action currently being edited", () => {
    expect(findConflict("Ctrl+Shift+X", hotkeys, "actionB", actions)).toBeNull();
  });

  it("returns null when no other action uses the shortcut", () => {
    expect(findConflict("Alt+Z", hotkeys, "actionB", actions)).toBeNull();
  });

  it("ignores disabled (null) actions", () => {
    const withDisabled: HotkeyMap = { actionA: null, actionB: "Ctrl+Shift+X" };
    expect(findConflict("Ctrl+C", withDisabled, "actionB", actions)).toBeNull();
  });
});
