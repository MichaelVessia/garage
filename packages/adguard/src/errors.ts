import * as Schema from 'effect/Schema'

export const envFix =
  'Open a fresh shell so sops-nix exports ADGUARD_URL, ADGUARD_USERNAME, and ADGUARD_PASSWORD from modules/programs/shell.nix.'

export class AdguardEnvMissingError extends Schema.TaggedErrorClass<AdguardEnvMissingError>()(
  'AdguardEnvMissingError',
  {
    code: Schema.Literal('ADGUARD_ENV_MISSING'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class AdguardUnreachableError extends Schema.TaggedErrorClass<AdguardUnreachableError>()(
  'AdguardUnreachableError',
  {
    code: Schema.Literal('ADGUARD_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  }
) {}

export class AdguardHttpError extends Schema.TaggedErrorClass<AdguardHttpError>()('AdguardHttpError', {
  code: Schema.Literal('ADGUARD_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class AdguardDecodeError extends Schema.TaggedErrorClass<AdguardDecodeError>()('AdguardDecodeError', {
  code: Schema.Literal('ADGUARD_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

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

export const envMissing = (variable: string): AdguardEnvMissingError =>
  new AdguardEnvMissingError({ code: 'ADGUARD_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string, cause?: unknown): AdguardUnreachableError =>
  new AdguardUnreachableError({
    code: 'ADGUARD_UNREACHABLE',
    message,
    fix: 'Verify AdGuard Home is reachable from this host and ADGUARD_URL points to the AdGuard base URL.',
    ...(cause === undefined ? {} : { cause }),
  })

export const httpError = (status: number): AdguardHttpError =>
  new AdguardHttpError({
    code: 'ADGUARD_HTTP_ERROR',
    message: `AdGuard Home returned HTTP ${status}`,
    fix: 'Check the AdGuard username, password, request parameters, and AdGuard server logs.',
  })

export const decodeError = (message: string, cause?: unknown): AdguardDecodeError =>
  new AdguardDecodeError({
    code: 'ADGUARD_DECODE_ERROR',
    message,
    fix: 'Update the AdGuard schemas to match the API response shape.',
    ...(cause === undefined ? {} : { cause }),
  })

export const confirmationRequired = (): AdguardConfirmationRequiredError =>
  new AdguardConfirmationRequiredError({
    code: 'ADGUARD_CONFIRMATION_REQUIRED',
    message: 'Changing global DNS protection requires --confirm-toggle',
    fix: 'Re-run with --confirm-toggle only after user confirmation.',
  })
