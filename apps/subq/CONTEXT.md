# Subq

Subq tracks one owner's weight, medication injections, schedules, and goals.
Cloudflare Access authenticates the owner. Subq stores journal events in
Cloudflare Durable Objects.

## Journal terms

- A **weight entry** is a measurement in pounds at a UTC instant.
- An **injection** records a compound, a dose in milligrams, and a UTC instant.
  It can include a site, supplier, notes, and a schedule assignment.
- A **schedule** sets the cadence and dose phases for a compound. A phase with
  no duration continues indefinitely.
- A **goal** specifies a weight target, a start date, and an optional deadline.
  The owner uses **Complete Goal** to record completion.
- A **snapshot** contains preferences, weight entries, injections, schedules,
  and goals. Import replaces the journal in one command.

## Rules

- The server authorizes journal reads and commands for `SUBQ_OWNER_EMAIL`.
- The journal has at most one active schedule and one active goal.
- The next dose uses the latest injection of the same compound. Phase progress
  counts injections assigned to that schedule.
- Schedule starts and goal dates are calendar dates. The journal timezone
  determines the local date of an instant.
- The browser initializes an unset timezone with its IANA timezone.
- Snapshots export as `4.0.0`. Import also accepts `3.0.0-alpha.2`.
- Application trace attributes exclude credentials, record identifiers, and
  health data.

## Packages

`domain/` defines the journal aggregate, commands, live views, snapshot format,
and calculations. `server/` authenticates requests and hosts the domain.
`web/` serves the Foldkit application and forwards API requests to the server
Worker. The browser watches `JournalProfile`, `WeightHistory`, and
`InjectionHistory` over WebSockets. The browser calculates statistics,
charts, goal progress, and schedule progress from these views.

See the [development and deployment guide](README.md).
