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
  'Open a fresh shell so sops-nix exports SONARR_URL and SONARR_API_KEY from modules/programs/shell.nix.'

export class SonarrEnvMissingError extends Schema.TaggedErrorClass<SonarrEnvMissingError>()(
  'SonarrEnvMissingError',
  envMissingFields('SONARR_ENV_MISSING')
) {}

export class SonarrUnreachableError extends Schema.TaggedErrorClass<SonarrUnreachableError>()(
  'SonarrUnreachableError',
  unreachableFields('SONARR_UNREACHABLE')
) {}

export class SonarrHttpError extends Schema.TaggedErrorClass<SonarrHttpError>()(
  'SonarrHttpError',
  httpErrorFields('SONARR_HTTP_ERROR')
) {}

export class SonarrDecodeError extends Schema.TaggedErrorClass<SonarrDecodeError>()(
  'SonarrDecodeError',
  decodeErrorFields('SONARR_DECODE_ERROR')
) {}

export class SonarrNotFoundError extends Schema.TaggedErrorClass<SonarrNotFoundError>()('SonarrNotFoundError', {
  code: Schema.Literal('SONARR_NOT_FOUND'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class SonarrDeleteConfirmationRequiredError extends Schema.TaggedErrorClass<SonarrDeleteConfirmationRequiredError>()(
  'SonarrDeleteConfirmationRequiredError',
  {
    code: Schema.Literal('SONARR_DELETE_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const SonarrError = Schema.Union([
  SonarrEnvMissingError,
  SonarrUnreachableError,
  SonarrHttpError,
  SonarrDecodeError,
  SonarrNotFoundError,
  SonarrDeleteConfirmationRequiredError,
])
export type SonarrError = typeof SonarrError.Type
export type SonarrErrorCode = SonarrError['code']

export const envMissing = makeEnvMissing(SonarrEnvMissingError, 'SONARR_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  SonarrUnreachableError,
  'SONARR_UNREACHABLE',
  'Verify Sonarr is reachable from this host and SONARR_URL points to the Sonarr base URL.'
)

export const httpError = makeHttpError(
  SonarrHttpError,
  'SONARR_HTTP_ERROR',
  'Sonarr',
  'Check the Sonarr API key, request parameters, and Sonarr server logs.'
)

export const decodeError = makeDecodeError(
  SonarrDecodeError,
  'SONARR_DECODE_ERROR',
  'Update the Sonarr schemas to match the API response shape.'
)

export const notFound = (message: string): SonarrNotFoundError =>
  new SonarrNotFoundError({
    code: 'SONARR_NOT_FOUND',
    message,
    fix: 'Search for the series first and retry with a TVDB ID returned by Sonarr lookup.',
  })

export const deleteConfirmationRequired = (): SonarrDeleteConfirmationRequiredError =>
  new SonarrDeleteConfirmationRequiredError({
    code: 'SONARR_DELETE_CONFIRMATION_REQUIRED',
    message: 'Deleting files requires --confirm-delete-files',
    fix: 'Re-run with --confirm-delete-files only if you intend to delete media files from disk.',
  })
