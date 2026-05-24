import { Schema } from 'effect'

export type TailscaleErrorCode =
  | 'TAILSCALE_CLI_MISSING'
  | 'TAILSCALE_COMMAND_FAILED'
  | 'TAILSCALE_DECODE_ERROR'
  | 'TAILSCALE_NOT_RUNNING'
  | 'TAILSCALE_CLI_USAGE'

export class TailscaleError extends Schema.TaggedErrorClass<TailscaleError>()('TailscaleError', {
  code: Schema.Literals([
    'TAILSCALE_CLI_MISSING',
    'TAILSCALE_COMMAND_FAILED',
    'TAILSCALE_DECODE_ERROR',
    'TAILSCALE_NOT_RUNNING',
    'TAILSCALE_CLI_USAGE',
  ]),
  message: Schema.String,
  fix: Schema.String,
  exitCode: Schema.optional(Schema.Number),
}) {}

export const cliMissing = (message: string): TailscaleError =>
  new TailscaleError({
    code: 'TAILSCALE_CLI_MISSING',
    message,
    fix: 'Install the tailscale CLI on PATH, then run tailscale up interactively if this host is not logged in.',
  })

export const commandFailed = (command: string, exitCode: number, output: string): TailscaleError =>
  new TailscaleError({
    code: 'TAILSCALE_COMMAND_FAILED',
    message: output.length === 0 ? `${command} exited with ${exitCode}` : output,
    fix: 'Run tailscale status locally to inspect daemon state and permissions.',
    exitCode,
  })

export const decodeError = (message: string): TailscaleError =>
  new TailscaleError({
    code: 'TAILSCALE_DECODE_ERROR',
    message,
    fix: 'Update the Tailscale status schemas to match the local CLI JSON shape.',
  })

export const notRunning = (backendState: string | undefined): TailscaleError =>
  new TailscaleError({
    code: 'TAILSCALE_NOT_RUNNING',
    message: `tailscaled is not running and logged in (BackendState=${backendState ?? 'unknown'})`,
    fix: 'Start Tailscale and log in with tailscale up from an interactive shell.',
  })

export const cliUsageError = (message: string): TailscaleError =>
  new TailscaleError({
    code: 'TAILSCALE_CLI_USAGE',
    message,
    fix: 'Run tailscale to inspect available commands and required arguments.',
  })
