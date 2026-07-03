import { assert, it } from '@effect/vitest'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'

import {
  cliObservabilityLayer,
  cliObservabilityLayerFromConfig,
  createCliRunner,
  createCliUsageError,
  errorEnvelope,
  successEnvelope,
} from '../src/index.js'
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
const NoopHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))))
)

const testCommands: ReadonlyArray<CommandDefinition<TestResult, CliUsageError, never>> = [
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

it('builds stable success envelopes with next actions', () => {
  const envelope = successEnvelope({
    command: 'sonarr search Linux ISO',
    result: {
      query: 'Linux ISO',
      count: 1,
      results: [
        {
          title: 'Linux ISO Weekly',
          year: 2022,
          tvdbId: 371_980,
          tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
        },
      ],
    },
    nextActions: [
      {
        command: 'sonarr exists <tvdb-id>',
        description: 'Check whether a selected series is already in the library',
        params: {
          'tvdb-id': { value: 371_980, description: 'TVDB series ID' },
        },
      },
    ],
  })

  assert.deepStrictEqual(envelope, {
    ok: true,
    command: 'sonarr search Linux ISO',
    result: {
      query: 'Linux ISO',
      count: 1,
      results: [
        {
          title: 'Linux ISO Weekly',
          year: 2022,
          tvdbId: 371_980,
          tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
        },
      ],
    },
    next_actions: [
      {
        command: 'sonarr exists <tvdb-id>',
        description: 'Check whether a selected series is already in the library',
        params: {
          'tvdb-id': { value: 371_980, description: 'TVDB series ID' },
        },
      },
    ],
  })
})

it('builds stable error envelopes with fixes', () => {
  const envelope = errorEnvelope({
    command: 'sonarr status',
    error: {
      code: 'SONARR_ENV_MISSING',
      message: 'SONARR_URL is not set',
    },
    fix: 'Open a fresh shell so sops-nix exports SONARR_URL and SONARR_API_KEY from modules/programs/shell.nix.',
    nextActions: [{ command: 'sonarr', description: 'Show available commands' }],
  })

  assert.deepStrictEqual(envelope, {
    ok: false,
    command: 'sonarr status',
    error: {
      code: 'SONARR_ENV_MISSING',
      message: 'SONARR_URL is not set',
    },
    fix: 'Open a fresh shell so sops-nix exports SONARR_URL and SONARR_API_KEY from modules/programs/shell.nix.',
    next_actions: [{ command: 'sonarr', description: 'Show available commands' }],
  })
})

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

it.effect('builds a disabled CLI observability layer without requiring OTLP URLs', () =>
  Effect.void.pipe(
    Effect.provide(
      cliObservabilityLayer({
        serviceName: '@garage/test-cli',
        serviceVersion: '0.0.0',
        environment: 'test',
      }).pipe(Layer.provide(NoopHttpClient))
    )
  )
)

it.effect('builds CLI observability from Effect Config', () =>
  Effect.void.pipe(
    Effect.provide(
      cliObservabilityLayerFromConfig({
        serviceName: '@garage/test-cli',
        serviceVersion: '0.0.0',
        environment: 'test',
      }).pipe(
        Layer.provide(NoopHttpClient),
        Layer.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                GARAGE_OTLP_TRACES_URL: 'http://collector.example.test/v1/traces',
                GARAGE_OTLP_LOGS_URL: 'http://collector.example.test/v1/logs',
              },
            })
          )
        )
      )
    )
  )
)
