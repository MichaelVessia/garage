import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports SONARR_URL and SONARR_API_KEY from modules/programs/shell.nix.'

export class SonarrEnvMissingError extends Schema.TaggedErrorClass<SonarrEnvMissingError>()('SonarrEnvMissingError', {
  code: Schema.Literal('SONARR_ENV_MISSING'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class SonarrUnreachableError extends Schema.TaggedErrorClass<SonarrUnreachableError>()(
  'SonarrUnreachableError',
  {
    code: Schema.Literal('SONARR_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class SonarrHttpError extends Schema.TaggedErrorClass<SonarrHttpError>()('SonarrHttpError', {
  code: Schema.Literal('SONARR_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class SonarrDecodeError extends Schema.TaggedErrorClass<SonarrDecodeError>()('SonarrDecodeError', {
  code: Schema.Literal('SONARR_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

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

export const envMissing = (variable: string): SonarrEnvMissingError =>
  new SonarrEnvMissingError({
    code: 'SONARR_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string, cause?: unknown): SonarrUnreachableError =>
  new SonarrUnreachableError({
    code: 'SONARR_UNREACHABLE',
    message,
    fix: 'Verify Sonarr is reachable from this host and SONARR_URL points to the Sonarr base URL.',
    ...(cause === undefined ? {} : { cause }),
  })

export const httpError = (status: number): SonarrHttpError =>
  new SonarrHttpError({
    code: 'SONARR_HTTP_ERROR',
    message: `Sonarr returned HTTP ${status}`,
    fix: 'Check the Sonarr API key, request parameters, and Sonarr server logs.',
  })

export const decodeError = (message: string, cause?: unknown): SonarrDecodeError =>
  new SonarrDecodeError({
    code: 'SONARR_DECODE_ERROR',
    message,
    fix: 'Update the Sonarr schemas to match the API response shape.',
    ...(cause === undefined ? {} : { cause }),
  })

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
