import * as BunHttpClient from '@effect/platform-bun/BunHttpClient'
import * as BunServices from '@effect/platform-bun/BunServices'
import { assert, it } from '@effect/vitest'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as P from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as Str from 'effect/String'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'

import { executeAdguard } from '../apps/adguard-cli/src/index.js'
import { executeAutocaliweb } from '../apps/autocaliweb-cli/src/index.js'
import { executeCaddy } from '../apps/caddy-cli/src/index.js'
import { executeImmich } from '../apps/immich-cli/src/index.js'
import { executeJellyfin } from '../apps/jellyfin-cli/src/index.js'
import { executeJellyseerr } from '../apps/jellyseerr-cli/src/index.js'
import { executeProwlarr } from '../apps/prowlarr-cli/src/index.js'
import { executeRadarr } from '../apps/radarr-cli/src/index.js'
import { executeSabnzbd } from '../apps/sabnzbd-cli/src/index.js'
import { executeSonarr } from '../apps/sonarr-cli/src/index.js'
import { executeTubearchivist } from '../apps/tubearchivist-cli/src/index.js'
import { AdguardApiLive, AdguardConfigLive } from '../packages/adguard/src/index.js'
import { AutocaliwebApiLive, AutocaliwebConfigLive } from '../packages/autocaliweb/src/index.js'
import { CaddyApiLive, CaddyConfigLive } from '../packages/caddy/src/index.js'
import { CliEnvelope, cliObservabilityLayer } from '../packages/cli-protocol/src/index.js'
import { ImmichApiLive, ImmichConfigLive } from '../packages/immich/src/index.js'
import { JellyfinApiLive, JellyfinConfigLive } from '../packages/jellyfin/src/index.js'
import { JellyseerrApiLive, JellyseerrConfigLive } from '../packages/jellyseerr/src/index.js'
import { ProwlarrApiLive, ProwlarrConfigLive } from '../packages/prowlarr/src/index.js'
import { RadarrApiLive, RadarrConfigLive } from '../packages/radarr/src/index.js'
import { SabnzbdApiLive, SabnzbdConfigLive } from '../packages/sabnzbd/src/index.js'
import { SonarrApiLive, SonarrConfigLive } from '../packages/sonarr/src/index.js'
import {
  TubearchivistApiLive,
  TubearchivistConfigLive,
  TubearchivistSessionCacheMemoryLive,
} from '../packages/tubearchivist/src/index.js'

const EmptyEnvLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))
const ObservabilityLive = cliObservabilityLayer({
  serviceName: '@garage/live-cli-missing-env-test',
  serviceVersion: '0.0.0',
  environment: 'test',
}).pipe(Layer.provide(BunHttpClient.layer))

