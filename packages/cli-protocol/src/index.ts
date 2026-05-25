import { Effect, Schema } from 'effect'

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

export interface CliEnvelopeError {
  readonly code: string
  readonly message: string
  readonly fix: string
}

export class CliUsageError extends Schema.TaggedErrorClass<CliUsageError>()('CliUsageError', {
  code: Schema.String,
  message: Schema.String,
  fix: Schema.String,
}) {}

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

export const renderEnvelope = (envelope: CliEnvelope<unknown>): string => {
  const rendered = JSON.stringify(envelope)
  return rendered ?? 'null'
}

export const commandString = (rootCommand: string, args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

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
      const values = new Map<string, string>()
      const booleans = new Set<string>()
      const valueFlags = parseOptions.valueFlags ?? []
      const booleanFlags = parseOptions.booleanFlags ?? []
      let index = 0

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
