import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports JELLYFIN_URL and JELLYFIN_API_KEY from modules/programs/shell.nix.'

export type JellyfinErrorCode =
  | 'JELLYFIN_ENV_MISSING'
  | 'JELLYFIN_UNREACHABLE'
  | 'JELLYFIN_HTTP_ERROR'
  | 'JELLYFIN_DECODE_ERROR'
  | 'JELLYFIN_NOT_FOUND'
  | 'JELLYFIN_CONFIRMATION_REQUIRED'

export class JellyfinError extends Schema.TaggedErrorClass<JellyfinError>()('JellyfinError', {
  code: Schema.Literals([
    'JELLYFIN_ENV_MISSING',
    'JELLYFIN_UNREACHABLE',
    'JELLYFIN_HTTP_ERROR',
    'JELLYFIN_DECODE_ERROR',
    'JELLYFIN_NOT_FOUND',
    'JELLYFIN_CONFIRMATION_REQUIRED',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): JellyfinError =>
  new JellyfinError({ code: 'JELLYFIN_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string): JellyfinError =>
  new JellyfinError({
    code: 'JELLYFIN_UNREACHABLE',
    message,
    fix: 'Verify Jellyfin is reachable from this host and JELLYFIN_URL points to the Jellyfin base URL.',
  })

export const httpError = (status: number): JellyfinError =>
  new JellyfinError({
    code: 'JELLYFIN_HTTP_ERROR',
    message: `Jellyfin returned HTTP ${status}`,
    fix: 'Check the Jellyfin API key, request parameters, and Jellyfin server logs.',
  })

export const decodeError = (message: string): JellyfinError =>
  new JellyfinError({
    code: 'JELLYFIN_DECODE_ERROR',
    message,
    fix: 'Update the Jellyfin schemas to match the API response shape.',
  })

export const notFound = (message: string): JellyfinError =>
  new JellyfinError({ code: 'JELLYFIN_NOT_FOUND', message, fix: 'Verify Jellyfin has at least one enabled user.' })

export const confirmationRequired = (): JellyfinError =>
  new JellyfinError({
    code: 'JELLYFIN_CONFIRMATION_REQUIRED',
    message: 'Running a scheduled task requires --confirm-run-task',
    fix: 'Re-run with --confirm-run-task only after user confirmation.',
  })
