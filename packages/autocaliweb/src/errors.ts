import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so AUTOCALIWEB_URL, AUTOCALIWEB_USERNAME, and AUTOCALIWEB_PASSWORD are exported.'

export class AutocaliwebEnvMissingError extends Schema.TaggedErrorClass<AutocaliwebEnvMissingError>()(
  'AutocaliwebEnvMissingError',
  {
    code: Schema.Literal('AUTOCALIWEB_ENV_MISSING'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class AutocaliwebUnreachableError extends Schema.TaggedErrorClass<AutocaliwebUnreachableError>()(
  'AutocaliwebUnreachableError',
  {
    code: Schema.Literal('AUTOCALIWEB_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class AutocaliwebHttpError extends Schema.TaggedErrorClass<AutocaliwebHttpError>()('AutocaliwebHttpError', {
  code: Schema.Literal('AUTOCALIWEB_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class AutocaliwebDecodeError extends Schema.TaggedErrorClass<AutocaliwebDecodeError>()(
  'AutocaliwebDecodeError',
  {
    code: Schema.Literal('AUTOCALIWEB_DECODE_ERROR'),
    message: Schema.String,
    fix: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export const AutocaliwebError = Schema.Union([
  AutocaliwebEnvMissingError,
  AutocaliwebUnreachableError,
  AutocaliwebHttpError,
  AutocaliwebDecodeError,
])
export type AutocaliwebError = typeof AutocaliwebError.Type
export type AutocaliwebErrorCode = AutocaliwebError['code']

export const envMissing = (variable: string): AutocaliwebEnvMissingError =>
  new AutocaliwebEnvMissingError({ code: 'AUTOCALIWEB_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string, cause?: unknown): AutocaliwebUnreachableError =>
  new AutocaliwebUnreachableError({
    code: 'AUTOCALIWEB_UNREACHABLE',
    message,
    fix: 'Verify Autocaliweb is reachable from this host and AUTOCALIWEB_URL points to the base URL.',
    ...(cause === undefined ? {} : { cause }),
  })

export const httpError = (status: number): AutocaliwebHttpError =>
  new AutocaliwebHttpError({
    code: 'AUTOCALIWEB_HTTP_ERROR',
    message: `Autocaliweb returned HTTP ${status}`,
    fix: 'Check the Autocaliweb URL, Basic auth credentials, request parameters, and server logs.',
  })

export const decodeError = (message: string, cause?: unknown): AutocaliwebDecodeError =>
  new AutocaliwebDecodeError({
    code: 'AUTOCALIWEB_DECODE_ERROR',
    message,
    fix: 'Update the Autocaliweb OPDS or JSON schemas to match the response shape.',
    ...(cause === undefined ? {} : { cause }),
  })
