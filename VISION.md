# Vision

Garage is a personal software workshop: one repository for side projects, CLI
tools, applications, and the packages they share.

The name comes from a mechanic's garage. It is a place where useful things are
built, repaired, and improved over time. Garage applies that same idea to
software.

## Why one repository

New projects should start with a working engineering system, not a new round of
repository setup. A shared Bun and TypeScript monorepo lets projects reuse
strict types, validation, release tooling, and common libraries such as Effect
utilities.

Each project still owns its domain, application code, and detailed
documentation. The repository owns the foundation that helps every project
ship.

## Principles

- Build useful software, not infrastructure for its own sake.
- Share tools and patterns when they provide real leverage.
- Encode repeated lessons in types, tests, lints, hooks, or documentation.
- Keep project boundaries clear, even when projects share one workshop.
- Use new tools when they improve the work, and accept their tradeoffs.
