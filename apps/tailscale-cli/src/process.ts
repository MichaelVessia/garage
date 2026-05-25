import { cliMissing, commandFailed, TailscaleProcess } from '@garage/tailscale'
import type { ProcessResult, TailscaleError } from '@garage/tailscale'
import { Effect, Layer, Stream } from 'effect'
import type * as PlatformError from 'effect/PlatformError'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'

const commandText = (args: ReadonlyArray<string>): string => `tailscale ${args.join(' ')}`
const tailscaleCandidates: ReadonlyArray<string> = [
  '/run/current-system/sw/bin/tailscale',
  '/usr/bin/tailscale',
  '/usr/local/bin/tailscale',
  'tailscale',
]

const streamText = (
  stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>
): Effect.Effect<string, PlatformError.PlatformError> => Stream.mkString(Stream.decodeText(stream))

const isMissingCommand = (cause: PlatformError.PlatformError): boolean => cause.reason._tag === 'NotFound'

const processError = (args: ReadonlyArray<string>, cause: PlatformError.PlatformError): TailscaleError =>
  isMissingCommand(cause) ? cliMissing(cause.message) : commandFailed(commandText(args), 1, cause.message)

const runCandidateEffect = (
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  command: string,
  args: ReadonlyArray<string>
): Effect.Effect<ProcessResult, TailscaleError> =>
  Effect.gen(function* () {
    const handle = yield* spawner.spawn(ChildProcess.make(command, args))
    const result = yield* Effect.all(
      {
        exitCode: handle.exitCode,
        stdout: streamText(handle.stdout),
        stderr: streamText(handle.stderr),
      },
      { concurrency: 'unbounded' }
    )

    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
  }).pipe(
    Effect.mapError((cause) => processError(args, cause)),
    Effect.scoped
  )

const runFirstAvailable = (
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  args: ReadonlyArray<string>,
  candidates: ReadonlyArray<string>
): Effect.Effect<ProcessResult, TailscaleError> => {
  const [candidate, ...rest] = candidates
  if (candidate === undefined) {
    return Effect.fail(cliMissing('tailscale CLI not found'))
  }
  return runCandidateEffect(spawner, candidate, args).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        error.code === 'TAILSCALE_CLI_MISSING' && rest.length > 0
          ? runFirstAvailable(spawner, args, rest)
          : Effect.fail(error),
      onSuccess: (result) => Effect.succeed(result),
    })
  )
}

export const TailscaleProcessLive = Layer.effect(
  TailscaleProcess,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    return TailscaleProcess.of({
      run: (args) => runFirstAvailable(spawner, args, tailscaleCandidates),
    })
  })
)
