# Effect Services, Layers, and Testability

Good Effect code in this repository makes ownership and requirements truthful.
Infrastructure stays visible at application boundaries, external adapters are
testable without a live system, and wiring tests prove the composition users
actually run. The goal is not maximal indirection.

Shared packages and deployed applications use boundaries appropriate to their ownership. Homelab service integrations live in Executor v2 apps rather than Garage. HTTP, XML, process execution, filesystem access, and browser APIs are adapter variants within those shapes.

## Default stance

- Services declare requirements; composition roots provide them.
- One adapter owns contact with each external system.
- Live adapter layers remain unsealed so canned infrastructure can drive them.
- Operations depend on the narrow API or policy service they actually use.
- Wiring is behavior: test at least one representative composed command.
- Add a service only when it represents a durable capability or policy seam.
  Prefer a named Effect-returning function for one-off behavior.

## Composition ownership

A deployed app's `main.ts` or `worker.ts` selects and composes domain, configuration, platform, and server layers. Keep platform requirements visible there rather than hiding HTTP clients, SQL drivers, filesystem, or process services inside a domain layer. Choosing an implementation based on configuration also belongs at this boundary; `Layer.unwrap` is appropriate when selecting a layer effectfully.

Composing owned domain dependencies differs from sealing infrastructure.
`Layer.provide` or `Layer.provideMerge` may join services in the composition root, while the
underlying live adapter remains exported with its real requirements.

## Testing strategy

Do not require every adapter to ship a broad exported test layer. Use the seam
that proves the behavior under test:

1. **Operation and service tests:** provide a local, complete implementation of
   the API or repository service. Keeping the fake local exposes interface drift and avoids a
   speculative repository-wide `ApiTest` abstraction.
2. **Live adapter tests:** provide canned infrastructure to the unsealed live
   layer (for example in-memory SQLite for `SqlClient`, canned `HttpClient`,
   `ChildProcessSpawner`, or test filesystem services).
3. **Wiring tests:** drive a representative entrypoint or handler through the actual live
   adapter with canned infrastructure, then assert the complete result and
   external interaction.
4. **Memory layers:** export `layerMemory` only when an in-memory implementation has real semantics worth reusing, not merely because tests need a stub.

A hand-written API fake proves operation composition, while a canned
infrastructure client proves live mapping. Neither substitutes for the other.
When tests genuinely share an expensive layer, build it once with `layer(...)`
from `@effect/vitest` and tear it down in `afterAll`.

## Requirements and service interfaces

- Do not thread a parameter or context requirement a service never uses.
- Keep `Config` only on operations that actually read configuration; most
  operations should require only their API service.
- Read each config value once in the module that owns it.
- Use `Context.Reference` only for a genuinely ambient, defaultable policy—not
  as a substitute for passing explicit application state.
- If a layer uses `Effect.orDie` at boot, document why recovery is impossible.
- Do not create a service solely to wrap one filesystem or browser operation;
  a named Effect with the truthful requirement is usually enough.

## Spans and telemetry

Domain operations own operation-level spans with stable names such as
`<svc>.<operation>`. Annotate those spans with non-secret request-shaped values
that help a trace reader understand the operation. Do not put credentials,
cookies, tokens, or response payloads in telemetry.

A method that only forwards to an already-spanned operation does not earn a
second span. Duplicate forwarding spans add noise without new causal
information. Adapter spans are appropriate only when they describe distinct
work such as an HTTP request or process invocation; do not mechanically add
spans across all layers.

## Review checklist

- Is the workspace archetype and external adapter variant truthful?
- Does each service represent a durable capability or policy seam?
- Are infra requirements visible and provided by the application composition
  root rather than sealed into a live adapter?
- Do operations require only the API/config/policy services they consume?
- Do local complete API fakes cover operations and canned infrastructure cover
  live mapping?
- Does a representative wiring test prove command-to-adapter composition?
- Is an in-memory layer present only when its semantics warrant reuse?
- Are spans operation-level, useful, and free of duplicate forwarding spans and
  secrets?
