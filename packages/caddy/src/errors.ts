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

export const envFix = 'Open a fresh shell so sops-nix exports CADDY_URL from modules/programs/shell.nix.'

export class CaddyEnvMissingError extends Schema.TaggedErrorClass<CaddyEnvMissingError>()(
  'CaddyEnvMissingError',
  envMissingFields('CADDY_ENV_MISSING')
) {}

export class CaddyUnreachableError extends Schema.TaggedErrorClass<CaddyUnreachableError>()(
  'CaddyUnreachableError',
  unreachableFields('CADDY_UNREACHABLE')
) {}

export class CaddyHttpError extends Schema.TaggedErrorClass<CaddyHttpError>()(
  'CaddyHttpError',
  httpErrorFields('CADDY_HTTP_ERROR')
) {}

export class CaddyDecodeError extends Schema.TaggedErrorClass<CaddyDecodeError>()(
  'CaddyDecodeError',
  decodeErrorFields('CADDY_DECODE_ERROR')
) {}

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

export const envMissing = makeEnvMissing(CaddyEnvMissingError, 'CADDY_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  CaddyUnreachableError,
  'CADDY_UNREACHABLE',
  'Verify Caddy is reachable from this host and CADDY_URL points to the Caddy admin API.'
)

export const httpError = makeHttpError(
  CaddyHttpError,
  'CADDY_HTTP_ERROR',
  'Caddy',
  'Check the Caddy admin API URL, request body, and Caddy logs.'
)

export const decodeError = makeDecodeError(
  CaddyDecodeError,
  'CADDY_DECODE_ERROR',
  'Update the Caddy schemas to match the API response shape.'
)

export const confirmationRequired = (): CaddyConfirmationRequiredError =>
  new CaddyConfirmationRequiredError({
    code: 'CADDY_CONFIRMATION_REQUIRED',
    message: 'Reloading the active Caddy config requires --confirm-reload',
    fix: 'Re-run with --confirm-reload only after user confirmation and config diff review.',
  })
