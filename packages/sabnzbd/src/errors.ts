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
  'Open a fresh shell so sops-nix exports SABNZBD_URL and SABNZBD_API_KEY from modules/programs/shell.nix.'

export class SabnzbdEnvMissingError extends Schema.TaggedErrorClass<SabnzbdEnvMissingError>()(
  'SabnzbdEnvMissingError',
  envMissingFields('SABNZBD_ENV_MISSING')
) {}

export class SabnzbdUnreachableError extends Schema.TaggedErrorClass<SabnzbdUnreachableError>()(
  'SabnzbdUnreachableError',
  unreachableFields('SABNZBD_UNREACHABLE')
) {}

export class SabnzbdHttpError extends Schema.TaggedErrorClass<SabnzbdHttpError>()(
  'SabnzbdHttpError',
  httpErrorFields('SABNZBD_HTTP_ERROR')
) {}

export class SabnzbdDecodeError extends Schema.TaggedErrorClass<SabnzbdDecodeError>()(
  'SabnzbdDecodeError',
  decodeErrorFields('SABNZBD_DECODE_ERROR')
) {}

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

export const envMissing = makeEnvMissing(SabnzbdEnvMissingError, 'SABNZBD_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  SabnzbdUnreachableError,
  'SABNZBD_UNREACHABLE',
  'Verify SABnzbd is reachable from this host and SABNZBD_URL points to the SABnzbd base URL.'
)

export const httpError = makeHttpError(
  SabnzbdHttpError,
  'SABNZBD_HTTP_ERROR',
  'SABnzbd',
  'Check the SABnzbd API key, request parameters, and SABnzbd server logs.'
)

export const decodeError = makeDecodeError(
  SabnzbdDecodeError,
  'SABNZBD_DECODE_ERROR',
  'Update the SABnzbd schemas to match the API response shape.'
)

export const deleteConfirmationRequired = (): SabnzbdDeleteConfirmationRequiredError =>
  new SabnzbdDeleteConfirmationRequiredError({
    code: 'SABNZBD_DELETE_CONFIRMATION_REQUIRED',
    message: 'Deleting downloaded files requires --confirm-delete-files',
    fix: 'Re-run with --confirm-delete-files only if you intend to delete downloaded files from disk.',
  })
