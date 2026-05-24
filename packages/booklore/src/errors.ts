import { Schema } from 'effect'

export const envFix =
  'Open a fresh shell so sops-nix exports BOOKLORE_URL, BOOKLORE_USERNAME, and BOOKLORE_PASSWORD from modules/programs/shell.nix.'

export type BookloreErrorCode =
  | 'BOOKLORE_ENV_MISSING'
  | 'BOOKLORE_UNREACHABLE'
  | 'BOOKLORE_HTTP_ERROR'
  | 'BOOKLORE_DECODE_ERROR'

export class BookloreError extends Schema.TaggedErrorClass<BookloreError>()('BookloreError', {
  code: Schema.Literals([
    'BOOKLORE_ENV_MISSING',
    'BOOKLORE_UNREACHABLE',
    'BOOKLORE_HTTP_ERROR',
    'BOOKLORE_DECODE_ERROR',
  ]),
  message: Schema.String,
  fix: Schema.String,
}) {}

export const envMissing = (variable: string): BookloreError =>
  new BookloreError({ code: 'BOOKLORE_ENV_MISSING', message: `${variable} is not set`, fix: envFix })

export const unreachable = (message: string): BookloreError =>
  new BookloreError({
    code: 'BOOKLORE_UNREACHABLE',
    message,
    fix: 'Verify BookLore is reachable from this host and BOOKLORE_URL points to the BookLore base URL.',
  })

export const httpError = (status: number): BookloreError =>
  new BookloreError({
    code: 'BOOKLORE_HTTP_ERROR',
    message: `BookLore returned HTTP ${status}`,
    fix: 'Check the BookLore credentials, request parameters, and server logs.',
  })

export const decodeError = (message: string): BookloreError =>
  new BookloreError({
    code: 'BOOKLORE_DECODE_ERROR',
    message,
    fix: 'Update the BookLore schemas to match the API response shape.',
  })
