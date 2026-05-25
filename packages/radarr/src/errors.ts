import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports RADARR_URL and RADARR_API_KEY from modules/programs/shell.nix.'

export class RadarrEnvMissingError extends Schema.TaggedErrorClass<RadarrEnvMissingError>()('RadarrEnvMissingError', {
  code: Schema.Literal('RADARR_ENV_MISSING'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class RadarrUnreachableError extends Schema.TaggedErrorClass<RadarrUnreachableError>()(
  'RadarrUnreachableError',
  {
    code: Schema.Literal('RADARR_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class RadarrHttpError extends Schema.TaggedErrorClass<RadarrHttpError>()('RadarrHttpError', {
  code: Schema.Literal('RADARR_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class RadarrDecodeError extends Schema.TaggedErrorClass<RadarrDecodeError>()('RadarrDecodeError', {
  code: Schema.Literal('RADARR_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class RadarrNotFoundError extends Schema.TaggedErrorClass<RadarrNotFoundError>()('RadarrNotFoundError', {
  code: Schema.Literal('RADARR_NOT_FOUND'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class RadarrDeleteConfirmationRequiredError extends Schema.TaggedErrorClass<RadarrDeleteConfirmationRequiredError>()(
  'RadarrDeleteConfirmationRequiredError',
  {
    code: Schema.Literal('RADARR_DELETE_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class RadarrCollectionConfirmationRequiredError extends Schema.TaggedErrorClass<RadarrCollectionConfirmationRequiredError>()(
  'RadarrCollectionConfirmationRequiredError',
  {
    code: Schema.Literal('RADARR_COLLECTION_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const RadarrError = Schema.Union([
  RadarrEnvMissingError,
  RadarrUnreachableError,
  RadarrHttpError,
  RadarrDecodeError,
  RadarrNotFoundError,
  RadarrDeleteConfirmationRequiredError,
  RadarrCollectionConfirmationRequiredError,
])
export type RadarrError = typeof RadarrError.Type
export type RadarrErrorCode = RadarrError['code']

export const envMissing = (variable: string): RadarrEnvMissingError =>
  new RadarrEnvMissingError({
    code: 'RADARR_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string): RadarrUnreachableError =>
  new RadarrUnreachableError({
    code: 'RADARR_UNREACHABLE',
    message,
    fix: 'Verify Radarr is reachable from this host and RADARR_URL points to the Radarr base URL.',
  })

export const httpError = (status: number): RadarrHttpError =>
  new RadarrHttpError({
    code: 'RADARR_HTTP_ERROR',
    message: `Radarr returned HTTP ${status}`,
    fix: 'Check the Radarr API key, request parameters, and Radarr server logs.',
  })

export const decodeError = (message: string): RadarrDecodeError =>
  new RadarrDecodeError({
    code: 'RADARR_DECODE_ERROR',
    message,
    fix: 'Update the Radarr schemas to match the API response shape.',
  })

export const notFound = (message: string): RadarrNotFoundError =>
  new RadarrNotFoundError({
    code: 'RADARR_NOT_FOUND',
    message,
    fix: 'Search for the movie first and retry with a TMDB ID returned by Radarr lookup.',
  })

export const deleteConfirmationRequired = (): RadarrDeleteConfirmationRequiredError =>
  new RadarrDeleteConfirmationRequiredError({
    code: 'RADARR_DELETE_CONFIRMATION_REQUIRED',
    message: 'Deleting files requires --confirm-delete-files',
    fix: 'Re-run with --confirm-delete-files only if you intend to delete media files from disk.',
  })

export const collectionConfirmationRequired = (): RadarrCollectionConfirmationRequiredError =>
  new RadarrCollectionConfirmationRequiredError({
    code: 'RADARR_COLLECTION_CONFIRMATION_REQUIRED',
    message: 'Adding a collection requires --confirm-add-collection',
    fix: 'Re-run with --confirm-add-collection only after confirming the collection add with the user.',
  })
