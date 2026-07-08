# Faustus Friend

A Windows desktop companion app for Path of Exile — a small always-on-top
overlay for trade math, trade comparison, and scratchpad notes, summoned with
a global hotkey. Faustus Friend is free, open source, and donation-supported.

## Status

Public beta. The overlay, calculator, compare tool, scratchpad, clipboard
queue, configurable hotkey, and system tray integration are implemented.
Expect rough edges — please open a GitHub Issue if you hit one.

## Support the project

Faustus Friend is free to use and will stay that way. If it saves you time
and you'd like to support development:

- **[Ko-fi](https://ko-fi.com/faustusfriend)** — preferred
- **[PayPal](https://paypal.me/FaustusFriend)** — alternative

Donations are optional and never required or gated behind a feature.

## Principles

These are the non-negotiable design constraints for this project. Any
contribution or feature request that conflicts with them will be declined.

- **Windows-first.** No cross-platform support is planned.
- **No gameplay automation.** Faustus Friend never plays the game for you.
- **No input injection.** The app never sends synthetic input to the game
  client.
- **Passive clipboard/hotkey behavior only.** It reads what you copy and
  responds to a hotkey you configure — nothing runs in the background
  reading game memory, network traffic, or the game window.
- **Exact arithmetic.** Trade math uses integer/rational arithmetic
  (`BigInt`), not floating point, so results never carry silent rounding
  error.
- **Speed-focused overlay workflow.** The UI optimizes for a trader who
  wants an answer in under a second, not a full application to navigate.
- **Maintainer has final roadmap/release authority.** This is a
  selectively-maintained project — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- **Calculator** — buying/selling trade math with exact arithmetic.
- **Compare** — a tool to compare between buying and selling in different currencies.
- **Scratchpad** — a small spreadsheet-style grid with formulas, plus a
  freeform notes area.
- **Clipboard queue** — Click one button to copy both the buying and selling trade values. Sequentially paste both into the trade chat window without having to switch back and forth between the overlay and the game.
- **Configurable global hotkey** — show/hide the overlay from anywhere.
- **System tray** — runs quietly in the tray; closing the window doesn't exit the app.

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
- Right-click the tray icon for Show/Hide, Settings, and Exit.

## Project structure

- `src/` — React + TypeScript frontend (calculator, compare, scratchpad UI, settings)
- `src-tauri/` — Rust backend (window management, tray, global hotkey registration, clipboard)
- `src-tauri/tauri.conf.json` — window config (small, always-on-top overlay)

## Contributing

Contributions are welcome but reviewed selectively — see
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](LICENSE).
