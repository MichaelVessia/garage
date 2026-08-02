import { assert, it } from '@effect/vitest'
import { TailscaleApiLive } from '@garage/tailscale'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as Sink from 'effect/Sink'
import * as Stream from 'effect/Stream'
import type { ChildProcess } from 'effect/unstable/process'
import { ChildProcessSpawner } from 'effect/unstable/process'

import { executeTailscale } from '../src/index.js'
import { TailscaleProcessLive } from '../src/process.js'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

const handle = ChildProcessSpawner.makeHandle({
  pid: ChildProcessSpawner.ProcessId(1),
  exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
  isRunning: Effect.succeed(false),
  kill: () => Effect.void,
  stdin: Sink.drain,
  stdout: Stream.make(bytes('{"BackendState":"Running","Peer":{}}')),
  stderr: Stream.empty,
  all: Stream.make(bytes('{"BackendState":"Running","Peer":{}}')),
  getInputFd: () => Sink.drain,
  getOutputFd: () => Stream.empty,
  unref: Effect.succeed(Effect.void),
})

interface SpawnCall {
  readonly executable: string
  readonly args: ReadonlyArray<string>
}

const spawnCall = (command: ChildProcess.Command): SpawnCall =>
  command._tag === 'StandardCommand'
    ? { executable: command.command, args: command.args }
    : { executable: 'piped command', args: [] }

it.effect('executes status through the live API and process layers', () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<SpawnCall>>([])
    const spawner = ChildProcessSpawner.make((command) =>
      Ref.update(calls, (records) => [...records, spawnCall(command)]).pipe(Effect.as(handle))
    )
    const layer = TailscaleApiLive.pipe(
      Layer.provide(TailscaleProcessLive),
      Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner))
    )

    const envelope = yield* executeTailscale(['status', '--limit', '1']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'tailscale status --limit 1',
      result: {
        backendState: 'Running',
        version: undefined,
        tailnetName: undefined,
        magicDnsSuffix: undefined,
        magicDnsEnabled: undefined,
        self: undefined,
        peerCount: 0,
        onlinePeerCount: 0,
        exitNodeCount: 0,
        currentExitNode: undefined,
        health: [],
        peers: { count: 0, total: 0, records: [], moreAvailable: false },
      },
      next_actions: [],
    })
    assert.deepStrictEqual(yield* Ref.get(calls), [
      {
        executable: '/run/current-system/sw/bin/tailscale',
        args: ['status', '--json'],
      },
    ])
  })
)
