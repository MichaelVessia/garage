import {
  decodeErrorFields,
  envMissingFields,
  httpErrorFields,
  makeDecodeError,
  makeEnvMissing,
  makeHttpError,
  makeUnreachable,
  unreachableFields,
} from '@garage/cli-protocol'
import * as Schema from 'effect/Schema'

export const envFix =
  'Open a fresh shell so sops-nix exports RADARR_URL and RADARR_API_KEY from modules/programs/shell.nix.'

export class RadarrEnvMissingError extends Schema.TaggedErrorClass<RadarrEnvMissingError>()(
  'RadarrEnvMissingError',
  envMissingFields('RADARR_ENV_MISSING')
) {}

export class RadarrUnreachableError extends Schema.TaggedErrorClass<RadarrUnreachableError>()(
  'RadarrUnreachableError',
  unreachableFields('RADARR_UNREACHABLE')
) {}

export class RadarrHttpError extends Schema.TaggedErrorClass<RadarrHttpError>()(
  'RadarrHttpError',
  httpErrorFields('RADARR_HTTP_ERROR')
) {}

export class RadarrDecodeError extends Schema.TaggedErrorClass<RadarrDecodeError>()(
  'RadarrDecodeError',
  decodeErrorFields('RADARR_DECODE_ERROR')
) {}

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

export const envMissing = makeEnvMissing(RadarrEnvMissingError, 'RADARR_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  RadarrUnreachableError,
  'RADARR_UNREACHABLE',
  'Verify Radarr is reachable from this host and RADARR_URL points to the Radarr base URL.'
)

export const httpError = makeHttpError(
  RadarrHttpError,
  'RADARR_HTTP_ERROR',
  'Radarr',
  'Check the Radarr API key, request parameters, and Radarr server logs.'
)

export const decodeError = makeDecodeError(
  RadarrDecodeError,
  'RADARR_DECODE_ERROR',
  'Update the Radarr schemas to match the API response shape.'
)

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
