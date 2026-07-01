# Faustus Friend

A Windows desktop companion app for Path of Exile. V1 is a small always-on-top
calculator overlay with a configurable global show/hide hotkey. It does not
read game memory, inspect network packets, modify the game client, or
automate gameplay input.

## Status

This is the initial scaffold. Calculator formulas, OCR, screen recognition,
`Client.txt` reading, and transaction logging are **not implemented yet** —
the current UI is a placeholder layout only.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (developed against v24)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain via `rustup`)
- On Windows: [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  (Tauri needs the MSVC linker) and WebView2 Runtime (preinstalled on most
  Windows 10/11 systems)

## Setup

```sh
npm install
```

## Run in development

```sh
npm run tauri dev
```

This starts the Vite dev server and launches the native window. First build
compiles the Rust backend and can take a few minutes; subsequent runs are
much faster.

## Build

```sh
npm run build          # frontend typecheck + Vite build
npm run tauri build    # full native app bundle
```

## Usage

- Press the configured hotkey (default: `F9`) to show/hide the overlay window.
- Click the gear icon in the header to open settings and change the hotkey.
  Hotkey format follows Tauri's shortcut syntax, e.g. `F9`, `Alt+C`, `Ctrl+Shift+K`.
- Settings are persisted locally to a `settings.json` file in the app's
  data directory (via `tauri-plugin-store`).

## Project structure

- `src/` — React + TypeScript frontend (calculator overlay UI, settings)
- `src-tauri/` — Rust backend (window management, global hotkey registration)
- `src-tauri/tauri.conf.json` — window config (small, always-on-top overlay)
