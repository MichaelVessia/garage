import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports ADGUARD_URL, ADGUARD_USERNAME, and ADGUARD_PASSWORD from modules/programs/shell.nix.'

export type AdguardErrorCode =
  | 'ADGUARD_ENV_MISSING'
  | 'ADGUARD_UNREACHABLE'
  | 'ADGUARD_HTTP_ERROR'
  | 'ADGUARD_DECODE_ERROR'
  | 'ADGUARD_CLI_USAGE'
  | 'ADGUARD_CONFIRMATION_REQUIRED'

export class AdguardError extends Schema.TaggedErrorClass<AdguardError>()('AdguardError', {
  code: Schema.Literals([
    'ADGUARD_ENV_MISSING',
    'ADGUARD_UNREACHABLE',
    'ADGUARD_HTTP_ERROR',
    'ADGUARD_DECODE_ERROR',
    'ADGUARD_CLI_USAGE',
    'ADGUARD_CONFIRMATION_REQUIRED',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): AdguardError =>
  new AdguardError({ code: 'ADGUARD_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string): AdguardError =>
  new AdguardError({
    code: 'ADGUARD_UNREACHABLE',
    message,
    fix: 'Verify AdGuard Home is reachable from this host and ADGUARD_URL points to the AdGuard base URL.',
  })

export const httpError = (status: number): AdguardError =>
  new AdguardError({
    code: 'ADGUARD_HTTP_ERROR',
    message: `AdGuard Home returned HTTP ${status}`,
    fix: 'Check the AdGuard username, password, request parameters, and AdGuard server logs.',
  })

export const decodeError = (message: string): AdguardError =>
  new AdguardError({
    code: 'ADGUARD_DECODE_ERROR',
    message,
    fix: 'Update the AdGuard schemas to match the API response shape.',
  })

export const cliUsageError = (message: string): AdguardError =>
  new AdguardError({
    code: 'ADGUARD_CLI_USAGE',
    message,
    fix: 'Run adguard to inspect available commands and required arguments.',
  })

export const confirmationRequired = (): AdguardError =>
  new AdguardError({
    code: 'ADGUARD_CONFIRMATION_REQUIRED',
    message: 'Changing global DNS protection requires --confirm-toggle',
    fix: 'Re-run with --confirm-toggle only after user confirmation.',
  })
