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
  "Provision SABNZBD_URL and SABNZBD_API_KEY through the consuming application's secret environment."

export class SabnzbdEnvMissingError extends Schema.TaggedErrorClass<SabnzbdEnvMissingError>()(
  'SabnzbdEnvMissingError',
  envMissingFields('SABNZBD_ENV_MISSING')
) {}

export class SabnzbdUnreachableError extends Schema.TaggedErrorClass<SabnzbdUnreachableError>()(
  'SabnzbdUnreachableError',
  unreachableFields('SABNZBD_UNREACHABLE')
) {}

export class SabnzbdHttpError extends Schema.TaggedErrorClass<SabnzbdHttpError>()(
  'SabnzbdHttpError',
  httpErrorFields('SABNZBD_HTTP_ERROR')
) {}

export class SabnzbdDecodeError extends Schema.TaggedErrorClass<SabnzbdDecodeError>()(
  'SabnzbdDecodeError',
  decodeErrorFields('SABNZBD_DECODE_ERROR')
) {}

export const SabnzbdError = Schema.Union([
  SabnzbdEnvMissingError,
  SabnzbdUnreachableError,
  SabnzbdHttpError,
  SabnzbdDecodeError,
])
export type SabnzbdError = typeof SabnzbdError.Type
export type SabnzbdErrorCode = SabnzbdError['code']

export const envMissing = makeEnvMissing(SabnzbdEnvMissingError, 'SABNZBD_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  SabnzbdUnreachableError,
  'SABNZBD_UNREACHABLE',
  'Verify SABnzbd is reachable from this host and SABNZBD_URL points to the SABnzbd base URL.'
)

export const httpError = makeHttpError(
  SabnzbdHttpError,
  'SABNZBD_HTTP_ERROR',
  'SABnzbd',
  'Check the SABnzbd API key, request parameters, and SABnzbd server logs.'
)

export const decodeError = makeDecodeError(
  SabnzbdDecodeError,
  'SABNZBD_DECODE_ERROR',
  'Update the SABnzbd schemas to match the API response shape.'
)
