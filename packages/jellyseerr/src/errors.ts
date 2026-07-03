import * as Schema from 'effect/Schema'

export const envFix =
  'Open a fresh shell so sops-nix exports JELLYSEERR_URL and JELLYSEERR_API_KEY from modules/programs/shell.nix.'

export class JellyseerrEnvMissingError extends Schema.TaggedErrorClass<JellyseerrEnvMissingError>()(
  'JellyseerrEnvMissingError',
  {
    code: Schema.Literal('JELLYSEERR_ENV_MISSING'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class JellyseerrUnreachableError extends Schema.TaggedErrorClass<JellyseerrUnreachableError>()(
  'JellyseerrUnreachableError',
  {
    code: Schema.Literal('JELLYSEERR_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  }
) {}

export class JellyseerrHttpError extends Schema.TaggedErrorClass<JellyseerrHttpError>()('JellyseerrHttpError', {
  code: Schema.Literal('JELLYSEERR_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class JellyseerrDecodeError extends Schema.TaggedErrorClass<JellyseerrDecodeError>()('JellyseerrDecodeError', {
  code: Schema.Literal('JELLYSEERR_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

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

export const envMissing = (variable: string): JellyseerrEnvMissingError =>
  new JellyseerrEnvMissingError({
    code: 'JELLYSEERR_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string, cause?: unknown): JellyseerrUnreachableError =>
  new JellyseerrUnreachableError({
    code: 'JELLYSEERR_UNREACHABLE',
    message,
    fix: 'Verify Jellyseerr is reachable from this host and JELLYSEERR_URL points to the Jellyseerr base URL.',
    ...(cause === undefined ? {} : { cause }),
  })

export const httpError = (status: number): JellyseerrHttpError =>
  new JellyseerrHttpError({
    code: 'JELLYSEERR_HTTP_ERROR',
    message: `Jellyseerr returned HTTP ${status}`,
    fix: 'Check the Jellyseerr API key, request parameters, and Jellyseerr server logs.',
  })

export const decodeError = (message: string, cause?: unknown): JellyseerrDecodeError =>
  new JellyseerrDecodeError({
    code: 'JELLYSEERR_DECODE_ERROR',
    message,
    fix: 'Update the Jellyseerr schemas to match the API response shape.',
    ...(cause === undefined ? {} : { cause }),
  })

export const confirmationRequired = (action: string, flag: string): JellyseerrConfirmationRequiredError =>
  new JellyseerrConfirmationRequiredError({
    code: 'JELLYSEERR_CONFIRMATION_REQUIRED',
    message: `${action} requires ${flag}`,
    fix: `Re-run with ${flag} only after user confirmation.`,
  })
