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

export class JellyfinConfiguredUserError extends Schema.TaggedErrorClass<JellyfinConfiguredUserError>()(
  'JellyfinConfiguredUserError',
  {
    code: Schema.Literal('JELLYFIN_USER_ID_INVALID'),
    message: Schema.String,
    fix: Schema.String,
    reason: Schema.Literals(['missing', 'disabled']),
    userId: Schema.String,
  }
) {}

export class JellyfinNoEnabledAdministratorError extends Schema.TaggedErrorClass<JellyfinNoEnabledAdministratorError>()(
  'JellyfinNoEnabledAdministratorError',
  {
    code: Schema.Literal('JELLYFIN_NO_ENABLED_ADMINISTRATOR'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class JellyfinAmbiguousAdministratorError extends Schema.TaggedErrorClass<JellyfinAmbiguousAdministratorError>()(
  'JellyfinAmbiguousAdministratorError',
  {
    code: Schema.Literal('JELLYFIN_AMBIGUOUS_ADMINISTRATOR'),
    message: Schema.String,
    fix: Schema.String,
    enabledAdministratorCount: Schema.Number,
  }
) {}

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
  JellyfinConfiguredUserError,
  JellyfinNoEnabledAdministratorError,
  JellyfinAmbiguousAdministratorError,
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

const configuredUserFix =
  'Set JELLYFIN_USER_ID to the ID of an enabled Jellyfin user. Run jellyfin users to inspect user IDs and policy state.'

export const missingConfiguredUser = (userId: string): JellyfinConfiguredUserError =>
  new JellyfinConfiguredUserError({
    code: 'JELLYFIN_USER_ID_INVALID',
    message: `Configured Jellyfin user ${userId} was not found`,
    fix: configuredUserFix,
    reason: 'missing',
    userId,
  })

export const disabledConfiguredUser = (userId: string): JellyfinConfiguredUserError =>
  new JellyfinConfiguredUserError({
    code: 'JELLYFIN_USER_ID_INVALID',
    message: `Configured Jellyfin user ${userId} is disabled`,
    fix: configuredUserFix,
    reason: 'disabled',
    userId,
  })

export const noEnabledAdministrator = (): JellyfinNoEnabledAdministratorError =>
  new JellyfinNoEnabledAdministratorError({
    code: 'JELLYFIN_NO_ENABLED_ADMINISTRATOR',
    message: 'No enabled Jellyfin administrator is available for media visibility',
    fix: 'Set JELLYFIN_USER_ID to an enabled Jellyfin user ID, or enable exactly one Jellyfin administrator.',
  })

export const ambiguousAdministrator = (enabledAdministratorCount: number): JellyfinAmbiguousAdministratorError =>
  new JellyfinAmbiguousAdministratorError({
    code: 'JELLYFIN_AMBIGUOUS_ADMINISTRATOR',
    message: 'Multiple enabled Jellyfin administrators are available for media visibility',
    fix: 'Set JELLYFIN_USER_ID to the enabled Jellyfin user whose media visibility should be used.',
    enabledAdministratorCount,
  })

export const confirmationRequired = (): JellyfinConfirmationRequiredError =>
  new JellyfinConfirmationRequiredError({
    code: 'JELLYFIN_CONFIRMATION_REQUIRED',
    message: 'Running a scheduled task requires --confirm-run-task',
    fix: 'Re-run with --confirm-run-task only after user confirmation.',
  })
