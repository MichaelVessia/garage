import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import { describe } from 'vitest'

import { compileReadCommand, createCliRunner, createCliUsageError, successEnvelope } from '../src/index.js'
import type { CliUsageError, CommandDefinition, CommandDescription } from '../src/index.js'

interface ParsedFlagsResult {
  readonly positionals: ReadonlyArray<string>
  readonly limit: string
}

interface RootResult {
  readonly command_tree: ReadonlyArray<CommandDescription>
}

type TestResult = ParsedFlagsResult | RootResult

const rootCommand = 'test-cli'
const usageError = createCliUsageError(rootCommand)
const readCommand = compileReadCommand<TestResult, CliUsageError, never>(rootCommand)
const testCommands: ReadonlyArray<CommandDefinition<TestResult, CliUsageError, never>> = [
  readCommand({
    name: 'status',
    description: 'Return status',
    effect: Effect.succeed({ positionals: [], limit: 'read' }),
  }),
  {
    name: 'parse',
    command: `${rootCommand} parse [--limit <value>] <tokens...>`,
    description: 'Parse flags for regression coverage',
    handle: ({ args, parseFlags, recover, wrap }) =>
      recover(
        Effect.gen(function* () {
          const parsed = yield* parseFlags(args, { valueFlags: ['--limit'] })
          return yield* wrap(
            Effect.succeed({
              positionals: parsed.positionals,
              limit: parsed.values.get('--limit') ?? 'unset',
            })
          )
        })
      ),
  },
]

const runTestCli = createCliRunner<TestResult, CliUsageError, never>({
  rootCommand,
  rootDescription: { command: rootCommand, description: 'Show available test commands' },
  commands: testCommands,
  usageError,
  fallbackNextActions: () => [],
  root: ({ command, commandTree }) =>
    Effect.succeed(successEnvelope<TestResult>({ command, result: { command_tree: commandTree } })),
})

describe('CLI commands', () => {
  it.effect('compiles read command metadata and preserves tolerated extra arguments', () =>
    Effect.gen(function* () {
      const envelope = yield* runTestCli(['status', 'ignored'])

      const [definition] = testCommands
      if (definition === undefined) {
        assert.fail('expected compiled read command')
      }
      assert.strictEqual(definition.name, 'status')
      assert.strictEqual(definition.command, 'test-cli status')
      assert.strictEqual(definition.description, 'Return status')
      assert.deepStrictEqual(envelope, {
        ok: true,
        command: 'test-cli status ignored',
        result: { positionals: [], limit: 'read' },
        next_actions: [],
      })
    })
  )

  it.effect('only treats double-dash tokens as flags', () =>
    Effect.gen(function* () {
      const envelope = yield* runTestCli(['parse', '--limit', '-1', '-draft'])

      assert.deepStrictEqual(envelope, {
        ok: true,
        command: 'test-cli parse --limit -1 -draft',
        result: {
          positionals: ['-draft'],
          limit: '-1',
        },
        next_actions: [],
      })
    })
  )
})
