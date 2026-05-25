import { Schema } from 'effect'

export class TailscaleCliMissingError extends Schema.TaggedErrorClass<TailscaleCliMissingError>()(
  'TailscaleCliMissingError',
  {
    code: Schema.Literal('TAILSCALE_CLI_MISSING'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class TailscaleCommandFailedError extends Schema.TaggedErrorClass<TailscaleCommandFailedError>()(
  'TailscaleCommandFailedError',
  {
    code: Schema.Literal('TAILSCALE_COMMAND_FAILED'),
    message: Schema.String,
    fix: Schema.String,
    exitCode: Schema.Number,
  }
) {}

export class TailscaleDecodeError extends Schema.TaggedErrorClass<TailscaleDecodeError>()('TailscaleDecodeError', {
  code: Schema.Literal('TAILSCALE_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class TailscaleNotRunningError extends Schema.TaggedErrorClass<TailscaleNotRunningError>()(
  'TailscaleNotRunningError',
  {
    code: Schema.Literal('TAILSCALE_NOT_RUNNING'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const TailscaleError = Schema.Union([
  TailscaleCliMissingError,
  TailscaleCommandFailedError,
  TailscaleDecodeError,
  TailscaleNotRunningError,
])
export type TailscaleError = typeof TailscaleError.Type
export type TailscaleErrorCode = TailscaleError['code']

export const cliMissing = (message: string): TailscaleCliMissingError =>
  new TailscaleCliMissingError({
    code: 'TAILSCALE_CLI_MISSING',
    message,
    fix: 'Install the tailscale CLI on PATH, then run tailscale up interactively if this host is not logged in.',
  })

export const commandFailed = (command: string, exitCode: number, output: string): TailscaleCommandFailedError =>
  new TailscaleCommandFailedError({
    code: 'TAILSCALE_COMMAND_FAILED',
    message: output.length === 0 ? `${command} exited with ${exitCode}` : output,
    fix: 'Run tailscale status locally to inspect daemon state and permissions.',
    exitCode,
  })

export const decodeError = (message: string): TailscaleDecodeError =>
  new TailscaleDecodeError({
    code: 'TAILSCALE_DECODE_ERROR',
    message,
    fix: 'Update the Tailscale status schemas to match the local CLI JSON shape.',
  })

export const notRunning = (backendState: string | undefined): TailscaleNotRunningError =>
  new TailscaleNotRunningError({
    code: 'TAILSCALE_NOT_RUNNING',
    message: `tailscaled is not running and logged in (BackendState=${backendState ?? 'unknown'})`,
    fix: 'Start Tailscale and log in with tailscale up from an interactive shell.',
  })
