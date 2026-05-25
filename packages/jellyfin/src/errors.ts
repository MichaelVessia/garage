import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports JELLYFIN_URL and JELLYFIN_API_KEY from modules/programs/shell.nix.'

export class JellyfinEnvMissingError extends Schema.TaggedErrorClass<JellyfinEnvMissingError>()(
  'JellyfinEnvMissingError',
  {
    code: Schema.Literal('JELLYFIN_ENV_MISSING'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class JellyfinUnreachableError extends Schema.TaggedErrorClass<JellyfinUnreachableError>()(
  'JellyfinUnreachableError',
  {
    code: Schema.Literal('JELLYFIN_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class JellyfinHttpError extends Schema.TaggedErrorClass<JellyfinHttpError>()('JellyfinHttpError', {
  code: Schema.Literal('JELLYFIN_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class JellyfinDecodeError extends Schema.TaggedErrorClass<JellyfinDecodeError>()('JellyfinDecodeError', {
  code: Schema.Literal('JELLYFIN_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

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

export const envMissing = (variable: string): JellyfinEnvMissingError =>
  new JellyfinEnvMissingError({ code: 'JELLYFIN_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string): JellyfinUnreachableError =>
  new JellyfinUnreachableError({
    code: 'JELLYFIN_UNREACHABLE',
    message,
    fix: 'Verify Jellyfin is reachable from this host and JELLYFIN_URL points to the Jellyfin base URL.',
  })

export const httpError = (status: number): JellyfinHttpError =>
  new JellyfinHttpError({
    code: 'JELLYFIN_HTTP_ERROR',
    message: `Jellyfin returned HTTP ${status}`,
    fix: 'Check the Jellyfin API key, request parameters, and Jellyfin server logs.',
  })

export const decodeError = (message: string): JellyfinDecodeError =>
  new JellyfinDecodeError({
    code: 'JELLYFIN_DECODE_ERROR',
    message,
    fix: 'Update the Jellyfin schemas to match the API response shape.',
  })

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
