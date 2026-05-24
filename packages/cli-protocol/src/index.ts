export interface NextActionParam {
  readonly value?: unknown
  readonly default?: unknown
  readonly description: string
}

export interface NextAction {
  readonly command: string
  readonly description: string
  readonly params?: Readonly<Record<string, NextActionParam>>
}

export interface SuccessEnvelope<Result> {
  readonly ok: true
  readonly command: string
  readonly result: Result
  readonly next_actions: ReadonlyArray<NextAction>
}

export interface ErrorBody {
  readonly code: string
  readonly message: string
}

export interface ErrorEnvelope {
  readonly ok: false
  readonly command: string
  readonly error: ErrorBody
  readonly fix: string
  readonly next_actions: ReadonlyArray<NextAction>
}

export type CliEnvelope<Result> = SuccessEnvelope<Result> | ErrorEnvelope

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

export interface CommandDescription {
  readonly command: string
  readonly description: string
  readonly flags?: ReadonlyArray<FlagDescription>
}

export interface FlagDescription {
  readonly name: string
  readonly description: string
  readonly default?: unknown
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

export const renderEnvelope = (envelope: CliEnvelope<unknown>): string => {
  const rendered = JSON.stringify(envelope)
  return rendered ?? 'null'
}
