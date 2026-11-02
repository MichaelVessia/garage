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

const envFix =
  'Provision AUTOCALIWEB_URL, AUTOCALIWEB_USERNAME, and AUTOCALIWEB_PASSWORD in the application environment.'

class AutocaliwebEnvMissingError extends Schema.TaggedError<
  AutocaliwebEnvMissingError,
  { readonly brand: unique symbol }
>()('AutocaliwebEnvMissingError', envMissingFields('AUTOCALIWEB_ENV_MISSING')) {}

class AutocaliwebUnreachableError extends Schema.TaggedError<
  AutocaliwebUnreachableError,
  { readonly brand: unique symbol }
>()('AutocaliwebUnreachableError', unreachableFields('AUTOCALIWEB_UNREACHABLE')) {}

class AutocaliwebHttpError extends Schema.TaggedError<AutocaliwebHttpError, { readonly brand: unique symbol }>()(
  'AutocaliwebHttpError',
  httpErrorFields('AUTOCALIWEB_HTTP_ERROR')
) {}

class AutocaliwebDecodeError extends Schema.TaggedError<AutocaliwebDecodeError, { readonly brand: unique symbol }>()(
  'AutocaliwebDecodeError',
  decodeErrorFields('AUTOCALIWEB_DECODE_ERROR')
) {}

const AutocaliwebError = Schema.Union([
  AutocaliwebEnvMissingError,
  AutocaliwebUnreachableError,
  AutocaliwebHttpError,
  AutocaliwebDecodeError,
])

export type AutocaliwebError = typeof AutocaliwebError.Type

export const envMissing = makeEnvMissing({
  error: AutocaliwebEnvMissingError,
  code: 'AUTOCALIWEB_ENV_MISSING',
  fix: envFix,
})

export const unreachable = makeUnreachable({
  error: AutocaliwebUnreachableError,
  code: 'AUTOCALIWEB_UNREACHABLE',
  fix: 'Verify Autocaliweb is reachable from this host and AUTOCALIWEB_URL points to the base URL.',
})

export const httpError = makeHttpError({
  error: AutocaliwebHttpError,
  code: 'AUTOCALIWEB_HTTP_ERROR',
  displayName: 'Autocaliweb',
  fix: 'Check the Autocaliweb URL, Basic auth credentials, request parameters, and server logs.',
})

export const decodeError = makeDecodeError({
  error: AutocaliwebDecodeError,
  code: 'AUTOCALIWEB_DECODE_ERROR',
  fix: 'Update the Autocaliweb OPDS or JSON schemas to match the response shape.',
})
