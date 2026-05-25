import { assert, it } from '@effect/vitest'
import { TailscaleProcess } from '@garage/tailscale'
import { Effect, Layer, Ref, Sink, Stream } from 'effect'
import type { ChildProcess } from 'effect/unstable/process'
import { ChildProcessSpawner } from 'effect/unstable/process'

import { TailscaleProcessLive } from '../src/process.js'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

const output = (text: string) => Stream.make(bytes(text))

const handle = (exitCode: number, stdout: string, stderr: string) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: output(stdout),
    stderr: output(stderr),
    all: output(`${stdout}${stderr}`),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  })

const commandLine = (command: ChildProcess.Command): string =>
  command._tag === 'StandardCommand' ? [command.command, ...command.args].join(' ') : 'piped command'

it.effect('TailscaleProcessLive runs tailscale through the ChildProcessSpawner service', () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<string>>([])
    const spawner = ChildProcessSpawner.make((command) =>
      Ref.update(calls, (records) => [...records, commandLine(command)]).pipe(
        Effect.as(handle(0, '{"BackendState":"Running"}', ''))
      )
    )
    const layer = TailscaleProcessLive.pipe(
      Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner))
    )
    const result = yield* Effect.gen(function* () {
      const process = yield* TailscaleProcess
      return yield* process.run(['status', '--json'])
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, { exitCode: 0, stdout: '{"BackendState":"Running"}', stderr: '' })
    assert.deepStrictEqual(yield* Ref.get(calls), ['/run/current-system/sw/bin/tailscale status --json'])
  })
)
