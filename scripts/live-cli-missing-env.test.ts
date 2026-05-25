import { spawn } from 'node:child_process'
import process from 'node:process'
import type { Readable } from 'node:stream'
import { text } from 'node:stream/consumers'

import * as BunHttpClient from '@effect/platform-bun/BunHttpClient'
import { assert, it } from '@effect/vitest'
import { ConfigProvider, Effect, Layer, Schema } from 'effect'

import { executeAdguard } from '../apps/adguard-cli/src/index.js'
import { executeAutocaliweb } from '../apps/autocaliweb-cli/src/index.js'
import { CaddyConfigFile } from '../apps/caddy-cli/src/config-file.js'
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
import { CaddyApiLive, CaddyConfigLive, decodeError as caddyDecodeError } from '../packages/caddy/src/index.js'
import { CliEnvelopeSchema, cliObservabilityLayer } from '../packages/cli-protocol/src/index.js'
import type { CliEnvelope } from '../packages/cli-protocol/src/index.js'
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
  Layer.succeed(CaddyConfigFile, { read: () => Effect.fail(caddyDecodeError('unused test config reader')) }),
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
  if (typeof envelope.result !== 'object' || envelope.result === null || !('health' in envelope.result)) {
    assert.fail('expected root command result')
  }
  assert.deepStrictEqual(envelope.result.health, { configured: false })
}

interface CliRunResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

const streamText = (stream: Readable | null): Promise<string> => (stream === null ? Promise.resolve('') : text(stream))

const exitCode = (subprocess: ReturnType<typeof spawn>): Promise<number> => {
  const deferred = Promise.withResolvers<number>()
  subprocess.on('error', deferred.reject)
  subprocess.on('close', (code) => {
    deferred.resolve(code ?? 1)
  })
  return deferred.promise
}

const runCliMain = (entrypoint: string): Effect.Effect<CliRunResult, Error> =>
  Effect.tryPromise({
    try: async () => {
      const subprocess = spawn('bun', [entrypoint], {
        env: { PATH: process.env.PATH ?? '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const [stdout, stderr, code] = await Promise.all([
        streamText(subprocess.stdout),
        streamText(subprocess.stderr),
        exitCode(subprocess),
      ])
      return { stdout, stderr, exitCode: code }
    },
    catch: (cause) => new Error(String(cause)),
  })

const assertMainRendersMissingEnvRoot = (entrypoint: string): Effect.Effect<void, Error> =>
  runCliMain(entrypoint).pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        assert.strictEqual(result.exitCode, 0, result.stderr)
        const parsed: unknown = JSON.parse(result.stdout)
        const envelope = Schema.decodeUnknownSync(CliEnvelopeSchema(Schema.Unknown))(parsed)
        assertMissingEnvRoot(envelope)
      })
    ),
    Effect.asVoid
  )

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

it.effect('HTTP CLI entrypoints render missing-env envelopes instead of throwing', () =>
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
  })
)
