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
  'Open a fresh shell so sops-nix exports TUBEARCHIVIST_URL, TUBEARCHIVIST_USERNAME, and TUBEARCHIVIST_PASSWORD from modules/programs/shell.nix.'

export class TubearchivistEnvMissingError extends Schema.TaggedErrorClass<TubearchivistEnvMissingError>()(
  'TubearchivistEnvMissingError',
  envMissingFields('TUBEARCHIVIST_ENV_MISSING')
) {}

export class TubearchivistUnreachableError extends Schema.TaggedErrorClass<TubearchivistUnreachableError>()(
  'TubearchivistUnreachableError',
  unreachableFields('TUBEARCHIVIST_UNREACHABLE')
) {}

export class TubearchivistHttpError extends Schema.TaggedErrorClass<TubearchivistHttpError>()(
  'TubearchivistHttpError',
  httpErrorFields('TUBEARCHIVIST_HTTP_ERROR')
) {}

export class TubearchivistDecodeError extends Schema.TaggedErrorClass<TubearchivistDecodeError>()(
  'TubearchivistDecodeError',
  decodeErrorFields('TUBEARCHIVIST_DECODE_ERROR')
) {}

export class TubearchivistConfirmationRequiredError extends Schema.TaggedErrorClass<TubearchivistConfirmationRequiredError>()(
  'TubearchivistConfirmationRequiredError',
  {
    code: Schema.Literal('TUBEARCHIVIST_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const TubearchivistError = Schema.Union([
  TubearchivistEnvMissingError,
  TubearchivistUnreachableError,
  TubearchivistHttpError,
  TubearchivistDecodeError,
  TubearchivistConfirmationRequiredError,
])
export type TubearchivistError = typeof TubearchivistError.Type
export type TubearchivistErrorCode = TubearchivistError['code']

export const envMissing = makeEnvMissing(TubearchivistEnvMissingError, 'TUBEARCHIVIST_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  TubearchivistUnreachableError,
  'TUBEARCHIVIST_UNREACHABLE',
  'Verify TubeArchivist is reachable from this host and TUBEARCHIVIST_URL points to the base URL.'
)

export const httpError = makeHttpError(
  TubearchivistHttpError,
  'TUBEARCHIVIST_HTTP_ERROR',
  'TubeArchivist',
  'Check the TubeArchivist credentials, request parameters, and server logs.'
)

export const decodeError = makeDecodeError(
  TubearchivistDecodeError,
  'TUBEARCHIVIST_DECODE_ERROR',
  'Update the TubeArchivist schemas to match the API response shape.'
)

export const confirmationRequired = (flag: string): TubearchivistConfirmationRequiredError =>
  new TubearchivistConfirmationRequiredError({
    code: 'TUBEARCHIVIST_CONFIRMATION_REQUIRED',
    message: `${flag} is required`,
    fix: `Re-run the command with ${flag} after confirming the operation with the user.`,
  })
