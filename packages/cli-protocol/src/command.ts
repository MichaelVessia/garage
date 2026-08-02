import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { errorEnvelope, successEnvelope } from './envelope'
import type { CliEnvelope, CliEnvelopeError, ErrorEnvelope, NextAction } from './envelope'
import { CliUsageError } from './errors'

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
  readonly rootDescription?: CommandDescription
  readonly commands: ReadonlyArray<CommandDefinition<CliResult, Error, Context>>
  readonly usageError: (message: string) => Error
  readonly fallbackNextActions: (error: Error) => ReadonlyArray<NextAction>
  readonly root: (invocation: RootInvocation<Error>) => Effect.Effect<CliEnvelope<CliResult>, never, Context>
}

export const defaultRootDescription = (rootCommand: string): CommandDescription => ({
  command: rootCommand,
  description: 'Show this command tree and configuration health',
})

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
  const commandTree = commandDescriptions(
    options.rootDescription ?? defaultRootDescription(options.rootCommand),
    options.commands
  )
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
