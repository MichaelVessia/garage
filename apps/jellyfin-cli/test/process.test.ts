// oxlint-disable effect/use-http-client-service -- this process-contract test needs a real local HTTP listener; Effect HttpClient is the system under test.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import * as NodeHttp from 'node:http'
// oxlint-enable effect/use-http-client-service

import * as BunChildProcessSpawner from '@effect/platform-bun/BunChildProcessSpawner'
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem'
import * as BunPath from '@effect/platform-bun/BunPath'
import { assert, it } from '@effect/vitest'
import { CliEnvelope } from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as P from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as Str from 'effect/String'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'

interface CliRunResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

// @effect-diagnostics-next-line processEnv:off
const hostPath = globalThis.process.env.PATH ?? ''

const runJellyfin = Effect.fn('jellyfin-cli.process.runJellyfin')(function* (serverUrl: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make('bun', ['src/main.ts', 'recently-added'], {
          env: {
            PATH: hostPath,
            JELLYFIN_URL: serverUrl,
            JELLYFIN_API_KEY: 'secret',
          },
          extendEnv: false,
        })
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

const ProcessLayer = BunChildProcessSpawner.layer.pipe(
  Layer.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer))
)

const startJellyfinServer = Effect.callback<NodeHttp.Server>((resume) => {
  const server = NodeHttp.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      request.url === '/Users'
        ? '[{"Id":"admin-2","Policy":{"IsAdministrator":true,"IsDisabled":false}},{"Id":"admin-1","Policy":{"IsAdministrator":true,"IsDisabled":false}}]'
        : '[]'
    )
  })
  server.listen(0, '127.0.0.1', () => {
    resume(Effect.succeed(server))
  })
  return Effect.sync(() => {
    server.close()
  })
})

const listeningPort = Effect.fn('jellyfin-cli.process.listeningPort')(function* (
  server: NodeHttp.Server
): Effect.fn.Return<number> {
  const address = server.address()
  if (address === null || P.isString(address)) {
    return yield* Effect.die(new Error('expected Jellyfin test server to listen on a TCP port'))
  }
  return address.port
})

it.effect('renders media visibility failures as one stdout envelope with status zero and empty stderr', () =>
  Effect.acquireUseRelease(
    startJellyfinServer,
    (server) =>
      Effect.gen(function* () {
        const port = yield* listeningPort(server)
        const result = yield* runJellyfin(`http://127.0.0.1:${port}`)

        assert.strictEqual(result.exitCode, 0, result.stderr)
        assert.strictEqual(result.stderr, '')
        assert.match(result.stdout, /^\{.*\}\n$/u)
        assert.strictEqual(
          result.stdout.split('\n').filter(Str.isNonEmpty).length,
          1,
          'expected exactly one non-empty stdout line'
        )

        const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(result.stdout)
        const envelope = yield* Schema.decodeUnknownEffect(CliEnvelope(Schema.Unknown))(parsed)
        assert.deepStrictEqual(envelope, {
          ok: false,
          command: 'jellyfin recently-added',
          error: {
            code: 'JELLYFIN_AMBIGUOUS_ADMINISTRATOR',
            message: 'Multiple enabled Jellyfin administrators are available for media visibility',
          },
          fix: 'Set JELLYFIN_USER_ID to the enabled Jellyfin user whose media visibility should be used.',
          next_actions: [
            {
              command: 'jellyfin users',
              description: 'List users and choose an enabled user ID for JELLYFIN_USER_ID',
            },
          ],
        })
      }),
    (server) =>
      Effect.sync(() => {
        server.close()
      })
  ).pipe(Effect.provide(ProcessLayer))
)
