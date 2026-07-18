# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are published as Windows prereleases on the
[GitHub Releases](https://github.com/FaustusFriend/Faustus-Friend/releases) page.

## [0.1.3] - 2026-07-17

### Added

- Diagnostics exports now separate the current session from recent historical
  sessions.
- Diagnostics exports include support documentation and stronger redaction of
  credential-shaped settings values.
- More reliable one-time startup initialization.

### Fixed

- Selling no longer shows or copies unusable zero-value (0/0) trades.
- Scratchpad grid summaries no longer display floating-point artifacts.
- Compare shows explicit, consistent Chaos (`C`) and Divine (`D`) units.
- Compare currency inputs are wider and aligned with the rate field.

### Changed

- Improved diagnostics history retention and export structure.
- Standardized Compare notation: `Rate (C/D)`, `C/item`, `#/C`, `D/item`,
  `#/D`, `items/C`, and `items/D`.

## [0.1.2] - 2026-07-14

### Fixed

- Quick Calc copy output is now Path of Exile-safe: whole-number totals drop
  unnecessary decimals, fractional totals show an indicator alongside the exact
  result, and the Copy button copies only the whole-number value.
- Trade Maximizer result ordering matches the Buy → Sell workflow, and Copy
  Trade Pair copies values in the displayed order.

## [0.1.1] - 2026-07-11

### Added

- Remaining display for unsold items when selling.
- Support for manually entering prices below one (e.g. `.5`, `0.25`, `0.01`).

### Changed

- Clearer Compare wording for Buying and Selling.

### Fixed

- Selling calculations for non-whole trade quantities.
- Compare errors with very large items-per-currency values.
- Uninstall no longer immediately reopens the installer.

## [0.1.0] - 2026-07-09

Initial public beta.

### Added

- Always-on-top overlay window with a configurable global show/hide hotkey.
- Calculator: buying/selling trade math using exact (`BigInt`) arithmetic.
- Compare tool for evaluating trades side by side.
- Scratchpad: formula-driven grid plus a freeform notes area.
- Passive clipboard queue.
- System tray integration (show/hide, settings, exit) with a custom app icon.
- Locally persisted settings via `tauri-plugin-store`.
- Public repository documentation: README, CONTRIBUTING, SECURITY, Code of
  Conduct, MIT license, and GitHub issue/PR templates.
- Ko-fi and PayPal donation links.
