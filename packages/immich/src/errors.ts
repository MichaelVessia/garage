import * as Schema from 'effect/Schema'

export const envFix =
  'Open a fresh shell so sops-nix exports IMMICH_URL and IMMICH_API_KEY from modules/programs/shell.nix.'

export class ImmichEnvMissingError extends Schema.TaggedErrorClass<ImmichEnvMissingError>()('ImmichEnvMissingError', {
  code: Schema.Literal('IMMICH_ENV_MISSING'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class ImmichUnreachableError extends Schema.TaggedErrorClass<ImmichUnreachableError>()(
  'ImmichUnreachableError',
  {
    code: Schema.Literal('IMMICH_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  }
) {}

export class ImmichHttpError extends Schema.TaggedErrorClass<ImmichHttpError>()('ImmichHttpError', {
  code: Schema.Literal('IMMICH_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
  status: Schema.Number,
}) {}

export class ImmichDecodeError extends Schema.TaggedErrorClass<ImmichDecodeError>()('ImmichDecodeError', {
  code: Schema.Literal('IMMICH_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export const ImmichError = Schema.Union([
  ImmichEnvMissingError,
  ImmichUnreachableError,
  ImmichHttpError,
  ImmichDecodeError,
])
export type ImmichError = typeof ImmichError.Type
export type ImmichErrorCode = ImmichError['code']

export const envMissing = (variable: string): ImmichEnvMissingError =>
  new ImmichEnvMissingError({ code: 'IMMICH_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string, cause?: unknown): ImmichUnreachableError =>
  new ImmichUnreachableError({
    code: 'IMMICH_UNREACHABLE',
    message,
    fix: 'Verify Immich is reachable from this host and IMMICH_URL points to the Immich base URL.',
    ...(cause === undefined ? {} : { cause }),
  })

export const httpError = (status: number): ImmichHttpError =>
  new ImmichHttpError({
    code: 'IMMICH_HTTP_ERROR',
    message: `Immich returned HTTP ${status}`,
    fix: 'Check the Immich API key, request parameters, and Immich server logs.',
    status,
  })

export const decodeError = (message: string, cause?: unknown): ImmichDecodeError =>
  new ImmichDecodeError({
    code: 'IMMICH_DECODE_ERROR',
    message,
    fix: 'Update the Immich schemas to match the API response shape.',
    ...(cause === undefined ? {} : { cause }),
  })
