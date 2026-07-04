import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'

import { defaultRootDescription, makeRoot } from '../src/index.js'
import type { CommandDescription, NextAction } from '../src/index.js'

// Direct tests for `makeRoot`, the shared three-way root-command health
// check every app CLI's root command runs: env-missing -> unconfigured,
// any other status failure -> configured but unreachable, success ->
// app-specific health fields.

interface TestStatusResult {
  readonly version: string
}

interface TestError {
  readonly code: string
}

const commandTree: ReadonlyArray<CommandDescription> = [{ command: 'test-cli', description: 'root' }]
const envNextAction: NextAction = { command: 'test-cli configure', description: 'Configure the CLI' }
const showCommandsAction: NextAction = { command: 'test-cli', description: 'Show available commands' }

it.effect('reports configured:false when status fails with the env-missing code', () =>
  Effect.gen(function* () {
    const status: Effect.Effect<TestStatusResult, TestError> = Effect.fail({ code: 'TEST_ENV_MISSING' })

    const envelope = yield* makeRoot({
      command: 'test-cli',
      commandTree,
      name: 'test-cli',
      description: 'Test CLI health',
      status,
      envMissingCode: 'TEST_ENV_MISSING',
      envNextAction,
      showCommandsAction,
      onReachable: (result) => ({ configured: true as const, reachable: true as const, version: result.version }),
    })

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'test-cli',
      result: {
        name: 'test-cli',
        description: 'Test CLI health',
        commands: commandTree,
        health: { configured: false },
      },
      next_actions: [envNextAction],
    })
  })
)

it.effect('reports configured/unreachable when status fails with a different code', () =>
  Effect.gen(function* () {
    const status: Effect.Effect<TestStatusResult, TestError> = Effect.fail({ code: 'TEST_HTTP_ERROR' })

    const envelope = yield* makeRoot({
      command: 'test-cli',
      commandTree,
      name: 'test-cli',
      description: 'Test CLI health',
      status,
      envMissingCode: 'TEST_ENV_MISSING',
      envNextAction,
      showCommandsAction,
      onReachable: (result) => ({ configured: true as const, reachable: true as const, version: result.version }),
    })

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'test-cli',
      result: {
        name: 'test-cli',
        description: 'Test CLI health',
        commands: commandTree,
        health: { configured: true, reachable: false, errorCode: 'TEST_HTTP_ERROR' },
      },
      next_actions: [showCommandsAction],
    })
  })
)

it.effect('reports the app-specific reachable health shape on success', () =>
  Effect.gen(function* () {
    const status: Effect.Effect<TestStatusResult, TestError> = Effect.succeed({ version: '1.2.3' })

    const envelope = yield* makeRoot({
      command: 'test-cli',
      commandTree,
      name: 'test-cli',
      description: 'Test CLI health',
      status,
      envMissingCode: 'TEST_ENV_MISSING',
      envNextAction,
      showCommandsAction,
      onReachable: (result) => ({ configured: true as const, reachable: true as const, version: result.version }),
    })

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'test-cli',
      result: {
        name: 'test-cli',
        description: 'Test CLI health',
        commands: commandTree,
        health: { configured: true, reachable: true, version: '1.2.3' },
      },
      next_actions: [],
    })
  })
)

it('defaultRootDescription builds the standard root command description', () => {
  assert.deepStrictEqual(defaultRootDescription('test-cli'), {
    command: 'test-cli',
    description: 'Show this command tree and configuration health',
  })
})
