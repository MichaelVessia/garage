import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports TUBEARCHIVIST_URL, TUBEARCHIVIST_USERNAME, and TUBEARCHIVIST_PASSWORD from modules/programs/shell.nix.'

export class TubearchivistEnvMissingError extends Schema.TaggedErrorClass<TubearchivistEnvMissingError>()(
  'TubearchivistEnvMissingError',
  {
    code: Schema.Literal('TUBEARCHIVIST_ENV_MISSING'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class TubearchivistUnreachableError extends Schema.TaggedErrorClass<TubearchivistUnreachableError>()(
  'TubearchivistUnreachableError',
  {
    code: Schema.Literal('TUBEARCHIVIST_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class TubearchivistHttpError extends Schema.TaggedErrorClass<TubearchivistHttpError>()(
  'TubearchivistHttpError',
  {
    code: Schema.Literal('TUBEARCHIVIST_HTTP_ERROR'),
    message: Schema.String,
    fix: Schema.String,
    status: Schema.Number,
  }
) {}

export class TubearchivistDecodeError extends Schema.TaggedErrorClass<TubearchivistDecodeError>()(
  'TubearchivistDecodeError',
  {
    code: Schema.Literal('TUBEARCHIVIST_DECODE_ERROR'),
    message: Schema.String,
    fix: Schema.String,
  }
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

export const envMissing = (variable: string): TubearchivistEnvMissingError =>
  new TubearchivistEnvMissingError({
    code: 'TUBEARCHIVIST_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string): TubearchivistUnreachableError =>
  new TubearchivistUnreachableError({
    code: 'TUBEARCHIVIST_UNREACHABLE',
    message,
    fix: 'Verify TubeArchivist is reachable from this host and TUBEARCHIVIST_URL points to the base URL.',
  })

export const httpError = (status: number): TubearchivistHttpError =>
  new TubearchivistHttpError({
    code: 'TUBEARCHIVIST_HTTP_ERROR',
    message: `TubeArchivist returned HTTP ${status}`,
    fix: 'Check the TubeArchivist credentials, request parameters, and server logs.',
    status,
  })

export const decodeError = (message: string): TubearchivistDecodeError =>
  new TubearchivistDecodeError({
    code: 'TUBEARCHIVIST_DECODE_ERROR',
    message,
    fix: 'Update the TubeArchivist schemas to match the API response shape.',
  })

export const confirmationRequired = (flag: string): TubearchivistConfirmationRequiredError =>
  new TubearchivistConfirmationRequiredError({
    code: 'TUBEARCHIVIST_CONFIRMATION_REQUIRED',
    message: `${flag} is required`,
    fix: `Re-run the command with ${flag} after confirming the operation with the user.`,
  })
