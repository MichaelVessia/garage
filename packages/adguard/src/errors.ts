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
  'Open a fresh shell so sops-nix exports ADGUARD_URL, ADGUARD_USERNAME, and ADGUARD_PASSWORD from modules/programs/shell.nix.'

export class AdguardEnvMissingError extends Schema.TaggedErrorClass<AdguardEnvMissingError>()(
  'AdguardEnvMissingError',
  envMissingFields('ADGUARD_ENV_MISSING')
) {}

export class AdguardUnreachableError extends Schema.TaggedErrorClass<AdguardUnreachableError>()(
  'AdguardUnreachableError',
  unreachableFields('ADGUARD_UNREACHABLE')
) {}

export class AdguardHttpError extends Schema.TaggedErrorClass<AdguardHttpError>()(
  'AdguardHttpError',
  httpErrorFields('ADGUARD_HTTP_ERROR')
) {}

export class AdguardDecodeError extends Schema.TaggedErrorClass<AdguardDecodeError>()(
  'AdguardDecodeError',
  decodeErrorFields('ADGUARD_DECODE_ERROR')
) {}

export class AdguardConfirmationRequiredError extends Schema.TaggedErrorClass<AdguardConfirmationRequiredError>()(
  'AdguardConfirmationRequiredError',
  {
    code: Schema.Literal('ADGUARD_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const AdguardError = Schema.Union([
  AdguardEnvMissingError,
  AdguardUnreachableError,
  AdguardHttpError,
  AdguardDecodeError,
  AdguardConfirmationRequiredError,
])
export type AdguardError = typeof AdguardError.Type
export type AdguardErrorCode = AdguardError['code']

export const envMissing = makeEnvMissing(AdguardEnvMissingError, 'ADGUARD_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  AdguardUnreachableError,
  'ADGUARD_UNREACHABLE',
  'Verify AdGuard Home is reachable from this host and ADGUARD_URL points to the AdGuard base URL.'
)

export const httpError = makeHttpError(
  AdguardHttpError,
  'ADGUARD_HTTP_ERROR',
  'AdGuard Home',
  'Check the AdGuard username, password, request parameters, and AdGuard server logs.'
)

export const decodeError = makeDecodeError(
  AdguardDecodeError,
  'ADGUARD_DECODE_ERROR',
  'Update the AdGuard schemas to match the API response shape.'
)

export const confirmationRequired = (): AdguardConfirmationRequiredError =>
  new AdguardConfirmationRequiredError({
    code: 'ADGUARD_CONFIRMATION_REQUIRED',
    message: 'Changing global DNS protection requires --confirm-toggle',
    fix: 'Re-run with --confirm-toggle only after user confirmation.',
  })
