import * as Schema from 'effect/Schema'

export const NextActionParam = Schema.Struct({
  value: Schema.optional(Schema.Unknown),
  default: Schema.optional(Schema.Unknown),
  description: Schema.String,
})
export type NextActionParam = typeof NextActionParam.Type

export const NextAction = Schema.Struct({
  command: Schema.String,
  description: Schema.String,
  params: Schema.optional(Schema.Record(Schema.String, NextActionParam)),
})
export type NextAction = typeof NextAction.Type

export const SuccessEnvelope = <Result>(result: Schema.Codec<Result>) =>
  Schema.Struct({
    ok: Schema.Literal(true),
    command: Schema.String,
    result,
    next_actions: Schema.Array(NextAction),
  })
export type SuccessEnvelope<Result> = Schema.Schema.Type<ReturnType<typeof SuccessEnvelope<Result>>>

export const ErrorBody = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
})
export type ErrorBody = typeof ErrorBody.Type

export const ErrorEnvelope = Schema.Struct({
  ok: Schema.Literal(false),
  command: Schema.String,
  error: ErrorBody,
  fix: Schema.String,
  next_actions: Schema.Array(NextAction),
})
export type ErrorEnvelope = typeof ErrorEnvelope.Type

export const CliEnvelope = <Result>(result: Schema.Codec<Result>) =>
  Schema.Union([SuccessEnvelope(result), ErrorEnvelope])
export type CliEnvelope<Result> = Schema.Schema.Type<ReturnType<typeof CliEnvelope<Result>>>

export const CliEnvelopeError = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  fix: Schema.String,
})
export type CliEnvelopeError = typeof CliEnvelopeError.Type

export interface SuccessEnvelopeInput<Result> {
  readonly command: string
  readonly result: Result
  readonly nextActions?: ReadonlyArray<NextAction>
}

export interface ErrorEnvelopeInput {
  readonly command: string
  readonly error: ErrorBody
  readonly fix: string
  readonly nextActions?: ReadonlyArray<NextAction>
}

export const successEnvelope = <Result>(input: SuccessEnvelopeInput<Result>): SuccessEnvelope<Result> => ({
  ok: true,
  command: input.command,
  result: input.result,
  next_actions: input.nextActions ?? [],
})

export const errorEnvelope = (input: ErrorEnvelopeInput): ErrorEnvelope => ({
  ok: false,
  command: input.command,
  error: input.error,
  fix: input.fix,
  next_actions: input.nextActions ?? [],
})

const encodeEnvelopeJson = Schema.encodeSync(Schema.UnknownFromJsonString)

export const renderEnvelope = (envelope: CliEnvelope<unknown>): string => encodeEnvelopeJson(envelope)
