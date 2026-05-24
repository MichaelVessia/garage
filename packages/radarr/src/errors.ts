import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports RADARR_URL and RADARR_API_KEY from modules/programs/shell.nix.'

export type RadarrErrorCode =
  | 'RADARR_ENV_MISSING'
  | 'RADARR_UNREACHABLE'
  | 'RADARR_HTTP_ERROR'
  | 'RADARR_DECODE_ERROR'
  | 'RADARR_NOT_FOUND'
  | 'RADARR_DELETE_CONFIRMATION_REQUIRED'
  | 'RADARR_COLLECTION_CONFIRMATION_REQUIRED'
  | 'RADARR_CLI_USAGE'

export class RadarrError extends Schema.TaggedErrorClass<RadarrError>()('RadarrError', {
  code: Schema.Literals([
    'RADARR_ENV_MISSING',
    'RADARR_UNREACHABLE',
    'RADARR_HTTP_ERROR',
    'RADARR_DECODE_ERROR',
    'RADARR_NOT_FOUND',
    'RADARR_DELETE_CONFIRMATION_REQUIRED',
    'RADARR_COLLECTION_CONFIRMATION_REQUIRED',
    'RADARR_CLI_USAGE',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): RadarrError =>
  new RadarrError({
    code: 'RADARR_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string): RadarrError =>
  new RadarrError({
    code: 'RADARR_UNREACHABLE',
    message,
    fix: 'Verify Radarr is reachable from this host and RADARR_URL points to the Radarr base URL.',
  })

export const httpError = (status: number): RadarrError =>
  new RadarrError({
    code: 'RADARR_HTTP_ERROR',
    message: `Radarr returned HTTP ${status}`,
    fix: 'Check the Radarr API key, request parameters, and Radarr server logs.',
  })

export const decodeError = (message: string): RadarrError =>
  new RadarrError({
    code: 'RADARR_DECODE_ERROR',
    message,
    fix: 'Update the Radarr schemas to match the API response shape.',
  })

export const notFound = (message: string): RadarrError =>
  new RadarrError({
    code: 'RADARR_NOT_FOUND',
    message,
    fix: 'Search for the movie first and retry with a TMDB ID returned by Radarr lookup.',
  })

export const deleteConfirmationRequired = (): RadarrError =>
  new RadarrError({
    code: 'RADARR_DELETE_CONFIRMATION_REQUIRED',
    message: 'Deleting files requires --confirm-delete-files',
    fix: 'Re-run with --confirm-delete-files only if you intend to delete media files from disk.',
  })

export const collectionConfirmationRequired = (): RadarrError =>
  new RadarrError({
    code: 'RADARR_COLLECTION_CONFIRMATION_REQUIRED',
    message: 'Adding a collection requires --confirm-add-collection',
    fix: 'Re-run with --confirm-add-collection only after confirming the collection add with the user.',
  })

export const cliUsageError = (message: string): RadarrError =>
  new RadarrError({
    code: 'RADARR_CLI_USAGE',
    message,
    fix: 'Run radarr to inspect available commands and required arguments.',
  })
