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
  'Open a fresh shell so sops-nix exports JELLYSEERR_URL and JELLYSEERR_API_KEY from modules/programs/shell.nix.'

export class JellyseerrEnvMissingError extends Schema.TaggedErrorClass<JellyseerrEnvMissingError>()(
  'JellyseerrEnvMissingError',
  envMissingFields('JELLYSEERR_ENV_MISSING')
) {}

export class JellyseerrUnreachableError extends Schema.TaggedErrorClass<JellyseerrUnreachableError>()(
  'JellyseerrUnreachableError',
  unreachableFields('JELLYSEERR_UNREACHABLE')
) {}

export class JellyseerrHttpError extends Schema.TaggedErrorClass<JellyseerrHttpError>()(
  'JellyseerrHttpError',
  httpErrorFields('JELLYSEERR_HTTP_ERROR')
) {}

export class JellyseerrDecodeError extends Schema.TaggedErrorClass<JellyseerrDecodeError>()(
  'JellyseerrDecodeError',
  decodeErrorFields('JELLYSEERR_DECODE_ERROR')
) {}

export class JellyseerrConfirmationRequiredError extends Schema.TaggedErrorClass<JellyseerrConfirmationRequiredError>()(
  'JellyseerrConfirmationRequiredError',
  {
    code: Schema.Literal('JELLYSEERR_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const JellyseerrError = Schema.Union([
  JellyseerrEnvMissingError,
  JellyseerrUnreachableError,
  JellyseerrHttpError,
  JellyseerrDecodeError,
  JellyseerrConfirmationRequiredError,
])
export type JellyseerrError = typeof JellyseerrError.Type
export type JellyseerrErrorCode = JellyseerrError['code']

export const envMissing = makeEnvMissing(JellyseerrEnvMissingError, 'JELLYSEERR_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  JellyseerrUnreachableError,
  'JELLYSEERR_UNREACHABLE',
  'Verify Jellyseerr is reachable from this host and JELLYSEERR_URL points to the Jellyseerr base URL.'
)

export const httpError = makeHttpError(
  JellyseerrHttpError,
  'JELLYSEERR_HTTP_ERROR',
  'Jellyseerr',
  'Check the Jellyseerr API key, request parameters, and Jellyseerr server logs.'
)

export const decodeError = makeDecodeError(
  JellyseerrDecodeError,
  'JELLYSEERR_DECODE_ERROR',
  'Update the Jellyseerr schemas to match the API response shape.'
)

export const confirmationRequired = (action: string, flag: string): JellyseerrConfirmationRequiredError =>
  new JellyseerrConfirmationRequiredError({
    code: 'JELLYSEERR_CONFIRMATION_REQUIRED',
    message: `${action} requires ${flag}`,
    fix: `Re-run with ${flag} only after user confirmation.`,
  })
