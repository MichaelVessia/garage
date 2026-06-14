# Effect Services, Layers, and Testability

Good Effect code in this repository keeps infrastructure at the edges, declares
dependencies as layer requirements, and makes every flow testable with stub
layers. It should be clear which module owns a service's network access, where
env and infra get provided, and which behavior is locked in by tests.

This document is grounded in the shape every workspace shares: a service package
(`packages/<svc>`) owning the typed domain, and a CLI app (`apps/<svc>-cli`)
that is the composition root.

## Default stance

- Services declare requirements. Composition roots provide them.
- Every external system has exactly one owning module: the HTTP adapter
  (`packages/<svc>/src/http.ts`).
- Every HTTP adapter ships a test layer, and the live layer has tests of its
  own. Domain operations above the adapter do not need their own fakes; test
  them by providing the adapter's test layer.
- Wiring is behavior. Test the composed CLI, not only its pieces.

The goal is not maximal indirection. The goal is that any flow can run under
test with stub layers, and the env/infra surface of a CLI is auditable in one
place.

## Composition roots

Each CLI app has one composition root, its entrypoint, where the full env/infra
surface is provided. Provide platform layers (`FetchHttpClient.layer`,
`BunServices.layer`, filesystem access) once, at the root. Baking
`FetchHttpClient.layer` into an individual command handler makes that flow
untestable against a stub client and scatters the infra surface across the
codebase. Commands and domain operations declare `HttpClient` as a requirement;
the root satisfies it.

Choosing between layers based on configuration also belongs at the root. Use
`Layer.unwrap` to read config and return the chosen layer.

## Layer requirements

Do not seal infrastructure into a layer. A service layer that needs
`HttpClient | Config` should keep them in its requirements and let the
composition root supply them. Sealing infra inside the layer costs both
auditability and testability: the CLI's env surface is no longer visible at the
root, and the layer's live mapping logic can no longer be driven by a stub
client.

Composing owned, internal dependencies is different from sealing infra.
Providing one of our own services into another with `Layer.provide` or
`Layer.provideMerge` is fine. When a pre-composed convenience layer exists, keep
the uncomposed layer exported so tests can substitute the dependency.

## One module per external system

Each service's network access belongs to exactly one module: its HTTP adapter,
which exposes a service interface and a test layer. The adapter is the only
place that touches the live `HttpClient` for that service. This makes the
service interface the contract and the wire format an implementation detail.

The model (`packages/<svc>/src/model.ts`) decodes the service's payloads with
`Schema`. Struct keys are the upstream wire keys; decode external responses with
`Schema.decodeUnknown` rather than asserting a type onto parsed JSON.

## Test the live layer

An in-memory test layer proves callers compose. It does not prove the live
mapping logic, and a hand-written fake drifts away from the real service over
time. Drive the live HTTP adapter through a canned `HttpClient` in tests:
exercise error mapping (a `404` to a tagged error, a malformed body to a decode
failure), pagination, and status handling against the real layer with canned
responses. That is exactly the surface the in-memory twin cannot protect.

When a block of tests shares one expensive layer, build it once with `layer(...)`
from `@effect/vitest` and tear it down in `afterAll`.

## Wiring tests

Unit tests cover each piece. Nothing covers the merge unless a test drives the
composed command with test layers. Serve the composed CLI command with the HTTP
adapter's test layer and assert the rendered result and exit behavior. When a
doc comment makes a claim about composition, a wiring test should hold it.

## Service interfaces

- Do not thread a parameter a service never uses. If tests can pass a
  placeholder for it, move the concern to the caller that owns it.
- Read each config value once, in the module that owns it. For config-like
  services with a sensible default, prefer `Context.Reference` over a full
  service plus fallback layer.
- Name service methods and domain operations with `Effect.fn("<svc>.<method>")`
  so spans and telemetry get stable names. Annotate spans with the
  request-shaped values a trace reader needs.
- Make policy explicit. When a layer uses `Effect.orDie` at boot, the doc
  comment should say why that failure is unrecoverable.

## Review checklist

- Does every new service declare infra as layer requirements rather than
  providing it internally?
- Is env/infra provided only at the CLI app's composition root?
- Is each service's network access owned by exactly one HTTP adapter with a
  service interface and a test layer?
- Do tests cover the live adapter's mapping logic, not only the in-memory twin?
- Is there a wiring test for new composition or command routing?
- Do services take only parameters they use?

## References

- `repos/effect-smol/ai-docs/src/01_effect/02_services/` — `Context.Service`,
  `Context.Reference`, layer composition, `Layer.unwrap`.
- `repos/effect-smol/ai-docs/src/09_testing/` — `it.effect`, shared `layer(...)`
  blocks, the test-ref pattern.
- `repos/effect-smol/ai-docs/src/50_http-client/` — `HttpClient` composition.
