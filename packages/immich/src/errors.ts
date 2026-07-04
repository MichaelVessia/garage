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
  'Open a fresh shell so sops-nix exports IMMICH_URL and IMMICH_API_KEY from modules/programs/shell.nix.'

export class ImmichEnvMissingError extends Schema.TaggedErrorClass<ImmichEnvMissingError>()(
  'ImmichEnvMissingError',
  envMissingFields('IMMICH_ENV_MISSING')
) {}

export class ImmichUnreachableError extends Schema.TaggedErrorClass<ImmichUnreachableError>()(
  'ImmichUnreachableError',
  unreachableFields('IMMICH_UNREACHABLE')
) {}

export class ImmichHttpError extends Schema.TaggedErrorClass<ImmichHttpError>()(
  'ImmichHttpError',
  httpErrorFields('IMMICH_HTTP_ERROR')
) {}

export class ImmichDecodeError extends Schema.TaggedErrorClass<ImmichDecodeError>()(
  'ImmichDecodeError',
  decodeErrorFields('IMMICH_DECODE_ERROR')
) {}

export const ImmichError = Schema.Union([
  ImmichEnvMissingError,
  ImmichUnreachableError,
  ImmichHttpError,
  ImmichDecodeError,
])
export type ImmichError = typeof ImmichError.Type
export type ImmichErrorCode = ImmichError['code']

export const envMissing = makeEnvMissing(ImmichEnvMissingError, 'IMMICH_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  ImmichUnreachableError,
  'IMMICH_UNREACHABLE',
  'Verify Immich is reachable from this host and IMMICH_URL points to the Immich base URL.'
)

export const httpError = makeHttpError(
  ImmichHttpError,
  'IMMICH_HTTP_ERROR',
  'Immich',
  'Check the Immich API key, request parameters, and Immich server logs.'
)

export const decodeError = makeDecodeError(
  ImmichDecodeError,
  'IMMICH_DECODE_ERROR',
  'Update the Immich schemas to match the API response shape.'
)
