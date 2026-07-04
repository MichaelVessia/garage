import * as Schema from 'effect/Schema'

export class CliUsageError extends Schema.TaggedErrorClass<CliUsageError>()('CliUsageError', {
  code: Schema.String,
  message: Schema.String,
  fix: Schema.String,
}) {}

// Shared field shapes for the four error kinds every service package defines
// (EnvMissing, Unreachable, HttpError, DecodeError). Each package still
// declares its own `class FooBarError extends Schema.TaggedErrorClass<FooBarError>()(...)`
// so the `_tag` stays a distinct literal per package - tsgo cannot print a
// declaration for a TaggedErrorClass instance returned from a shared generic
// factory (it fails with TS4023 trying to name Effect's internal
// NodeInspectSymbol), so only the schema fields and constructor bodies are
// centralized here, not the classes themselves.

export const envMissingFields = <const Code extends string>(code: Code) => ({
  code: Schema.Literal(code),
  message: Schema.String,
  fix: Schema.String,
})

export const unreachableFields = <const Code extends string>(code: Code) => ({
  code: Schema.Literal(code),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect()),
})

export const httpErrorFields = <const Code extends string>(code: Code) => ({
  code: Schema.Literal(code),
  message: Schema.String,
  fix: Schema.String,
  status: Schema.Number,
})

export const decodeErrorFields = <const Code extends string>(code: Code) => ({
  code: Schema.Literal(code),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect()),
})

export const makeEnvMissing =
  <const Code extends string, E extends { readonly code: Code }>(
    Ctor: new (props: { code: Code; message: string; fix: string }) => E,
    code: Code,
    fix: string
  ): ((variable: string) => E) =>
  (variable) =>
    new Ctor({ code, message: `${variable} is not set`, fix })

export const makeUnreachable =
  <const Code extends string, E extends { readonly code: Code }>(
    Ctor: new (props: { code: Code; message: string; fix: string; cause?: unknown }) => E,
    code: Code,
    fix: string
  ): ((message: string, cause?: unknown) => E) =>
  (message, cause) =>
    new Ctor({ code, message, fix, ...(cause === undefined ? {} : { cause }) })

export const makeHttpError =
  <const Code extends string, E extends { readonly code: Code }>(
    Ctor: new (props: { code: Code; message: string; fix: string; status: number }) => E,
    code: Code,
    displayName: string,
    fix: string
  ): ((status: number) => E) =>
  (status) =>
    new Ctor({ code, message: `${displayName} returned HTTP ${status}`, fix, status })

export const makeDecodeError =
  <const Code extends string, E extends { readonly code: Code }>(
    Ctor: new (props: { code: Code; message: string; fix: string; cause?: unknown }) => E,
    code: Code,
    fix: string
  ): ((message: string, cause?: unknown) => E) =>
  (message, cause) =>
    new Ctor({ code, message, fix, ...(cause === undefined ? {} : { cause }) })
