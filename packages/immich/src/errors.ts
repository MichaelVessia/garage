import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports IMMICH_URL and IMMICH_API_KEY from modules/programs/shell.nix.'

export type ImmichErrorCode = 'IMMICH_ENV_MISSING' | 'IMMICH_UNREACHABLE' | 'IMMICH_HTTP_ERROR' | 'IMMICH_DECODE_ERROR'

export class ImmichError extends Schema.TaggedErrorClass<ImmichError>()('ImmichError', {
  code: Schema.Literals(['IMMICH_ENV_MISSING', 'IMMICH_UNREACHABLE', 'IMMICH_HTTP_ERROR', 'IMMICH_DECODE_ERROR']),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): ImmichError =>
  new ImmichError({ code: 'IMMICH_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string): ImmichError =>
  new ImmichError({
    code: 'IMMICH_UNREACHABLE',
    message,
    fix: 'Verify Immich is reachable from this host and IMMICH_URL points to the Immich base URL.',
  })

export const httpError = (status: number): ImmichError =>
  new ImmichError({
    code: 'IMMICH_HTTP_ERROR',
    message: `Immich returned HTTP ${status}`,
    fix: 'Check the Immich API key, request parameters, and Immich server logs.',
  })

export const decodeError = (message: string): ImmichError =>
  new ImmichError({
    code: 'IMMICH_DECODE_ERROR',
    message,
    fix: 'Update the Immich schemas to match the API response shape.',
  })
