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
  'Open a fresh shell so sops-nix exports PROWLARR_URL and PROWLARR_API_KEY from modules/programs/shell.nix.'

export class ProwlarrEnvMissingError extends Schema.TaggedErrorClass<ProwlarrEnvMissingError>()(
  'ProwlarrEnvMissingError',
  envMissingFields('PROWLARR_ENV_MISSING')
) {}

export class ProwlarrUnreachableError extends Schema.TaggedErrorClass<ProwlarrUnreachableError>()(
  'ProwlarrUnreachableError',
  unreachableFields('PROWLARR_UNREACHABLE')
) {}

export class ProwlarrHttpError extends Schema.TaggedErrorClass<ProwlarrHttpError>()(
  'ProwlarrHttpError',
  httpErrorFields('PROWLARR_HTTP_ERROR')
) {}

export class ProwlarrDecodeError extends Schema.TaggedErrorClass<ProwlarrDecodeError>()(
  'ProwlarrDecodeError',
  decodeErrorFields('PROWLARR_DECODE_ERROR')
) {}

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

export const envMissing = makeEnvMissing(ProwlarrEnvMissingError, 'PROWLARR_ENV_MISSING', envFix)

export const unreachable = makeUnreachable(
  ProwlarrUnreachableError,
  'PROWLARR_UNREACHABLE',
  'Verify Prowlarr is reachable from this host and PROWLARR_URL points to the Prowlarr base URL.'
)

export const httpError = makeHttpError(
  ProwlarrHttpError,
  'PROWLARR_HTTP_ERROR',
  'Prowlarr',
  'Check the Prowlarr API key, request parameters, and Prowlarr server logs.'
)

export const decodeError = makeDecodeError(
  ProwlarrDecodeError,
  'PROWLARR_DECODE_ERROR',
  'Update the Prowlarr schemas to match the API response shape.'
)

export const syncConfirmationRequired = (): ProwlarrSyncConfirmationRequiredError =>
  new ProwlarrSyncConfirmationRequiredError({
    code: 'PROWLARR_SYNC_CONFIRMATION_REQUIRED',
    message: 'Syncing indexers to connected applications requires --confirm-sync',
    fix: 'Re-run with --confirm-sync only if you intend to push Prowlarr indexer config to all connected apps.',
  })
