import {
  decodeErrorFields,
  envMissingFields,
  httpErrorFields,
  makeDecodeError,
  makeEnvMissing,
  makeHttpError,
  makeUnreachable,
  unreachableFields,
} from '@garage/integration-http'
import * as Schema from 'effect/Schema'

const envFix = "Provision SABNZBD_URL and SABNZBD_API_KEY through the consuming application's secret environment."

class SabnzbdEnvMissingError extends Schema.TaggedError<SabnzbdEnvMissingError, { readonly brand: unique symbol }>()(
  'SabnzbdEnvMissingError',
  envMissingFields('SABNZBD_ENV_MISSING')
) {}

class SabnzbdUnreachableError extends Schema.TaggedError<SabnzbdUnreachableError, { readonly brand: unique symbol }>()(
  'SabnzbdUnreachableError',
  unreachableFields('SABNZBD_UNREACHABLE')
) {}

class SabnzbdHttpError extends Schema.TaggedError<SabnzbdHttpError, { readonly brand: unique symbol }>()(
  'SabnzbdHttpError',
  httpErrorFields('SABNZBD_HTTP_ERROR')
) {}

class SabnzbdDecodeError extends Schema.TaggedError<SabnzbdDecodeError, { readonly brand: unique symbol }>()(
  'SabnzbdDecodeError',
  decodeErrorFields('SABNZBD_DECODE_ERROR')
) {}

const SabnzbdError = Schema.Union([
  SabnzbdEnvMissingError,
  SabnzbdUnreachableError,
  SabnzbdHttpError,
  SabnzbdDecodeError,
])

export type SabnzbdError = typeof SabnzbdError.Type

export const envMissing = makeEnvMissing({ error: SabnzbdEnvMissingError, code: 'SABNZBD_ENV_MISSING', fix: envFix })

export const unreachable = makeUnreachable({
  error: SabnzbdUnreachableError,
  code: 'SABNZBD_UNREACHABLE',
  fix: 'Verify SABnzbd is reachable from this host and SABNZBD_URL points to the SABnzbd base URL.',
})

export const httpError = makeHttpError({
  error: SabnzbdHttpError,
  code: 'SABNZBD_HTTP_ERROR',
  displayName: 'SABnzbd',
  fix: 'Check the SABnzbd API key, request parameters, and SABnzbd server logs.',
})

export const decodeError = makeDecodeError({
  error: SabnzbdDecodeError,
  code: 'SABNZBD_DECODE_ERROR',
  fix: 'Update the SABnzbd schemas to match the API response shape.',
})
