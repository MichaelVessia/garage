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
  'Provision AUTOCALIWEB_URL, AUTOCALIWEB_USERNAME, and AUTOCALIWEB_PASSWORD in the application environment.'

export class AutocaliwebEnvMissingError extends Schema.TaggedErrorClass<AutocaliwebEnvMissingError>()(
  'AutocaliwebEnvMissingError',
  envMissingFields('AUTOCALIWEB_ENV_MISSING')
) {}

export class AutocaliwebUnreachableError extends Schema.TaggedErrorClass<AutocaliwebUnreachableError>()(
  'AutocaliwebUnreachableError',
  unreachableFields('AUTOCALIWEB_UNREACHABLE')
) {}

export class AutocaliwebHttpError extends Schema.TaggedErrorClass<AutocaliwebHttpError>()(
  'AutocaliwebHttpError',
  httpErrorFields('AUTOCALIWEB_HTTP_ERROR')
) {}

export class AutocaliwebDecodeError extends Schema.TaggedErrorClass<AutocaliwebDecodeError>()(
  'AutocaliwebDecodeError',
  decodeErrorFields('AUTOCALIWEB_DECODE_ERROR')
) {}

export const AutocaliwebError = Schema.Union([
  AutocaliwebEnvMissingError,
  AutocaliwebUnreachableError,
  AutocaliwebHttpError,
  AutocaliwebDecodeError,
])
export type AutocaliwebError = typeof AutocaliwebError.Type
export type AutocaliwebErrorCode = AutocaliwebError['code']

export const envMissing = makeEnvMissing(AutocaliwebEnvMissingError, 'AUTOCALIWEB_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  AutocaliwebUnreachableError,
  'AUTOCALIWEB_UNREACHABLE',
  'Verify Autocaliweb is reachable from this host and AUTOCALIWEB_URL points to the base URL.'
)

export const httpError = makeHttpError(
  AutocaliwebHttpError,
  'AUTOCALIWEB_HTTP_ERROR',
  'Autocaliweb',
  'Check the Autocaliweb URL, Basic auth credentials, request parameters, and server logs.'
)

export const decodeError = makeDecodeError(
  AutocaliwebDecodeError,
  'AUTOCALIWEB_DECODE_ERROR',
  'Update the Autocaliweb OPDS or JSON schemas to match the response shape.'
)
