# `@garage/pi-extensions`

Garage-maintained custom extensions for [Pi](https://github.com/earendil-works/pi-mono), packaged as one Pi package.

## Extensions

- **GPT fast mode** — `/fast` and `Ctrl+Alt+M` toggle OpenAI's `priority` service tier for explicitly supported GPT models.
- **Session-only model cycling** — `Ctrl+P` and `Shift+Ctrl+P` change the active model without replacing the configured default for future sessions.

## Install

For local development:

```sh
pi install /absolute/path/to/garage/packages/pi-extensions
```

Do not install the repository root as a Git Pi package. Pi Git sources do not select a workspace subdirectory, so that would install the entire monorepo instead of this package.

The Garage flake also exposes `packages.<system>.pi-extensions`, a bundled package suitable for repository-pinned Nix and Home Manager installations. It should load after `@juanibiapina/pi-powerbar` if the optional fast-mode status segment is wanted. Machine-level package selection remains in `nixos-config`; this workspace owns extension behavior rather than Home Manager wiring.

## Develop

```sh
bun run --filter '@garage/pi-extensions' typecheck
bun run --filter '@garage/pi-extensions' test
```
