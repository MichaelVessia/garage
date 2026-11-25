# Logbook agent instructions

Read [CONTEXT.md](CONTEXT.md) before changing Logbook.

- Keep the domain package pure. Use the decision time supplied by the aggregate and record calculated due thresholds on events.
- Use the kind-suffixed file layout from the bundled Alchemy Domain skill.
- Run `bun run --filter '@garage/logbook-domain' typecheck` and `bun run --filter '@garage/logbook-domain' test` for domain changes.
