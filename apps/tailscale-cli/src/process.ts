import { cliMissing, commandFailed, TailscaleProcess } from '@garage/tailscale'
import type { ProcessResult, TailscaleError } from '@garage/tailscale'
import { Effect, Layer } from 'effect'

const commandText = (args: ReadonlyArray<string>): string => `tailscale ${args.join(' ')}`
const tailscaleCandidates: ReadonlyArray<string> = [
  '/run/current-system/sw/bin/tailscale',
  '/usr/bin/tailscale',
  '/usr/local/bin/tailscale',
  'tailscale',
]

const readStream = (stream: ReadableStream<Uint8Array>): Promise<string> => new Response(stream).text()

const isMissingCommand = (message: string): boolean => message.includes('ENOENT') || message.includes('not found')

const runCandidate = (command: string, args: ReadonlyArray<string>): Promise<ProcessResult> => {
  const proc = Bun.spawn({
    cmd: [command, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
  })

  return Promise.all([readStream(proc.stdout), readStream(proc.stderr), proc.exited]).then(
    ([stdout, stderr, exitCode]) => ({
      exitCode,
      stdout,
      stderr,
    })
  )
}

const processError = (args: ReadonlyArray<string>, cause: unknown): TailscaleError => {
  const message = String(cause)
  return isMissingCommand(message) ? cliMissing(message) : commandFailed(commandText(args), 1, message)
}

const runCandidateEffect = (
  command: string,
  args: ReadonlyArray<string>
): Effect.Effect<ProcessResult, TailscaleError> =>
  Effect.tryPromise({ try: () => runCandidate(command, args), catch: (cause) => processError(args, cause) })

const runFirstAvailable = (
  args: ReadonlyArray<string>,
  candidates: ReadonlyArray<string>
): Effect.Effect<ProcessResult, TailscaleError> => {
  const [candidate, ...rest] = candidates
  if (candidate === undefined) {
    return Effect.fail(cliMissing('tailscale CLI not found'))
  }
  return runCandidateEffect(candidate, args).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        error.code === 'TAILSCALE_CLI_MISSING' && rest.length > 0 ? runFirstAvailable(args, rest) : Effect.fail(error),
      onSuccess: (result) => Effect.succeed(result),
    })
  )
}

export const TailscaleProcessLive = Layer.succeed(TailscaleProcess, {
  run: (args) => runFirstAvailable(args, tailscaleCandidates),
})
