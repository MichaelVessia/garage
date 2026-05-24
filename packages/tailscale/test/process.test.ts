import { assert, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'

import {
  TailscaleApiLive,
  TailscaleProcess,
  currentExitNode,
  dns,
  exitNodes,
  ip,
  peers,
  ping,
  status,
  whois,
} from '../src/index.js'
import type { ProcessResult } from '../src/index.js'

const runningStatusJson = JSON.stringify({
  Version: '1.90.1',
  BackendState: 'Running',
  MagicDNSSuffix: 'tailnet.example.test',
  CurrentTailnet: {
    Name: 'example',
    MagicDNSSuffix: 'tailnet.example.test',
    MagicDNSEnabled: true,
  },
  Health: [],
  Self: {
    ID: 'self',
    HostName: 'node-a',
    DNSName: 'node-a.tailnet.example.test.',
    OS: 'linux',
    TailscaleIPs: ['100.64.0.1', 'fd7a::1'],
    Online: true,
  },
  Peer: {
    node2: {
      ID: 'node2',
      HostName: 'phone',
      DNSName: 'phone.tailnet.example.test.',
      OS: 'iOS',
      TailscaleIPs: ['100.64.0.3'],
      Online: false,
      ExitNodeOption: false,
    },
    node1: {
      ID: 'node1',
      HostName: 'node-b',
      DNSName: 'node-b.tailnet.example.test.',
      OS: 'linux',
      TailscaleIPs: ['100.64.0.2'],
      Online: true,
      Active: true,
      ExitNode: true,
      ExitNodeOption: true,
      Relay: 'nyc',
      LastSeen: '2026-05-24T10:00:00Z',
      AllowedIPs: ['0.0.0.0/0', '::/0'],
      Tags: ['tag:exit'],
    },
  },
})

const stoppedStatusJson = JSON.stringify({ BackendState: 'NeedsLogin', Peer: {} })

const success = (stdout: string): ProcessResult => ({ exitCode: 0, stdout, stderr: '' })

const makeLayer = (respond: (args: ReadonlyArray<string>) => ProcessResult) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
    const process = TailscaleProcess.of({
      run: (args) => Ref.update(calls, (records) => [...records, args]).pipe(Effect.as(respond(args))),
    })
    return { layer: TailscaleApiLive.pipe(Layer.provideMerge(Layer.succeed(TailscaleProcess, process))), calls }
  })

it.effect('TailscaleApiLive maps status, peers, and exit nodes from status JSON', () =>
  Effect.gen(function* () {
    const fake = yield* makeLayer(() => success(runningStatusJson))

    assert.deepStrictEqual(yield* status({ limit: 1 }).pipe(Effect.provide(fake.layer)), {
      backendState: 'Running',
      version: '1.90.1',
      tailnetName: 'example',
      magicDnsSuffix: 'tailnet.example.test',
      magicDnsEnabled: true,
      self: {
        id: 'self',
        hostName: 'node-a',
        dnsName: 'node-a.tailnet.example.test.',
        ips: ['100.64.0.1', 'fd7a::1'],
        os: 'linux',
        online: true,
        active: undefined,
        exitNode: undefined,
        exitNodeOption: undefined,
        relay: undefined,
        lastSeen: undefined,
        allowedIps: undefined,
        tags: undefined,
      },
      peerCount: 2,
      onlinePeerCount: 1,
      exitNodeCount: 1,
      currentExitNode: {
        id: 'node1',
        hostName: 'node-b',
        dnsName: 'node-b.tailnet.example.test.',
        ips: ['100.64.0.2'],
        os: 'linux',
        online: true,
        active: true,
        exitNode: true,
        exitNodeOption: true,
        relay: 'nyc',
        lastSeen: '2026-05-24T10:00:00Z',
        allowedIps: ['0.0.0.0/0', '::/0'],
        tags: ['tag:exit'],
      },
      health: [],
      peers: {
        count: 1,
        total: 2,
        records: [
          {
            id: 'node2',
            hostName: 'phone',
            dnsName: 'phone.tailnet.example.test.',
            ips: ['100.64.0.3'],
            os: 'iOS',
            online: false,
            active: undefined,
            exitNode: undefined,
            exitNodeOption: false,
            relay: undefined,
            lastSeen: undefined,
            allowedIps: undefined,
            tags: undefined,
          },
        ],
        moreAvailable: true,
      },
    })

    assert.strictEqual((yield* peers({ limit: 5 }).pipe(Effect.provide(fake.layer))).count, 2)
    assert.strictEqual(
      (yield* exitNodes({ limit: 5 }).pipe(Effect.provide(fake.layer))).records[0]?.hostName,
      'node-b'
    )
    assert.deepStrictEqual(yield* currentExitNode.pipe(Effect.provide(fake.layer)), {
      usingExitNode: true,
      peer: {
        id: 'node1',
        hostName: 'node-b',
        dnsName: 'node-b.tailnet.example.test.',
        ips: ['100.64.0.2'],
        os: 'linux',
        online: true,
        active: true,
        exitNode: true,
        exitNodeOption: true,
        relay: 'nyc',
        lastSeen: '2026-05-24T10:00:00Z',
        allowedIps: ['0.0.0.0/0', '::/0'],
        tags: ['tag:exit'],
      },
    })
  })
)

it.effect('TailscaleApiLive maps read-only process commands', () =>
  Effect.gen(function* () {
    const fake = yield* makeLayer((args) => {
      const command = args.join(' ')
      switch (command) {
        case 'status --json': {
          return success(runningStatusJson)
        }
        case 'dns status': {
          return success('Tailscale DNS: enabled.\nMagicDNS: enabled tailnet-wide')
        }
        case 'ip -4': {
          return success('100.64.0.1\n')
        }
        case 'ip -6': {
          return success('fd7a::1\n')
        }
        case 'whois --json 100.64.0.2': {
          return success(JSON.stringify({ Node: { Name: 'node-b.tailnet.example.test.' } }))
        }
        case 'ping --c 3 node-b': {
          return success('pong from node-b via DERP(nyc)')
        }
        default: {
          return { exitCode: 1, stdout: '', stderr: `unexpected ${command}` }
        }
      }
    })

    assert.deepStrictEqual(yield* dns.pipe(Effect.provide(fake.layer)), {
      output: 'Tailscale DNS: enabled.\nMagicDNS: enabled tailnet-wide',
      lines: ['Tailscale DNS: enabled.', 'MagicDNS: enabled tailnet-wide'],
    })
    assert.deepStrictEqual(yield* ip.pipe(Effect.provide(fake.layer)), { ipv4: '100.64.0.1', ipv6: 'fd7a::1' })
    assert.deepStrictEqual(yield* whois({ target: '100.64.0.2' }).pipe(Effect.provide(fake.layer)), {
      Node: { Name: 'node-b.tailnet.example.test.' },
    })
    assert.deepStrictEqual(yield* ping({ target: 'node-b' }).pipe(Effect.provide(fake.layer)), {
      target: 'node-b',
      output: 'pong from node-b via DERP(nyc)',
      lines: ['pong from node-b via DERP(nyc)'],
    })
  })
)

it.effect('peer reads require a running daemon', () =>
  Effect.gen(function* () {
    const fake = yield* makeLayer(() => success(stoppedStatusJson))
    const result = yield* peers().pipe(
      Effect.provide(fake.layer),
      Effect.match({ onFailure: (error) => error.code, onSuccess: () => 'ok' })
    )
    assert.strictEqual(result, 'TAILSCALE_NOT_RUNNING')
  })
)
