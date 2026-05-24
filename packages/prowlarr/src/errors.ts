import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports PROWLARR_URL and PROWLARR_API_KEY from modules/programs/shell.nix.'

export type ProwlarrErrorCode =
  | 'PROWLARR_ENV_MISSING'
  | 'PROWLARR_UNREACHABLE'
  | 'PROWLARR_HTTP_ERROR'
  | 'PROWLARR_DECODE_ERROR'
  | 'PROWLARR_CLI_USAGE'
  | 'PROWLARR_SYNC_CONFIRMATION_REQUIRED'

export class ProwlarrError extends Schema.TaggedErrorClass<ProwlarrError>()('ProwlarrError', {
  code: Schema.Literals([
    'PROWLARR_ENV_MISSING',
    'PROWLARR_UNREACHABLE',
    'PROWLARR_HTTP_ERROR',
    'PROWLARR_DECODE_ERROR',
    'PROWLARR_CLI_USAGE',
    'PROWLARR_SYNC_CONFIRMATION_REQUIRED',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): ProwlarrError =>
  new ProwlarrError({
    code: 'PROWLARR_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string): ProwlarrError =>
  new ProwlarrError({
    code: 'PROWLARR_UNREACHABLE',
    message,
    fix: 'Verify Prowlarr is reachable from this host and PROWLARR_URL points to the Prowlarr base URL.',
  })

export const httpError = (status: number): ProwlarrError =>
  new ProwlarrError({
    code: 'PROWLARR_HTTP_ERROR',
    message: `Prowlarr returned HTTP ${status}`,
    fix: 'Check the Prowlarr API key, request parameters, and Prowlarr server logs.',
  })

export const decodeError = (message: string): ProwlarrError =>
  new ProwlarrError({
    code: 'PROWLARR_DECODE_ERROR',
    message,
    fix: 'Update the Prowlarr schemas to match the API response shape.',
  })

export const cliUsageError = (message: string): ProwlarrError =>
  new ProwlarrError({
    code: 'PROWLARR_CLI_USAGE',
    message,
    fix: 'Run prowlarr to inspect available commands and required arguments.',
  })

export const syncConfirmationRequired = (): ProwlarrError =>
  new ProwlarrError({
    code: 'PROWLARR_SYNC_CONFIRMATION_REQUIRED',
    message: 'Syncing indexers to connected applications requires --confirm-sync',
    fix: 'Re-run with --confirm-sync only if you intend to push Prowlarr indexer config to all connected apps.',
  })
