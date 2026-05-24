import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so AUTOCALIWEB_URL, AUTOCALIWEB_USERNAME, and AUTOCALIWEB_PASSWORD are exported.'

export type AutocaliwebErrorCode =
  | 'AUTOCALIWEB_ENV_MISSING'
  | 'AUTOCALIWEB_UNREACHABLE'
  | 'AUTOCALIWEB_HTTP_ERROR'
  | 'AUTOCALIWEB_DECODE_ERROR'
  | 'AUTOCALIWEB_CLI_USAGE'

export class AutocaliwebError extends Schema.TaggedErrorClass<AutocaliwebError>()('AutocaliwebError', {
  code: Schema.Literals([
    'AUTOCALIWEB_ENV_MISSING',
    'AUTOCALIWEB_UNREACHABLE',
    'AUTOCALIWEB_HTTP_ERROR',
    'AUTOCALIWEB_DECODE_ERROR',
    'AUTOCALIWEB_CLI_USAGE',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): AutocaliwebError =>
  new AutocaliwebError({ code: 'AUTOCALIWEB_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string): AutocaliwebError =>
  new AutocaliwebError({
    code: 'AUTOCALIWEB_UNREACHABLE',
    message,
    fix: 'Verify Autocaliweb is reachable from this host and AUTOCALIWEB_URL points to the base URL.',
  })

export const httpError = (status: number): AutocaliwebError =>
  new AutocaliwebError({
    code: 'AUTOCALIWEB_HTTP_ERROR',
    message: `Autocaliweb returned HTTP ${status}`,
    fix: 'Check the Autocaliweb URL, Basic auth credentials, request parameters, and server logs.',
  })

export const decodeError = (message: string): AutocaliwebError =>
  new AutocaliwebError({
    code: 'AUTOCALIWEB_DECODE_ERROR',
    message,
    fix: 'Update the Autocaliweb OPDS or JSON schemas to match the response shape.',
  })

export const cliUsageError = (message: string): AutocaliwebError =>
  new AutocaliwebError({
    code: 'AUTOCALIWEB_CLI_USAGE',
    message,
    fix: 'Run autocaliweb to inspect available commands and required arguments.',
  })
