import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports SABNZBD_URL and SABNZBD_API_KEY from modules/programs/shell.nix.'

export type SabnzbdErrorCode =
  | 'SABNZBD_ENV_MISSING'
  | 'SABNZBD_UNREACHABLE'
  | 'SABNZBD_HTTP_ERROR'
  | 'SABNZBD_DECODE_ERROR'
  | 'SABNZBD_DELETE_CONFIRMATION_REQUIRED'

export class SabnzbdError extends Schema.TaggedErrorClass<SabnzbdError>()('SabnzbdError', {
  code: Schema.Literals([
    'SABNZBD_ENV_MISSING',
    'SABNZBD_UNREACHABLE',
    'SABNZBD_HTTP_ERROR',
    'SABNZBD_DECODE_ERROR',
    'SABNZBD_DELETE_CONFIRMATION_REQUIRED',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): SabnzbdError =>
  new SabnzbdError({
    code: 'SABNZBD_ENV_MISSING',
    message: `${variable} is not set`,
    fix: envFix,
  })

export const unreachable = (message: string): SabnzbdError =>
  new SabnzbdError({
    code: 'SABNZBD_UNREACHABLE',
    message,
    fix: 'Verify SABnzbd is reachable from this host and SABNZBD_URL points to the SABnzbd base URL.',
  })

export const httpError = (status: number): SabnzbdError =>
  new SabnzbdError({
    code: 'SABNZBD_HTTP_ERROR',
    message: `SABnzbd returned HTTP ${status}`,
    fix: 'Check the SABnzbd API key, request parameters, and SABnzbd server logs.',
  })

export const decodeError = (message: string): SabnzbdError =>
  new SabnzbdError({
    code: 'SABNZBD_DECODE_ERROR',
    message,
    fix: 'Update the SABnzbd schemas to match the API response shape.',
  })

export const deleteConfirmationRequired = (): SabnzbdError =>
  new SabnzbdError({
    code: 'SABNZBD_DELETE_CONFIRMATION_REQUIRED',
    message: 'Deleting downloaded files requires --confirm-delete-files',
    fix: 'Re-run with --confirm-delete-files only if you intend to delete downloaded files from disk.',
  })
