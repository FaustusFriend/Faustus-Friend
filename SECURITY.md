# Security Policy

## Supported versions

Faustus Friend is currently in public beta. Only the most recent release is
supported with security fixes. There is no long-term support branch at this
stage.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report it privately by emailing **faustusfriend@gmail.com** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce it
- The app version and Windows version you tested on

You should get an acknowledgment within a few days. Once a fix is available,
it will be released and credited (unless you prefer to stay anonymous), and
the issue will be disclosed via the [Changelog](CHANGELOG.md).

## Scope

Faustus Friend is a local Windows desktop overlay. Relevant categories of
vulnerability include:

- Arbitrary code execution triggered by app input (e.g. clipboard content,
  scratchpad formulas, settings file)
- Privilege escalation
- Unsafe handling of the locally persisted `settings.json`
- Supply-chain issues in the app's own build (not its third-party
  dependencies — see below)

For vulnerabilities in third-party dependencies (npm or Rust crates), please
report upstream to the dependency's maintainers as well as to us if it's
exploitable through Faustus Friend specifically.

## Out of scope

In line with the project's [principles](README.md#principles), Faustus
Friend does not read Path of Exile's process memory, inject input into the
game, or communicate over the game's network protocol. Reports asking us to
add these capabilities, or claiming their *absence* is a vulnerability, are
out of scope and will be closed.
