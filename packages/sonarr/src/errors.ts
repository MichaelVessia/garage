import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports SONARR_URL and SONARR_API_KEY from modules/programs/shell.nix.'

export type SonarrErrorCode =
  | 'SONARR_ENV_MISSING'
  | 'SONARR_UNREACHABLE'
  | 'SONARR_HTTP_ERROR'
  | 'SONARR_DECODE_ERROR'
  | 'SONARR_NOT_FOUND'
  | 'SONARR_DELETE_CONFIRMATION_REQUIRED'

export class SonarrError extends Schema.TaggedErrorClass<SonarrError>()('SonarrError', {
  code: Schema.Literals([
    'SONARR_ENV_MISSING',
    'SONARR_UNREACHABLE',
    'SONARR_HTTP_ERROR',
    'SONARR_DECODE_ERROR',
    'SONARR_NOT_FOUND',
    'SONARR_DELETE_CONFIRMATION_REQUIRED',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): SonarrError =>
  new SonarrError({
    code: 'SONARR_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string): SonarrError =>
  new SonarrError({
    code: 'SONARR_UNREACHABLE',
    message,
    fix: 'Verify Sonarr is reachable from this host and SONARR_URL points to the Sonarr base URL.',
  })

export const httpError = (status: number): SonarrError =>
  new SonarrError({
    code: 'SONARR_HTTP_ERROR',
    message: `Sonarr returned HTTP ${status}`,
    fix: 'Check the Sonarr API key, request parameters, and Sonarr server logs.',
  })

export const decodeError = (message: string): SonarrError =>
  new SonarrError({
    code: 'SONARR_DECODE_ERROR',
    message,
    fix: 'Update the Sonarr schemas to match the API response shape.',
  })

export const notFound = (message: string): SonarrError =>
  new SonarrError({
    code: 'SONARR_NOT_FOUND',
    message,
    fix: 'Search for the series first and retry with a TVDB ID returned by Sonarr lookup.',
  })

export const deleteConfirmationRequired = (): SonarrError =>
  new SonarrError({
    code: 'SONARR_DELETE_CONFIRMATION_REQUIRED',
    message: 'Deleting files requires --confirm-delete-files',
    fix: 'Re-run with --confirm-delete-files only if you intend to delete media files from disk.',
  })
