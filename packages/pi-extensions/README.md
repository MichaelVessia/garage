# `@garage/pi-extensions`

Garage-maintained custom extensions for [Pi](https://github.com/earendil-works/pi-mono), packaged as one Pi package.

## Extensions

- **GPT fast mode** — `/fast` and `Ctrl+Alt+M` toggle OpenAI's `priority` service tier for explicitly supported GPT models.
- **Prompt stash** — `Ctrl+S` temporarily stashes the current editor prompt; submitting another prompt restores it.

## Install

For local development:

```sh
pi install /absolute/path/to/garage/packages/pi-extensions
```

The Garage flake also exposes `packages.<system>.pi-extensions`, a bundled package suitable for repository-pinned Nix and Home Manager installations. It should load after `@juanibiapina/pi-powerbar` if the optional fast-mode status segment is wanted. Machine-level package selection remains in `nixos-config`; this workspace owns extension behavior rather than Home Manager wiring.

## Develop

```sh
bun run --filter '@garage/pi-extensions' typecheck
bun run --filter '@garage/pi-extensions' test
```
