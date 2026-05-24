import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports TUBEARCHIVIST_URL, TUBEARCHIVIST_USERNAME, and TUBEARCHIVIST_PASSWORD from modules/programs/shell.nix.'

export type TubearchivistErrorCode =
  | 'TUBEARCHIVIST_ENV_MISSING'
  | 'TUBEARCHIVIST_UNREACHABLE'
  | 'TUBEARCHIVIST_HTTP_ERROR'
  | 'TUBEARCHIVIST_DECODE_ERROR'
  | 'TUBEARCHIVIST_CONFIRMATION_REQUIRED'

export class TubearchivistError extends Schema.TaggedErrorClass<TubearchivistError>()('TubearchivistError', {
  code: Schema.Literals([
    'TUBEARCHIVIST_ENV_MISSING',
    'TUBEARCHIVIST_UNREACHABLE',
    'TUBEARCHIVIST_HTTP_ERROR',
    'TUBEARCHIVIST_DECODE_ERROR',
    'TUBEARCHIVIST_CONFIRMATION_REQUIRED',
  ]),
  message: Schema.String,
  fix: Schema.String,
  status: Schema.optional(Schema.Number),
}) {}

export const envMissing = (variable: string): TubearchivistError =>
  new TubearchivistError({ code: 'TUBEARCHIVIST_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string): TubearchivistError =>
  new TubearchivistError({
    code: 'TUBEARCHIVIST_UNREACHABLE',
    message,
    fix: 'Verify TubeArchivist is reachable from this host and TUBEARCHIVIST_URL points to the base URL.',
  })

export const httpError = (status: number): TubearchivistError =>
  new TubearchivistError({
    code: 'TUBEARCHIVIST_HTTP_ERROR',
    message: `TubeArchivist returned HTTP ${status}`,
    fix: 'Check the TubeArchivist credentials, request parameters, and server logs.',
    status,
  })

export const decodeError = (message: string): TubearchivistError =>
  new TubearchivistError({
    code: 'TUBEARCHIVIST_DECODE_ERROR',
    message,
    fix: 'Update the TubeArchivist schemas to match the API response shape.',
  })

export const confirmationRequired = (flag: string): TubearchivistError =>
  new TubearchivistError({
    code: 'TUBEARCHIVIST_CONFIRMATION_REQUIRED',
    message: `${flag} is required`,
    fix: `Re-run the command with ${flag} after confirming the operation with the user.`,
  })