const AdguardLive = AdguardApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(AdguardConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const AutocaliwebLive = AutocaliwebApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(AutocaliwebConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const CaddyLive = Layer.mergeAll(
  FileSystem.layerNoop({}),
  CaddyApiLive.pipe(Layer.provideMerge(Layer.mergeAll(CaddyConfigLive, BunHttpClient.layer)))
).pipe(Layer.provideMerge(ObservabilityLive))
const ImmichLive = ImmichApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(ImmichConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const JellyfinLive = JellyfinApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(JellyfinConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const JellyseerrLive = JellyseerrApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(JellyseerrConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const ProwlarrLive = ProwlarrApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(ProwlarrConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const RadarrLive = RadarrApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(RadarrConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const SabnzbdLive = SabnzbdApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(SabnzbdConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const SonarrLive = SonarrApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(SonarrConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const TubearchivistLive = TubearchivistApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TubearchivistConfigLive, TubearchivistSessionCacheMemoryLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)

const assertMissingEnvRoot = (envelope: CliEnvelope<unknown>): void => {
  assert.strictEqual(envelope.ok, true)
  if (!envelope.ok) {
    assert.fail('expected success envelope')
  }
  if (!P.isObject(envelope.result) || !('health' in envelope.result)) {
    assert.fail('expected root command result')
  }
  assert.deepStrictEqual(envelope.result.health, { configured: false })
}

interface CliRunResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

// @effect-diagnostics-next-line processEnv:off -- subprocess boundary forwards only the host executable path
const hostPath = globalThis.process.env.PATH ?? ''

const runCliMain = Effect.fn('live-cli-missing-env.runCliMain')(function* (
  entrypoint: string,
  args: ReadonlyArray<string> = []
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make('bun', [entrypoint, ...args], { env: { PATH: hostPath }, extendEnv: false })
      )
      const result = yield* Effect.all(
        {
          exitCode: handle.exitCode,
          stdout: handle.stdout.pipe(Stream.decodeText, Stream.mkString),
          stderr: handle.stderr.pipe(Stream.decodeText, Stream.mkString),
        },
        { concurrency: 'unbounded' }
      )
      const runResult: CliRunResult = {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      }
      return runResult
    })
  )
})

const decodeSingleStdoutEnvelope = (result: CliRunResult): CliEnvelope<unknown> => {
  assert.strictEqual(result.exitCode, 0, result.stderr)
  assert.strictEqual(result.stderr, '')
  assert.match(result.stdout, /^\{.*\}\n$/u)
  assert.strictEqual(
    result.stdout.split('\n').filter(Str.isNonEmpty).length,
    1,
    'expected exactly one non-empty stdout line'
  )
  const parsed: unknown = JSON.parse(result.stdout)
  return Schema.decodeUnknownSync(CliEnvelope(Schema.Unknown))(parsed)
}

const assertMainRendersMissingEnvRoot = Effect.fn('live-cli-missing-env.assertMainRendersMissingEnvRoot')(function* (
  entrypoint: string
) {
  const envelope = decodeSingleStdoutEnvelope(yield* runCliMain(entrypoint))
  assertMissingEnvRoot(envelope)
})

it.effect('HTTP CLI root commands render missing-env envelopes with real live layers', () =>
  Effect.gen(function* () {
    assertMissingEnvRoot(yield* executeAdguard([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, AdguardLive))))
    assertMissingEnvRoot(
      yield* executeAutocaliweb([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, AutocaliwebLive)))
    )
    assertMissingEnvRoot(yield* executeCaddy([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, CaddyLive))))
    assertMissingEnvRoot(yield* executeImmich([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, ImmichLive))))
    assertMissingEnvRoot(yield* executeJellyfin([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, JellyfinLive))))
    assertMissingEnvRoot(
      yield* executeJellyseerr([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, JellyseerrLive)))
    )
    assertMissingEnvRoot(yield* executeProwlarr([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, ProwlarrLive))))
    assertMissingEnvRoot(yield* executeRadarr([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, RadarrLive))))
    assertMissingEnvRoot(yield* executeSabnzbd([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, SabnzbdLive))))
    assertMissingEnvRoot(yield* executeSonarr([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, SonarrLive))))
    assertMissingEnvRoot(
      yield* executeTubearchivist([]).pipe(Effect.provide(Layer.mergeAll(EmptyEnvLayer, TubearchivistLive)))
    )
  })
)

// Each assertion cold-spawns `bun <entrypoint>` (transpile + load all layers).
// Eleven sequential spawns can exceed vitest's default 5s timeout when the full
// `validate` run saturates the machine, so this subprocess test gets a generous
// budget.
it.effect('CLI entrypoints preserve JSON error envelopes and zero exit status for usage errors', () =>
  Effect.gen(function* () {
    const envelope = decodeSingleStdoutEnvelope(yield* runCliMain('apps/adguard-cli/src/main.ts', ['unknown-command']))
    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'adguard unknown-command',
      error: {
        code: 'ADGUARD_CLI_USAGE',
        message: 'Unknown command unknown-command',
      },
      fix: 'Run adguard to inspect available commands and required arguments.',
      next_actions: [{ command: 'adguard', description: 'Show available commands' }],
    })
  }).pipe(Effect.provide(BunServices.layer))
)

it.effect(
  'HTTP CLI entrypoints render missing-env envelopes instead of throwing',
  () =>
    Effect.gen(function* () {
      yield* assertMainRendersMissingEnvRoot('apps/adguard-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/autocaliweb-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/caddy-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/immich-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/jellyfin-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/jellyseerr-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/prowlarr-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/radarr-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/sabnzbd-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/sonarr-cli/src/main.ts')
      yield* assertMainRendersMissingEnvRoot('apps/tubearchivist-cli/src/main.ts')
    }).pipe(Effect.provide(BunServices.layer)),
  60_000
)
