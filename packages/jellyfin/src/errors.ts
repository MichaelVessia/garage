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
  'Open a fresh shell so sops-nix exports JELLYFIN_URL and JELLYFIN_API_KEY from modules/programs/shell.nix.'

export class JellyfinEnvMissingError extends Schema.TaggedErrorClass<JellyfinEnvMissingError>()(
  'JellyfinEnvMissingError',
  envMissingFields('JELLYFIN_ENV_MISSING')
) {}

export class JellyfinUnreachableError extends Schema.TaggedErrorClass<JellyfinUnreachableError>()(
  'JellyfinUnreachableError',
  unreachableFields('JELLYFIN_UNREACHABLE')
) {}

export class JellyfinHttpError extends Schema.TaggedErrorClass<JellyfinHttpError>()(
  'JellyfinHttpError',
  httpErrorFields('JELLYFIN_HTTP_ERROR')
) {}

export class JellyfinDecodeError extends Schema.TaggedErrorClass<JellyfinDecodeError>()(
  'JellyfinDecodeError',
  decodeErrorFields('JELLYFIN_DECODE_ERROR')
) {}

export class JellyfinNotFoundError extends Schema.TaggedErrorClass<JellyfinNotFoundError>()('JellyfinNotFoundError', {
  code: Schema.Literal('JELLYFIN_NOT_FOUND'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class JellyfinConfirmationRequiredError extends Schema.TaggedErrorClass<JellyfinConfirmationRequiredError>()(
  'JellyfinConfirmationRequiredError',
  {
    code: Schema.Literal('JELLYFIN_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const JellyfinError = Schema.Union([
  JellyfinEnvMissingError,
  JellyfinUnreachableError,
  JellyfinHttpError,
  JellyfinDecodeError,
  JellyfinNotFoundError,
  JellyfinConfirmationRequiredError,
])
export type JellyfinError = typeof JellyfinError.Type
export type JellyfinErrorCode = JellyfinError['code']

export const envMissing = makeEnvMissing(JellyfinEnvMissingError, 'JELLYFIN_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  JellyfinUnreachableError,
  'JELLYFIN_UNREACHABLE',
  'Verify Jellyfin is reachable from this host and JELLYFIN_URL points to the Jellyfin base URL.'
)

export const httpError = makeHttpError(
  JellyfinHttpError,
  'JELLYFIN_HTTP_ERROR',
  'Jellyfin',
  'Check the Jellyfin API key, request parameters, and Jellyfin server logs.'
)

export const decodeError = makeDecodeError(
  JellyfinDecodeError,
  'JELLYFIN_DECODE_ERROR',
  'Update the Jellyfin schemas to match the API response shape.'
)

export const notFound = (message: string): JellyfinNotFoundError =>
  new JellyfinNotFoundError({
    code: 'JELLYFIN_NOT_FOUND',
    message,
    fix: 'Verify Jellyfin has at least one enabled user.',
  })

export const confirmationRequired = (): JellyfinConfirmationRequiredError =>
  new JellyfinConfirmationRequiredError({
    code: 'JELLYFIN_CONFIRMATION_REQUIRED',
    message: 'Running a scheduled task requires --confirm-run-task',
    fix: 'Re-run with --confirm-run-task only after user confirmation.',
  })
