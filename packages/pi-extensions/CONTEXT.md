# Pi Extensions

## Purpose

This context packages Michael's Garage-maintained Pi customizations as tested, Effect-based Pi extensions that can be loaded together as one Pi package.

## Ubiquitous language

- **Pi package**: the installable workspace declared by the `pi` field in `package.json`.
- **Extension adapter**: a module under `extensions/` that registers Pi lifecycle handlers, commands, shortcuts, or UI behavior.
- **Extension policy**: Pi-independent state transitions, parsing, and request decisions under `src/`.
- **Session state**: in-memory state owned by one loaded Pi extension runtime and reset when that runtime is replaced.
- **Prompt stash**: one temporarily saved editor prompt that can be restored after another prompt is submitted.
- **Fast mode**: an opt-in policy that adds OpenAI's `priority` service tier to supported GPT provider requests.
- **Session-only model cycling**: changing the active model through Pi's cycle shortcuts without changing the configured default for future sessions.

## Responsibilities

- Package Garage-owned Pi extensions for local development and direct Git installation through Pi.
- Parse extension settings and provider payloads at their boundaries.
- Own prompt-stash state, GPT fast-mode policy, and session-only model cycling policy.
- Adapt policy to Pi lifecycle events and TUI behavior.

## Non-responsibilities

- It does not own Pi itself or third-party Pi packages such as Powerbar.
- It does not own Herdr's generated Pi integration.
- It does not own machine-level installation; Pi installs the package directly from Garage's Git repository.
- It does not turn every Pi callback into an Effect service.

## Invariants and compatibility contracts

- The package exposes all extension adapters through its Pi manifest.
- Prompt stash uses an application shortcut so it composes with other custom editors.
- Sending an interactive prompt restores a previously stashed prompt into the editor.
- Fast mode modifies only supported OpenAI/OpenAI Codex model requests whose payload model matches the selected model.
- Missing, unreadable, malformed, or disabled fast-mode settings default to disabled.
- Model cycling restores only the configured provider and model fields after Pi persists a cycled selection.
- Pi core and TUI packages remain peer dependencies supplied by the host Pi runtime.

## Boundaries and dependencies

The `extensions/` directory is the Pi adapter edge. It may use Pi extension and TUI types, provide Node platform Layers, and execute Effect programs from callbacks. The `src/` directory owns deterministic policy and Effect operations requiring existing services such as `FileSystem`, `Path`, and `Ref`.

## Known ambiguities

Fast mode's supported-model allowlist follows model IDs currently configured in Michael's Pi installation. New model IDs require an explicit compatibility update rather than broad token matching.
