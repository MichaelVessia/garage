import * as BunHttpClient from '@effect/platform-bun/BunHttpClient'
import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunStdio from '@effect/platform-bun/BunStdio'
import * as Arr from 'effect/Array'
import * as Config from 'effect/Config'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Stdio from 'effect/Stdio'
import type { HttpClient } from 'effect/unstable/http'
import { OtlpLogger, OtlpSerialization, OtlpTracer } from 'effect/unstable/observability'

import { CliUsageError } from './errors'

export { makeConfigReaders } from './config'

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

export { CliUsageError }

export interface CliObservabilityOptions {
  readonly serviceName: string
  readonly serviceVersion: string
  readonly environment: string
  // oxlint-disable-next-line effect/prefer-option-over-null -- public option bag constructed by out-of-scope app CLIs that pass plain string env vars
  readonly tracesUrl?: string | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- public option bag constructed by out-of-scope app CLIs that pass plain string env vars
  readonly logsUrl?: string | undefined
}

export type CliObservabilityConfigOptions = Omit<CliObservabilityOptions, 'tracesUrl' | 'logsUrl'>

type OtlpRequirements = HttpClient.HttpClient | OtlpSerialization.OtlpSerialization

const optionalUrl = (value: Option.Option<string>): Option.Option<string> =>
  // oxlint-disable-next-line effect/no-length-comparison -- string emptiness check, not an array
  Option.filter(value, (url) => url.trim().length > 0)

const emptyObservabilityLayer: Layer.Layer<never, never, OtlpRequirements> = Layer.empty

const optionalConfigString = (name: string): Effect.Effect<Option.Option<string>, Config.ConfigError> =>
  Config.option(Config.string(name))

export const cliObservabilityLayer = (
  options: CliObservabilityOptions
): Layer.Layer<never, never, HttpClient.HttpClient> => {
  const resource = {
    serviceName: options.serviceName,
    serviceVersion: options.serviceVersion,
    attributes: { 'deployment.environment': options.environment },
  }
  const tracingLayer = Option.match(optionalUrl(Option.fromNullishOr(options.tracesUrl)), {
    onNone: () => emptyObservabilityLayer,
    onSome: (url) => OtlpTracer.layer({ url, resource }),
  })
  const loggingLayer = Option.match(optionalUrl(Option.fromNullishOr(options.logsUrl)), {
    onNone: () => emptyObservabilityLayer,
    onSome: (url) => OtlpLogger.layer({ url, resource }),
  })

  return Layer.mergeAll(tracingLayer, loggingLayer).pipe(Layer.provide(OtlpSerialization.layerJson))
}

export const cliObservabilityLayerFromConfig = (
  options: CliObservabilityConfigOptions
): Layer.Layer<never, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const tracesUrl = yield* optionalConfigString('GARAGE_OTLP_TRACES_URL')
      const logsUrl = yield* optionalConfigString('GARAGE_OTLP_LOGS_URL')
      return cliObservabilityLayer({
        ...options,
        tracesUrl: Option.getOrUndefined(tracesUrl),
        logsUrl: Option.getOrUndefined(logsUrl),
      })
    })
  )

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

export const FlagDescription = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  default: Schema.optional(Schema.Unknown),
})
export type FlagDescription = typeof FlagDescription.Type

export const CommandDescription = Schema.Struct({
  command: Schema.String,
  description: Schema.String,
  flags: FlagDescription.pipe(Schema.Array, Schema.optional),
})
export type CommandDescription = typeof CommandDescription.Type

export interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
  readonly booleans: ReadonlySet<string>
}

export interface ParseFlagsOptions {
  readonly valueFlags?: ReadonlyArray<string>
  readonly booleanFlags?: ReadonlyArray<string>
}

export interface CommandInvocation<CliResult, Error extends CliEnvelopeError, Context> {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly usageError: (message: string) => Error
  readonly errorToEnvelope: (error: Error, nextActions?: ReadonlyArray<NextAction>) => ErrorEnvelope
  readonly wrap: <Result extends CliResult>(
    program: Effect.Effect<Result, Error, Context>,
    nextActions?: (result: Result) => Effect.Effect<ReadonlyArray<NextAction>, Error, Context>
  ) => Effect.Effect<CliEnvelope<CliResult>, never, Context>
  readonly recover: (
    program: Effect.Effect<CliEnvelope<CliResult>, Error, Context>
  ) => Effect.Effect<CliEnvelope<CliResult>, never, Context>
  // oxlint-disable-next-line effect/prefer-option-over-null -- public helper called by out-of-scope app CLIs with raw `args[i]` positionals typed `string | undefined`
  readonly parsePositiveInteger: (value: string | undefined, label: string) => Effect.Effect<number, Error>
  readonly parseFlags: (tokens: ReadonlyArray<string>, options?: ParseFlagsOptions) => Effect.Effect<ParsedFlags, Error>
  readonly limitFromArgs: (
    tokens: ReadonlyArray<string>,
    flagName: string,
    defaultValue: number
  ) => Effect.Effect<number, Error>
}

