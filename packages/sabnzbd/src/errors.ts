import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports SABNZBD_URL and SABNZBD_API_KEY from modules/programs/shell.nix.'

export class SabnzbdEnvMissingError extends Schema.TaggedErrorClass<SabnzbdEnvMissingError>()(
  'SabnzbdEnvMissingError',
  {
    code: Schema.Literal('SABNZBD_ENV_MISSING'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class SabnzbdUnreachableError extends Schema.TaggedErrorClass<SabnzbdUnreachableError>()(
  'SabnzbdUnreachableError',
  {
    code: Schema.Literal('SABNZBD_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class SabnzbdHttpError extends Schema.TaggedErrorClass<SabnzbdHttpError>()('SabnzbdHttpError', {
  code: Schema.Literal('SABNZBD_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class SabnzbdDecodeError extends Schema.TaggedErrorClass<SabnzbdDecodeError>()('SabnzbdDecodeError', {
  code: Schema.Literal('SABNZBD_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class SabnzbdDeleteConfirmationRequiredError extends Schema.TaggedErrorClass<SabnzbdDeleteConfirmationRequiredError>()(
  'SabnzbdDeleteConfirmationRequiredError',
  {
    code: Schema.Literal('SABNZBD_DELETE_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const SabnzbdError = Schema.Union([
  SabnzbdEnvMissingError,
  SabnzbdUnreachableError,
  SabnzbdHttpError,
  SabnzbdDecodeError,
  SabnzbdDeleteConfirmationRequiredError,
])
export type SabnzbdError = typeof SabnzbdError.Type
export type SabnzbdErrorCode = SabnzbdError['code']

export const envMissing = (variable: string): SabnzbdEnvMissingError =>
  new SabnzbdEnvMissingError({
    code: 'SABNZBD_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string): SabnzbdUnreachableError =>
  new SabnzbdUnreachableError({
    code: 'SABNZBD_UNREACHABLE',
    message,
    fix: 'Verify SABnzbd is reachable from this host and SABNZBD_URL points to the SABnzbd base URL.',
  })

export const httpError = (status: number): SabnzbdHttpError =>
  new SabnzbdHttpError({
    code: 'SABNZBD_HTTP_ERROR',
    message: `SABnzbd returned HTTP ${status}`,
    fix: 'Check the SABnzbd API key, request parameters, and SABnzbd server logs.',
  })

export const decodeError = (message: string): SabnzbdDecodeError =>
  new SabnzbdDecodeError({
    code: 'SABNZBD_DECODE_ERROR',
    message,
    fix: 'Update the SABnzbd schemas to match the API response shape.',
  })

export const deleteConfirmationRequired = (): SabnzbdDeleteConfirmationRequiredError =>
  new SabnzbdDeleteConfirmationRequiredError({
    code: 'SABNZBD_DELETE_CONFIRMATION_REQUIRED',
    message: 'Deleting downloaded files requires --confirm-delete-files',
    fix: 'Re-run with --confirm-delete-files only if you intend to delete downloaded files from disk.',
  })
