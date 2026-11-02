import * as Schema from 'effect/Schema'

// Shared field shapes for the four error kinds every service package defines
// (EnvMissing, Unreachable, HttpError, DecodeError). Each package still
// declares its own `class FooBarError extends Schema.TaggedError<FooBarError>()(...)`
// so the `_tag` stays a distinct literal per package - tsgo cannot print a
// declaration for a TaggedError instance returned from a shared generic
// factory (it fails with TS4023 trying to name Effect's internal
// NodeInspectSymbol), so only the schema fields and constructor bodies are
// centralized here, not the classes themselves.

// Type aliases rather than interfaces: a Schema field record needs the implicit
// index signature that only type aliases receive.
type BaseFields<Code extends string> = Readonly<{
  code: Schema.Literal<Code>
  message: Schema.String
  fix: Schema.String
}>

type CauseFields<Code extends string> = BaseFields<Code> & Readonly<{ cause: Schema.optional<Schema.Defect> }>

type HttpErrorFields<Code extends string> = BaseFields<Code> & Readonly<{ status: Schema.Int }>

export const envMissingFields = <const Code extends string>(code: Code): BaseFields<Code> => ({
  code: Schema.Literal(code),
  message: Schema.String,
  fix: Schema.String,
})

export const unreachableFields = <const Code extends string>(code: Code): CauseFields<Code> => ({
  code: Schema.Literal(code),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect()),
})

export const httpErrorFields = <const Code extends string>(code: Code): HttpErrorFields<Code> => ({
  code: Schema.Literal(code),
  message: Schema.String,
  fix: Schema.String,
  status: Schema.Int,
})

export const decodeErrorFields = <const Code extends string>(code: Code): CauseFields<Code> => ({
  code: Schema.Literal(code),
  message: Schema.String,
  fix: Schema.String,
  cause: Schema.optional(Schema.Defect()),
})

export interface ErrorFailure {
  readonly message: string
  readonly cause?: unknown
}

interface ErrorFactoryOptions<Ctor, Code extends string> {
  readonly error: Ctor
  readonly code: Code
  readonly fix: string
}

export const makeEnvMissing =
  <const Code extends string, E extends { readonly code: Code }>({
    error: Ctor,
    code,
    fix,
  }: ErrorFactoryOptions<new (props: { code: Code; message: string; fix: string }) => E, Code>): ((
    variable: string
  ) => E) =>
  (variable) =>
    new Ctor({ code, message: `${variable} is not set`, fix })

export const makeUnreachable =
  <const Code extends string, E extends { readonly code: Code }>({
    error: Ctor,
    code,
    fix,
  }: ErrorFactoryOptions<new (props: { code: Code; message: string; fix: string; cause?: unknown }) => E, Code>): ((
    failure: ErrorFailure
  ) => E) =>
  ({ message, cause }) =>
    cause === undefined ? new Ctor({ code, message, fix }) : new Ctor({ code, message, fix, cause })

export const makeHttpError =
  <const Code extends string, E extends { readonly code: Code }>({
    error: Ctor,
    code,
    displayName,
    fix,
  }: ErrorFactoryOptions<new (props: { code: Code; message: string; fix: string; status: number }) => E, Code> & {
    readonly displayName: string
  }): ((status: number) => E) =>
  (status) =>
    new Ctor({ code, message: `${displayName} returned HTTP ${status}`, fix, status })

export const makeDecodeError =
  <const Code extends string, E extends { readonly code: Code }>({
    error: Ctor,
    code,
    fix,
  }: ErrorFactoryOptions<new (props: { code: Code; message: string; fix: string; cause?: unknown }) => E, Code>): ((
    failure: ErrorFailure
  ) => E) =>
  ({ message, cause }) =>
    cause === undefined ? new Ctor({ code, message, fix }) : new Ctor({ code, message, fix, cause })
