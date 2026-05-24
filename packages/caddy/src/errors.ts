import { Schema } from 'effect'

export const envFix = 'Open a fresh shell so sops-nix exports CADDY_URL from modules/programs/shell.nix.'

export type CaddyErrorCode =
  | 'CADDY_ENV_MISSING'
  | 'CADDY_UNREACHABLE'
  | 'CADDY_HTTP_ERROR'
  | 'CADDY_DECODE_ERROR'
  | 'CADDY_CLI_USAGE'
  | 'CADDY_CONFIRMATION_REQUIRED'

export class CaddyError extends Schema.TaggedErrorClass<CaddyError>()('CaddyError', {
  code: Schema.Literals([
    'CADDY_ENV_MISSING',
    'CADDY_UNREACHABLE',
    'CADDY_HTTP_ERROR',
    'CADDY_DECODE_ERROR',
    'CADDY_CLI_USAGE',
    'CADDY_CONFIRMATION_REQUIRED',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): CaddyError =>
  new CaddyError({ code: 'CADDY_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string): CaddyError =>
  new CaddyError({
    code: 'CADDY_UNREACHABLE',
    message,
    fix: 'Verify Caddy is reachable from this host and CADDY_URL points to the Caddy admin API.',
  })

export const httpError = (status: number): CaddyError =>
  new CaddyError({
    code: 'CADDY_HTTP_ERROR',
    message: `Caddy returned HTTP ${status}`,
    fix: 'Check the Caddy admin API URL, request body, and Caddy logs.',
  })

export const decodeError = (message: string): CaddyError =>
  new CaddyError({
    code: 'CADDY_DECODE_ERROR',
    message,
    fix: 'Update the Caddy schemas to match the API response shape.',
  })

export const cliUsageError = (message: string): CaddyError =>
  new CaddyError({
    code: 'CADDY_CLI_USAGE',
    message,
    fix: 'Run caddy to inspect available commands and required arguments.',
  })

export const confirmationRequired = (): CaddyError =>
  new CaddyError({
    code: 'CADDY_CONFIRMATION_REQUIRED',
    message: 'Reloading the active Caddy config requires --confirm-reload',
    fix: 'Re-run with --confirm-reload only after user confirmation and config diff review.',
  })
