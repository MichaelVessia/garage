import { Schema } from 'effect'

export const envFix = 'Open a fresh shell so sops-nix exports CADDY_URL from modules/programs/shell.nix.'

export class CaddyEnvMissingError extends Schema.TaggedErrorClass<CaddyEnvMissingError>()('CaddyEnvMissingError', {
  code: Schema.Literal('CADDY_ENV_MISSING'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class CaddyUnreachableError extends Schema.TaggedErrorClass<CaddyUnreachableError>()('CaddyUnreachableError', {
  code: Schema.Literal('CADDY_UNREACHABLE'),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export class CaddyHttpError extends Schema.TaggedErrorClass<CaddyHttpError>()('CaddyHttpError', {
  code: Schema.Literal('CADDY_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class CaddyDecodeError extends Schema.TaggedErrorClass<CaddyDecodeError>()('CaddyDecodeError', {
  code: Schema.Literal('CADDY_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export class CaddyConfirmationRequiredError extends Schema.TaggedErrorClass<CaddyConfirmationRequiredError>()(
  'CaddyConfirmationRequiredError',
  {
    code: Schema.Literal('CADDY_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const CaddyError = Schema.Union([
  CaddyEnvMissingError,
  CaddyUnreachableError,
  CaddyHttpError,
  CaddyDecodeError,
  CaddyConfirmationRequiredError,
])
export type CaddyError = typeof CaddyError.Type
export type CaddyErrorCode = CaddyError['code']

export const envMissing = (variable: string): CaddyEnvMissingError =>
  new CaddyEnvMissingError({ code: 'CADDY_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string, cause?: unknown): CaddyUnreachableError =>
  new CaddyUnreachableError({
    code: 'CADDY_UNREACHABLE',
    message,
    fix: 'Verify Caddy is reachable from this host and CADDY_URL points to the Caddy admin API.',
    ...(cause === undefined ? {} : { cause }),
  })

export const httpError = (status: number): CaddyHttpError =>
  new CaddyHttpError({
    code: 'CADDY_HTTP_ERROR',
    message: `Caddy returned HTTP ${status}`,
    fix: 'Check the Caddy admin API URL, request body, and Caddy logs.',
  })

export const decodeError = (message: string, cause?: unknown): CaddyDecodeError =>
  new CaddyDecodeError({
    code: 'CADDY_DECODE_ERROR',
    message,
    fix: 'Update the Caddy schemas to match the API response shape.',
    ...(cause === undefined ? {} : { cause }),
  })

export const confirmationRequired = (): CaddyConfirmationRequiredError =>
  new CaddyConfirmationRequiredError({
    code: 'CADDY_CONFIRMATION_REQUIRED',
    message: 'Reloading the active Caddy config requires --confirm-reload',
    fix: 'Re-run with --confirm-reload only after user confirmation and config diff review.',
  })
