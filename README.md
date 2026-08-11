# Garage

![Robots building software in a home garage](docs/assets/garage-workshop.webp)

Garage is my software workshop.

My dad is a mechanic who was always working in his garage. This repository is
my version of that space: one place to build side projects, CLI tools, and
anything else I want to make.

Garage is a strictly typed Bun and TypeScript monorepo. Its projects share one
engineering system and reusable packages, including Effect utilities, so each
new idea does not need a new repository and another copy of the same setup.

## Inside

- [`apps/`](apps/) contains runnable tools and applications.
- [`packages/`](packages/) contains shared libraries and service integrations.
- [`docs/`](docs/) contains repository-wide conventions and decisions.

Project-specific documentation stays with each workspace. For repository setup
and validation, see [CONTRIBUTING.md](CONTRIBUTING.md).

```sh
bun install
bun run validate
```
