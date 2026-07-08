# Contributing to Faustus Friend

Thanks for your interest in Faustus Friend. This project uses a **selective
contribution model**: issues and pull requests are welcome, but the
maintainer has final say on what gets merged and when it ships. Not every
good idea fits this project, and that's okay.

## Before you start

Read the [Principles](README.md#principles) section of the README first. Any
proposal that conflicts with them — gameplay automation, input injection,
non-Windows platforms, floating-point trade math, background game-memory or
network reading — will be declined regardless of how well it's implemented.

If you're planning a non-trivial change, **open an issue first** to discuss
the approach before writing code. This saves you from doing work that won't
be merged.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include
steps to reproduce, what you expected, and what actually happened.

## Suggesting features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md).
Explain the problem you're trying to solve, not just the solution — it's
easier to evaluate against the project's principles that way.

## Submitting a pull request

1. Open an issue first for anything beyond a small fix.
2. Keep the change scoped — one fix or feature per PR.
3. Match the existing code style (TypeScript + React on the frontend, Rust
   on the backend).
4. Run before submitting:
   ```sh
   npm run build   # typecheck + frontend build
   npm test        # unit tests
   ```
5. Fill out the [pull request template](.github/pull_request_template.md).

Pull requests that don't touch the areas above (docs, typo fixes) don't need
to run the full build, but should still describe the change clearly.

## What "selective" means in practice

- The maintainer decides what's in scope for the roadmap and when releases
  ship.
- A PR may be closed without merging even if it works, if it doesn't fit the
  project's direction or principles.
- Feedback on a closed PR is meant to explain the decision, not to invite an
  argument — but you're welcome to open a fresh issue to discuss it further.

## Code of Conduct

Participation in this project is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).
