import { assert, it } from '@effect/vitest'
import { TailscaleApi, cliMissing } from '@garage/tailscale'
import type { LimitOptions, PingOptions, WhoisOptions } from '@garage/tailscale'
import { Effect, Layer, Ref } from 'effect'

import { executeTailscale } from '../src/index.js'

const statusResult = {
  backendState: 'Running',
  version: '1.90.1',
  tailnetName: 'example',
  magicDnsSuffix: 'tailnet.example.test',
  magicDnsEnabled: true,
  peerCount: 1,
  onlinePeerCount: 1,
  exitNodeCount: 1,
  currentExitNode: {
    id: 'node1',
    hostName: 'node-b',
    ips: ['100.64.0.2'],
  },
  health: [],
  peers: { count: 1, total: 1, records: [{ hostName: 'node-b', ips: ['100.64.0.2'] }] },
}

const MissingApiLayer = Layer.succeed(TailscaleApi, {
  status: () => Effect.fail(cliMissing('tailscale not found')),
  peers: () => Effect.fail(cliMissing('tailscale not found')),
  exitNodes: () => Effect.fail(cliMissing('tailscale not found')),
  currentExitNode: () => Effect.fail(cliMissing('tailscale not found')),
  dns: () => Effect.fail(cliMissing('tailscale not found')),
  ip: () => Effect.fail(cliMissing('tailscale not found')),
  whois: () => Effect.fail(cliMissing('tailscale not found')),
  ping: () => Effect.fail(cliMissing('tailscale not found')),
})

const makeApiLayer = Effect.gen(function* () {
  const limits = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const whoisTargets = yield* Ref.make<ReadonlyArray<WhoisOptions>>([])
  const pingTargets = yield* Ref.make<ReadonlyArray<PingOptions>>([])
  const api = TailscaleApi.of({
    status: (options) => Ref.update(limits, (records) => [...records, options]).pipe(Effect.as(statusResult)),
    peers: (options) =>
      Ref.update(limits, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, total: 1, records: [{ hostName: 'node-b', ips: ['100.64.0.2'] }] })
      ),
    exitNodes: (options) =>
      Ref.update(limits, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, total: 1, records: [{ hostName: 'node-b', ips: ['100.64.0.2'] }] })
      ),
    currentExitNode: () =>
      Effect.succeed({
        usingExitNode: true,
        peer: { hostName: 'node-b', ips: ['100.64.0.2'] },
      }),
    dns: () => Effect.succeed({ output: 'Tailscale DNS: enabled.', lines: ['Tailscale DNS: enabled.'] }),
    ip: () => Effect.succeed({ ipv4: '100.64.0.1', ipv6: 'fd7a::1' }),
    whois: (options) =>
      Ref.update(whoisTargets, (records) => [...records, options]).pipe(
        Effect.as({ Node: { Name: `${options.target}.tailnet.example.test.` } })
      ),
    ping: (options) =>
      Ref.update(pingTargets, (records) => [...records, options]).pipe(
        Effect.as({ target: options.target, output: 'pong', lines: ['pong'] })
      ),
  })
  return { layer: Layer.succeed(TailscaleApi, api), limits, whoisTargets, pingTargets }
})

it.effect('root command returns command tree and local daemon health', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const ok = yield* executeTailscale([]).pipe(Effect.provide(fake.layer))
    const missing = yield* executeTailscale([]).pipe(Effect.provide(MissingApiLayer))

    assert.strictEqual(ok.ok, true)
    if (!ok.ok || !('health' in ok.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(ok.result.health, {
      configured: true,
      reachable: true,
      backendState: 'Running',
      peerCount: 1,
      exitNodeCount: 1,
      currentExitNode: 'node-b',
    })
    assert.strictEqual(missing.ok, true)
    if (!missing.ok || !('health' in missing.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(missing.result.health, {
      configured: true,
      reachable: false,
      errorCode: 'TAILSCALE_CLI_MISSING',
    })
  })
)

it.effect('bounded commands pass limits', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer

    yield* executeTailscale(['status', '--limit', '2']).pipe(Effect.provide(fake.layer))
    yield* executeTailscale(['peers', '--limit', '3']).pipe(Effect.provide(fake.layer))
    yield* executeTailscale(['exit-nodes', '--limit', '4']).pipe(Effect.provide(fake.layer))

    assert.deepStrictEqual(yield* Ref.get(fake.limits), [{ limit: 2 }, { limit: 3 }, { limit: 4 }])
  })
)

it.effect('target commands validate and dispatch targets', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer

    const whoisEnvelope = yield* executeTailscale(['whois', '100.64.0.2']).pipe(Effect.provide(fake.layer))
    const pingEnvelope = yield* executeTailscale(['ping', 'node-b']).pipe(Effect.provide(fake.layer))
    const missingTarget = yield* executeTailscale(['ping']).pipe(Effect.provide(fake.layer))

    assert.strictEqual(whoisEnvelope.ok, true)
    assert.strictEqual(pingEnvelope.ok, true)
    assert.strictEqual(missingTarget.ok, false)
    if (missingTarget.ok) {
      assert.fail('expected target usage error')
    }
    assert.strictEqual(missingTarget.error.code, 'TAILSCALE_CLI_USAGE')
    assert.deepStrictEqual(yield* Ref.get(fake.whoisTargets), [{ target: '100.64.0.2' }])
    assert.deepStrictEqual(yield* Ref.get(fake.pingTargets), [{ target: 'node-b' }])
  })
)

it.effect('remaining commands dispatch', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer

    for (const args of [['current-exit-node'], ['dns'], ['ip']]) {
      const envelope = yield* executeTailscale(args).pipe(Effect.provide(fake.layer))
      assert.strictEqual(envelope.ok, true)
    }
  })
)
