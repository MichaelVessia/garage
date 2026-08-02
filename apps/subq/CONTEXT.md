# Subq

## Purpose

Subq is a multi-user health-tracking web application for body weight, medication injections, injection/titration schedules, weight goals, and derived statistics. It is one Cloudflare Worker deployment with a shared Effect RPC domain and a browser SPA.

## Ubiquitous language

- **Weight log**: one timestamped body-weight measurement; persistence is always pounds.
- **Injection log**: one actual medication injection with drug, source, dosage, site, time, notes, and optional schedule assignment.
- **Injection schedule**: a user's regimen for one drug, cadence, and ordered dosage phases.
- **Phase**: one titration or maintenance step; an absent duration means indefinite maintenance.
- **Active schedule**: a schedule marked active and selected for next-dose calculations; normal repository writes maintain one per user, but imported data can preserve multiple active records.
- **Next scheduled dose**: a derived date and dosage based on cadence, active phase, and injection history.
- **Goal**: a weight target with a starting point and optional deadline.
- **Trajectory**: linear regression over weight measurements.
- **Pace status**: `ahead`, `on_track`, `behind`, or `not_losing` relative to a goal.
- **Data export**: a versioned snapshot of one user's health-domain data; authentication records are excluded.

## Responsibilities

- Create, read, update, delete, and summarize weight and injection logs.
- Model schedules, ordered phases, active-phase progress, cadence, next dose, and injection assignment/site rotation.
- Model weight goals, starting-weight resolution, progress, trajectory, and projection.
- Compute weight/injection statistics and timezone-aware weekday distributions.
- Authenticate users and isolate every repository/RPC operation by user identity.
- Export and replace one user's health-domain dataset through validated import.
- Serve Effect RPC, Better Auth endpoints, health, and the Foldkit SPA from one Worker.

## Non-responsibilities

- It does not prescribe medication, validate clinical appropriateness, or manage pharmacies/inventory/clinician workflows.
- Dosage is a non-empty textual value, not a medically typed quantity.
- It is not a Garage service CLI and does not use the CLI JSON envelope contract.
- It does not provide application OTel; Cloudflare observability covers logging.
- Import is not transactional on D1 and cannot promise atomic replacement.

## Important entities and value objects

Entities are `WeightLog`, `InjectionLog`, `InjectionSchedule`, `SchedulePhase`, `UserGoal`, `UserSettings`, and Better Auth user/session/account records. Important values include positive `Weight`, `Dosage`, `DrugName`, `InjectionSite`, `Frequency`, `WeightUnit`, `NextScheduledDose`, `GoalProgress`, statistics projections, and versioned `DataExport`.

## Invariants and compatibility contracts

- Weight rows are stored in pounds; kilograms are input/display conversion only.
- Normal repository create/activate behavior maintains at most one active schedule and one active goal per user; import preserves the snapshot's active flags and can bypass that convention.
- Every domain read/write is scoped by authenticated user ID; cross-user access must fail or return no record.
- Phase duration is positive when present; absence means indefinite maintenance.
- Schedule phases cascade on schedule deletion; injection assignments become unassigned.
- Import validates schedule references, replaces only the current user's data, and may leave partial state on failure; rerun is recovery.
- Goal starting weight resolves explicit value, then nearest weight to the starting date, then most recent weight, otherwise `NoWeightDataError`.
- Shared Effect schemas define RPC payloads, successes, and typed failures for both worker and browser.

## Boundaries and dependencies

The external boundaries are Cloudflare Workers/D1/assets, Better Auth, and browser APIs. Production SQL uses D1 while tests use in-memory SQLite through the same `SqlClient` interface. Alchemy owns deployment resources; Vite builds the SPA.

## Internal relationships

`src/shared/` contains schemas, pure domain logic, auth middleware contracts, and RPC definitions shared by worker and browser. Backend repositories/services/handlers live under `src/<domain>/`; `src/worker.ts` composes them. `web/` is a Foldkit TEA-style SPA consuming the same RPC contract. Goals depend on weight history, schedules depend on injections, stats aggregate modules, and export/import spans them all, so these are modules within one context rather than independent contexts.

## Known ambiguities

- **Subq** likely abbreviates subcutaneous, but the repository does not define that expansion.
- Code alternates among **drug**, **medication**, and **compound**; `drug` is canonical today, while the intended clinical distinction is unresolved.
- **Source** may mean manufacturer, supplier, pharmacy, or provenance; this remains unresolved.
- **Schedule** combines regimen, titration plan, and future cadence.
- Only one schedule is active per user, not per drug.
- Next-dose timing uses same-drug history, while phase progress uses explicitly assigned injections.
- Browser dosage validation is narrower than the shared RPC schema.
- Goal `completedAt` exists, but automatic completion behavior is not established as an invariant.
- Legacy weight, injection, and schedule tables permit nullable `user_id`; authenticated application queries must still scope by user.
- Imported snapshots can preserve multiple active schedules/goals; which record should win is unresolved.

## References

- [Subq human/deployment README](README.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Repository conventions](../../docs/reference/conventions.md)
- Evidence: `src/shared/`, `src/db/schema.ts`, repositories/services, `src/worker.ts`, `web/`, `drizzle/`, and tests.