export interface CommandDefinition<CliResult, Error extends CliEnvelopeError, Context> extends CommandDescription {
  readonly name: string
  readonly hidden?: boolean
  readonly handle: (
    invocation: CommandInvocation<CliResult, Error, Context>
  ) => Effect.Effect<CliEnvelope<CliResult>, never, Context>
}

export interface RootInvocation<Error extends CliEnvelopeError> {
  readonly command: string
  readonly commandTree: ReadonlyArray<CommandDescription>
  readonly errorToEnvelope: (error: Error, nextActions?: ReadonlyArray<NextAction>) => ErrorEnvelope
}

export interface CreateCliRunnerOptions<CliResult, Error extends CliEnvelopeError, Context> {
  readonly rootCommand: string
  readonly rootDescription: CommandDescription
  readonly commands: ReadonlyArray<CommandDefinition<CliResult, Error, Context>>
  readonly usageError: (message: string) => Error
  readonly fallbackNextActions: (error: Error) => ReadonlyArray<NextAction>
  readonly root: (invocation: RootInvocation<Error>) => Effect.Effect<CliEnvelope<CliResult>, never, Context>
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

export const commandString = (rootCommand: string, args: ReadonlyArray<string>): string =>
  Arr.isReadonlyArrayEmpty(args) ? rootCommand : `${rootCommand} ${args.join(' ')}`

const commandDescription = <CliResult, Error extends CliEnvelopeError, Context>(
  definition: CommandDefinition<CliResult, Error, Context>
): CommandDescription => ({
  command: definition.command,
  description: definition.description,
  ...(definition.flags === undefined ? {} : { flags: definition.flags }),
})

export const commandDescriptions = <CliResult, Error extends CliEnvelopeError, Context>(
  rootDescription: CommandDescription,
  commands: ReadonlyArray<CommandDefinition<CliResult, Error, Context>>
): ReadonlyArray<CommandDescription> => [
  rootDescription,
  ...commands.flatMap((command) => (command.hidden === true ? [] : [commandDescription(command)])),
]

export const createCliUsageError = (rootCommand: string): ((message: string) => CliUsageError) => {
  const codePrefix = rootCommand.replaceAll('-', '_').toUpperCase()
  const fix = `Run ${rootCommand} to inspect available commands and required arguments.`

  return (message: string) => new CliUsageError({ code: `${codePrefix}_CLI_USAGE`, message, fix })
}

export const createCliRunner = <CliResult, Error extends CliEnvelopeError, Context>(
  options: CreateCliRunnerOptions<CliResult, Error, Context>
): ((args: ReadonlyArray<string>) => Effect.Effect<CliEnvelope<CliResult>, never, Context>) => {
  const commandTree = commandDescriptions(options.rootDescription, options.commands)
  const toEnvelope = (command: string, error: Error, nextActions?: ReadonlyArray<NextAction>): ErrorEnvelope =>
    errorEnvelope({
      command,
      error: { code: error.code, message: error.message },
      fix: error.fix,
      nextActions: nextActions ?? options.fallbackNextActions(error),
    })

  const makeInvocation = (
    command: string,
    args: ReadonlyArray<string>
  ): CommandInvocation<CliResult, Error, Context> => {
    const errorToEnvelope = (error: Error, nextActions?: ReadonlyArray<NextAction>): ErrorEnvelope =>
      toEnvelope(command, error, nextActions)
    const wrap = <Result extends CliResult>(
      program: Effect.Effect<Result, Error, Context>,
      nextActions: (result: Result) => Effect.Effect<ReadonlyArray<NextAction>, Error, Context> = () =>
        Effect.succeed([])
    ): Effect.Effect<CliEnvelope<CliResult>, never, Context> =>
      program.pipe(
        Effect.flatMap((result) =>
          nextActions(result).pipe(Effect.map((actions) => successEnvelope({ command, result, nextActions: actions })))
        ),
        Effect.match({ onFailure: (error) => errorToEnvelope(error), onSuccess: (envelope) => envelope })
      )
    const recover = (
      program: Effect.Effect<CliEnvelope<CliResult>, Error, Context>
    ): Effect.Effect<CliEnvelope<CliResult>, never, Context> =>
      program.pipe(Effect.match({ onFailure: (error) => errorToEnvelope(error), onSuccess: (envelope) => envelope }))
    // oxlint-disable-next-line effect/prefer-option-over-null -- implements the public `CommandInvocation` signature called with raw `string | undefined` positionals
    const parsePositiveInteger = (value: string | undefined, label: string): Effect.Effect<number, Error> => {
      if (value === undefined) {
        return Effect.fail(options.usageError(`${label} is required`))
      }

      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed > 0
        ? Effect.succeed(parsed)
        : Effect.fail(options.usageError(`${label} must be a positive integer`))
    }
    const parseFlags = (
      tokens: ReadonlyArray<string>,
      parseOptions: ParseFlagsOptions = {}
    ): Effect.Effect<ParsedFlags, Error> => {
      const positionals: Array<string> = []
      // oxlint-disable-next-line effect/avoid-native-object-helpers -- `ParsedFlags.values` is a public `ReadonlyMap` consumed by out-of-scope app CLIs via `.get`
      const values = new Map<string, string>()
      // oxlint-disable-next-line effect/avoid-native-object-helpers -- `ParsedFlags.booleans` is a public `ReadonlySet` consumed by out-of-scope app CLIs via `.has`
      const booleans = new Set<string>()
      const valueFlags = parseOptions.valueFlags ?? []
      const booleanFlags = parseOptions.booleanFlags ?? []
      let index = 0

      // oxlint-disable-next-line effect/imperative-loops -- variable-stride token scanner (value flags consume two tokens) with early validation failure; not expressible as Arr.map/reduce
      while (index < tokens.length) {
        const token = tokens[index]
        if (token === undefined) {
          index += 1
          continue
        }

        if (valueFlags.includes(token)) {
          const value = tokens[index + 1]
          if (value === undefined || value.startsWith('--')) {
            return Effect.fail(options.usageError(`${token} requires a value`))
          }
          values.set(token, value)
          index += 2
          continue
        }

        if (booleanFlags.includes(token)) {
          booleans.add(token)
          index += 1
          continue
        }

        if (token.startsWith('--')) {
          return Effect.fail(options.usageError(`Unknown flag ${token}`))
        }

        positionals.push(token)
        index += 1
      }

      return Effect.succeed({ positionals, values, booleans })
    }
    const limitFromArgs = (
      tokens: ReadonlyArray<string>,
      flagName: string,
      defaultValue: number
    ): Effect.Effect<number, Error> =>
      parseFlags(tokens, { valueFlags: [flagName] }).pipe(
        Effect.flatMap((parsed) => {
          const value = parsed.values.get(flagName)
          return value === undefined ? Effect.succeed(defaultValue) : parsePositiveInteger(value, flagName)
        })
      )

    return {
      command,
      args,
      usageError: options.usageError,
      errorToEnvelope,
      wrap,
      recover,
      parsePositiveInteger,
      parseFlags,
      limitFromArgs,
    }
  }

  return (args: ReadonlyArray<string>): Effect.Effect<CliEnvelope<CliResult>, never, Context> => {
    const command = commandString(options.rootCommand, args)
    const [name] = args
    const rest = args.slice(1)

    if (name === undefined) {
      return options.root({
        command,
        commandTree,
        errorToEnvelope: (error, nextActions) => toEnvelope(command, error, nextActions),
      })
    }

    const definition = options.commands.find((candidate) => candidate.name === name)
    if (definition === undefined) {
      return makeInvocation(command, rest).wrap(Effect.fail(options.usageError(`Unknown command ${name}`)))
    }

    return definition.handle(makeInvocation(command, rest))
  }
}

export interface RunCliMainOptions<CliResult, Context, LiveError> {
  readonly serviceName: string
  readonly serviceVersion: string
  readonly live: Layer.Layer<Context, LiveError>
  readonly execute: (args: ReadonlyArray<string>) => Effect.Effect<CliEnvelope<CliResult>, never, Context>
}

export const runCliMain = <CliResult, Context, LiveError>(
  options: RunCliMainOptions<CliResult, Context, LiveError>
): void => {
  const ObservabilityLive = cliObservabilityLayerFromConfig({
    serviceName: options.serviceName,
    serviceVersion: options.serviceVersion,
    environment: 'local',
  }).pipe(Layer.provide(BunHttpClient.layer))

  const MainLive = Layer.mergeAll(options.live.pipe(Layer.provideMerge(ObservabilityLive)), BunStdio.layer)

  const program = Effect.gen(function* () {
    const context = yield* Layer.build(MainLive)
    const args = yield* Stdio.Stdio.use((stdio) => stdio.args).pipe(Effect.provideContext(context))
    const envelope = yield* options.execute(args).pipe(Effect.provideContext(context))
    yield* Console.log(renderEnvelope(envelope))
  }).pipe(Effect.scoped)

  BunRuntime.runMain(program)
}
