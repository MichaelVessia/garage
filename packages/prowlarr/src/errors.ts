import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports PROWLARR_URL and PROWLARR_API_KEY from modules/programs/shell.nix.'

export class ProwlarrEnvMissingError extends Schema.TaggedErrorClass<ProwlarrEnvMissingError>()(
  'ProwlarrEnvMissingError',
  {
    code: Schema.Literal('PROWLARR_ENV_MISSING'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export class ProwlarrUnreachableError extends Schema.TaggedErrorClass<ProwlarrUnreachableError>()(
  'ProwlarrUnreachableError',
  {
    code: Schema.Literal('PROWLARR_UNREACHABLE'),
    message: Schema.String,
    fix: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class ProwlarrHttpError extends Schema.TaggedErrorClass<ProwlarrHttpError>()('ProwlarrHttpError', {
  code: Schema.Literal('PROWLARR_HTTP_ERROR'),
  message: Schema.String,
  fix: Schema.String,
}) {}

export class ProwlarrDecodeError extends Schema.TaggedErrorClass<ProwlarrDecodeError>()('ProwlarrDecodeError', {
  code: Schema.Literal('PROWLARR_DECODE_ERROR'),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export class ProwlarrSyncConfirmationRequiredError extends Schema.TaggedErrorClass<ProwlarrSyncConfirmationRequiredError>()(
  'ProwlarrSyncConfirmationRequiredError',
  {
    code: Schema.Literal('PROWLARR_SYNC_CONFIRMATION_REQUIRED'),
    message: Schema.String,
    fix: Schema.String,
  }
) {}

export const ProwlarrError = Schema.Union([
  ProwlarrEnvMissingError,
  ProwlarrUnreachableError,
  ProwlarrHttpError,
  ProwlarrDecodeError,
  ProwlarrSyncConfirmationRequiredError,
])
export type ProwlarrError = typeof ProwlarrError.Type
export type ProwlarrErrorCode = ProwlarrError['code']

export const envMissing = (variable: string): ProwlarrEnvMissingError =>
  new ProwlarrEnvMissingError({
    code: 'PROWLARR_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string, cause?: unknown): ProwlarrUnreachableError =>
  new ProwlarrUnreachableError({
    code: 'PROWLARR_UNREACHABLE',
    message,
    fix: 'Verify Prowlarr is reachable from this host and PROWLARR_URL points to the Prowlarr base URL.',
    ...(cause === undefined ? {} : { cause }),
  })

export const httpError = (status: number): ProwlarrHttpError =>
  new ProwlarrHttpError({
    code: 'PROWLARR_HTTP_ERROR',
    message: `Prowlarr returned HTTP ${status}`,
    fix: 'Check the Prowlarr API key, request parameters, and Prowlarr server logs.',
  })

export const decodeError = (message: string, cause?: unknown): ProwlarrDecodeError =>
  new ProwlarrDecodeError({
    code: 'PROWLARR_DECODE_ERROR',
    message,
    fix: 'Update the Prowlarr schemas to match the API response shape.',
    ...(cause === undefined ? {} : { cause }),
  })

export const syncConfirmationRequired = (): ProwlarrSyncConfirmationRequiredError =>
  new ProwlarrSyncConfirmationRequiredError({
    code: 'PROWLARR_SYNC_CONFIRMATION_REQUIRED',
    message: 'Syncing indexers to connected applications requires --confirm-sync',
    fix: 'Re-run with --confirm-sync only if you intend to push Prowlarr indexer config to all connected apps.',
  })
