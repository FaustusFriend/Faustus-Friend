// Shortcut grammar mirrors the Rust `global-hotkey` crate backing
// tauri-plugin-global-shortcut (see `parse_hotkey`/`parse_key` in that
// crate's src/hotkey.rs): modifiers and one key, separated by "+",
// case-insensitive. Keeping this in sync means anything accepted here is
// guaranteed to be accepted by the native registration call, and the
// canonical form is stable for storage/display/conflict comparison.

export type HotkeyActionId = string;

export interface HotkeyAction {
  id: HotkeyActionId;
  label: string;
  defaultShortcut: string;
}

/** Every global-hotkey action the app supports. Adding a second action is
 * just adding an entry here — Settings UI, persistence, and conflict
 * detection all key off this list already. */
export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: "toggleOverlay", label: "Toggle overlay", defaultShortcut: "Ctrl+Shift+Space" },
];

export type HotkeyMap = Record<HotkeyActionId, string | null>;

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Super"] as const;
type ModifierName = (typeof MODIFIER_ORDER)[number];

const MODIFIER_ALIASES: Record<string, ModifierName> = {
  CONTROL: "Ctrl",
  CTRL: "Ctrl",
  OPTION: "Alt",
  ALT: "Alt",
  SHIFT: "Shift",
  COMMAND: "Super",
  CMD: "Super",
  SUPER: "Super",
  // Windows-only app — CommandOrControl resolves to Ctrl, matching the
  // crate's non-macOS branch.
  COMMANDORCONTROL: "Ctrl",
  COMMANDORCTRL: "Ctrl",
  CMDORCTRL: "Ctrl",
  CMDORCONTROL: "Ctrl",
};

const KEY_ALIASES: Record<string, string> = {};
for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  KEY_ALIASES[letter] = letter;
  KEY_ALIASES[`KEY${letter}`] = letter;
}
for (let d = 0; d <= 9; d++) {
  KEY_ALIASES[String(d)] = String(d);
  KEY_ALIASES[`DIGIT${d}`] = String(d);
}
for (let f = 1; f <= 24; f++) {
  KEY_ALIASES[`F${f}`] = `F${f}`;
}
const NAMED_KEYS: [string[], string][] = [
  [["SPACE"], "Space"],
  [["ENTER"], "Enter"],
  [["TAB"], "Tab"],
  [["ESCAPE", "ESC"], "Escape"],
  [["BACKSPACE"], "Backspace"],
  [["DELETE"], "Delete"],
  [["INSERT"], "Insert"],
  [["HOME"], "Home"],
  [["END"], "End"],
  [["PAGEUP"], "PageUp"],
  [["PAGEDOWN"], "PageDown"],
  [["CAPSLOCK"], "CapsLock"],
  [["NUMLOCK"], "NumLock"],
  [["SCROLLLOCK"], "ScrollLock"],
  [["ARROWUP", "UP"], "ArrowUp"],
  [["ARROWDOWN", "DOWN"], "ArrowDown"],
  [["ARROWLEFT", "LEFT"], "ArrowLeft"],
  [["ARROWRIGHT", "RIGHT"], "ArrowRight"],
  [["PRINTSCREEN"], "PrintScreen"],
  [["PAUSE", "PAUSEBREAK"], "Pause"],
];
for (const [aliases, canonical] of NAMED_KEYS) {
  for (const alias of aliases) KEY_ALIASES[alias] = canonical;
}
const PUNCTUATION_KEYS: [string[], string][] = [
  [["BACKQUOTE", "`"], "`"],
  [["BACKSLASH", "\\"], "\\"],
  [["BRACKETLEFT", "["], "["],
  [["BRACKETRIGHT", "]"], "]"],
  [["COMMA", ","], ","],
  [["EQUAL", "="], "="],
  [["MINUS", "-"], "-"],
  [["PERIOD", "."], "."],
  [["QUOTE", "'"], "'"],
  [["SEMICOLON", ";"], ";"],
  [["SLASH", "/"], "/"],
];
for (const [aliases, canonical] of PUNCTUATION_KEYS) {
  for (const alias of aliases) KEY_ALIASES[alias] = canonical;
}

export interface ShortcutValidationResult {
  ok: boolean;
  normalized?: string;
  error?: string;
}

/** Parses and normalizes a shortcut string. `ok: true` implies the native
 * `register_hotkey` call will accept it — `normalized` is the canonical
 * "Ctrl+Shift+Space" form used for storage, display, and conflict checks. */
export function validateShortcut(input: string): ShortcutValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Shortcut cannot be empty. Use Clear to disable it instead." };
  }

  const tokens = trimmed.split("+");
  const mods = new Set<ModifierName>();
  let key: string | null = null;

  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) {
      return { ok: false, error: "Shortcut has an empty part — check for stray '+' characters." };
    }
    const upper = token.toUpperCase();
    const modifier = MODIFIER_ALIASES[upper];
    if (modifier) {
      if (key !== null) {
        return { ok: false, error: `Modifiers must come before the key (found "${token}" after the key).` };
      }
      mods.add(modifier);
      continue;
    }
    if (key !== null) {
      return { ok: false, error: 'Only one main key is allowed (e.g. not "Ctrl+A+B").' };
    }
    const canonicalKey = KEY_ALIASES[upper];
    if (!canonicalKey) {
      return { ok: false, error: `Unrecognized key "${token}".` };
    }
    key = canonicalKey;
  }

  if (key === null) {
    return { ok: false, error: 'Shortcut needs a main key, e.g. "Ctrl+Shift+Space".' };
  }

  const orderedMods = MODIFIER_ORDER.filter((m) => mods.has(m));
  return { ok: true, normalized: [...orderedMods, key].join("+") };
}

/** True if two shortcut strings refer to the same physical key combo,
 * regardless of modifier order or casing. Invalid input is never "equal". */
export function shortcutsEqual(a: string, b: string): boolean {
  const va = validateShortcut(a);
  const vb = validateShortcut(b);
  return va.ok && vb.ok && va.normalized === vb.normalized;
}

/** Returns the action already bound to `shortcut`, if any, among `hotkeys`
 * — excluding `excludeActionId` (the action currently being edited). Takes
 * the action list as a parameter (defaulting to the live registry) so it
 * stays testable independent of how many actions actually exist today. */
export function findConflict(
  shortcut: string,
  hotkeys: HotkeyMap,
  excludeActionId: HotkeyActionId,
  actions: HotkeyAction[] = HOTKEY_ACTIONS
): HotkeyAction | null {
  for (const action of actions) {
    if (action.id === excludeActionId) continue;
    const existing = hotkeys[action.id];
    if (existing && shortcutsEqual(existing, shortcut)) {
      return action;
    }
  }
  return null;
}
