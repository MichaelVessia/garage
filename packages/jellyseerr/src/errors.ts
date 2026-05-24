import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports JELLYSEERR_URL and JELLYSEERR_API_KEY from modules/programs/shell.nix.'

export type JellyseerrErrorCode =
  | 'JELLYSEERR_ENV_MISSING'
  | 'JELLYSEERR_UNREACHABLE'
  | 'JELLYSEERR_HTTP_ERROR'
  | 'JELLYSEERR_DECODE_ERROR'
  | 'JELLYSEERR_CLI_USAGE'
  | 'JELLYSEERR_CONFIRMATION_REQUIRED'

export class JellyseerrError extends Schema.TaggedErrorClass<JellyseerrError>()('JellyseerrError', {
  code: Schema.Literals([
    'JELLYSEERR_ENV_MISSING',
    'JELLYSEERR_UNREACHABLE',
    'JELLYSEERR_HTTP_ERROR',
    'JELLYSEERR_DECODE_ERROR',
    'JELLYSEERR_CLI_USAGE',
    'JELLYSEERR_CONFIRMATION_REQUIRED',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): JellyseerrError =>
  new JellyseerrError({
    code: 'JELLYSEERR_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string): JellyseerrError =>
  new JellyseerrError({
    code: 'JELLYSEERR_UNREACHABLE',
    message,
    fix: 'Verify Jellyseerr is reachable from this host and JELLYSEERR_URL points to the Jellyseerr base URL.',
  })

export const httpError = (status: number): JellyseerrError =>
  new JellyseerrError({
    code: 'JELLYSEERR_HTTP_ERROR',
    message: `Jellyseerr returned HTTP ${status}`,
    fix: 'Check the Jellyseerr API key, request parameters, and Jellyseerr server logs.',
  })

export const decodeError = (message: string): JellyseerrError =>
  new JellyseerrError({
    code: 'JELLYSEERR_DECODE_ERROR',
    message,
    fix: 'Update the Jellyseerr schemas to match the API response shape.',
  })

export const cliUsageError = (message: string): JellyseerrError =>
  new JellyseerrError({
    code: 'JELLYSEERR_CLI_USAGE',
    message,
    fix: 'Run jellyseerr to inspect available commands and required arguments.',
  })

export const confirmationRequired = (action: string, flag: string): JellyseerrError =>
  new JellyseerrError({
    code: 'JELLYSEERR_CONFIRMATION_REQUIRED',
    message: `${action} requires ${flag}`,
    fix: `Re-run with ${flag} only after user confirmation.`,
  })
