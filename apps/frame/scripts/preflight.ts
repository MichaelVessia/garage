import * as BunHttpClient from '@effect/platform-bun/BunHttpClient'
import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunServices from '@effect/platform-bun/BunServices'
import * as Arr from 'effect/Array'
import * as Config from 'effect/Config'
import * as Console from 'effect/Console'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'
import { Socket } from 'effect/unstable/socket'

import { PreflightFailed } from './errors.js'

// Runs the exact Nix-built server and SPA with the real upstreams from `.env.prod`, opens it in
// headless Chromium 106 (the frame's WebView engine), and fails unless the app mounts, every
// screen loads, and no script error is reported. `deploy:prod` runs this before shipping.

const SERVER_PORT = 8099
const DEVTOOLS_PORT = 9333
const SCREENS = ['Today', 'Calendar', 'Shopping'] as const

const DevtoolsTarget = Schema.Struct({ webSocketDebuggerUrl: Schema.String })
const CdpMessage = Schema.fromJsonString(
  Schema.Struct({
    id: Schema.optional(Schema.Number),
    method: Schema.optional(Schema.String),
    params: Schema.optional(Schema.Unknown),
    result: Schema.optional(Schema.Unknown),
  })
)
const EvaluateResult = Schema.Struct({ result: Schema.Struct({ value: Schema.optional(Schema.Unknown) }) })
const CdpParams = Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean]))
type CdpParams = typeof CdpParams.Type
const CdpRequest = Schema.fromJsonString(Schema.Struct({ id: Schema.Number, method: Schema.String, params: CdpParams }))
type CdpMessage = typeof CdpMessage.Type
const ExceptionParams = Schema.Struct({
  exceptionDetails: Schema.Struct({
    text: Schema.String,
    exception: Schema.optional(Schema.Struct({ description: Schema.optional(Schema.String) })),
  }),
})
const ConsoleParams = Schema.Struct({
  type: Schema.String,
  args: Schema.Array(
    Schema.Struct({ value: Schema.optional(Schema.Unknown), description: Schema.optional(Schema.String) })
  ),
})

const fail = (check: string, detail: string) => new PreflightFailed({ check, message: `${check}: ${detail}` })

// One `nix build` for the server, the SPA, and the browser, in that order.
const buildArtifacts = Effect.fn('frame.preflight.build')(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const output = yield* spawner.string(
    ChildProcess.make(
      'nix',
      [
        'build',
        '--no-link',
        '--print-out-paths',
        '../..#garage-frame',
        '../..#garage-frame-web',
        '../..#chromium-webview-106',
      ],
      { stderr: 'inherit' }
    )
  )
  const [server, web, chromium] = Arr.filter(output.split('\n'), (line) => line !== '')
  if (server === undefined || web === undefined || chromium === undefined) {
    return yield* fail('build', 'nix build did not print three store paths')
  }
  return { server, web, chromium }
})

// A child process that lives as long as the enclosing scope.
const spawnScoped = Effect.fn('frame.preflight.spawn')(function* (
  command: string,
  args: ReadonlyArray<string>,
  env: Record<string, string>
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(
    ChildProcess.make(command, [...args], { env, extendEnv: true, stdout: 'ignore', stderr: 'ignore' })
  )
  yield* Effect.addFinalizer(() =>
    handle.kill().pipe(
      Effect.tapError((failure) => Effect.logDebug('Preflight child already exited', failure)),
      Effect.ignore
    )
  )
})

const waitUntilReachable = (url: string, check: string) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((client) => client.get(url)),
    Effect.retry({ schedule: Schedule.spaced('250 millis'), times: 120 }),
    Effect.mapError(() => fail(check, `${url} never answered`))
  )

// A minimal Chrome DevTools Protocol session over the page's WebSocket.
const openPage = Effect.fn('frame.preflight.openPage')(function* () {
  const client = yield* HttpClient.HttpClient
  const target = yield* client.put(`http://127.0.0.1:${DEVTOOLS_PORT}/json/new?about:blank`).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(DevtoolsTarget)),
    Effect.mapError(() => fail('browser', 'could not open a DevTools page'))
  )
  const socket = yield* Socket.makeWebSocket(target.webSocketDebuggerUrl)
  const write = yield* socket.writer
  const nextId = yield* Ref.make(0)
  const replies = yield* Ref.make(HashMap.empty<number, Deferred.Deferred<unknown>>())
  const scriptErrors = yield* Ref.make<ReadonlyArray<string>>([])

  const onEvent = Effect.fn('frame.preflight.onEvent')(function* (message: CdpMessage) {
    if (message.method === 'Runtime.exceptionThrown') {
      const { exceptionDetails } = yield* Schema.decodeUnknownEffect(ExceptionParams)(message.params)
      const description = exceptionDetails.exception?.description ?? exceptionDetails.text
      yield* Ref.update(scriptErrors, Arr.append(description))
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const { type, args } = yield* Schema.decodeUnknownEffect(ConsoleParams)(message.params)
      if (type === 'error') {
        const text = Arr.map(args, (arg) => arg.description ?? String(arg.value)).join(' ')
        yield* Ref.update(scriptErrors, Arr.append(`console.error: ${text}`))
      }
    }
  })

  yield* socket
    .runString((frame) =>
      Schema.decodeUnknownEffect(CdpMessage)(frame).pipe(
        Effect.flatMap((message) =>
          message.id === undefined
            ? onEvent(message)
            : Ref.get(replies).pipe(
                Effect.flatMap((pending) =>
                  Option.match(HashMap.get(pending, message.id ?? -1), {
                    onNone: () => Effect.void,
                    onSome: (reply) => Deferred.succeed(reply, message.result),
                  })
                )
              )
        ),
        Effect.tapError((failure) => Effect.logDebug('Unreadable DevTools frame', failure)),
        Effect.ignore
      )
    )
    .pipe(Effect.forkScoped)

  const send = Effect.fn('frame.preflight.send')(function* (method: string, params: CdpParams = {}) {
    const id = yield* Ref.updateAndGet(nextId, (n) => n + 1)
    const reply = yield* Deferred.make<unknown>()
    yield* Ref.update(replies, HashMap.set(id, reply))
    yield* Schema.encodeEffect(CdpRequest)({ id, method, params }).pipe(Effect.flatMap(write), Effect.orDie)
    return yield* Deferred.await(reply).pipe(
      Effect.timeoutOrElse({
        duration: '10 seconds',
        orElse: () => Effect.fail(fail('browser', `${method} timed out`)),
      })
    )
  })

  const holds = (expression: string) =>
    send('Runtime.evaluate', { expression, returnByValue: true }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(EvaluateResult)),
      Effect.map(({ result }) => result.value === true),
      Effect.tapError((failure) => Effect.logDebug('Page check not evaluable yet', failure)),
      Effect.orElseSucceed(() => false)
    )

  const waitFor = (check: string, expression: string) =>
    holds(expression).pipe(
      Effect.repeat({ until: (held) => held, schedule: Schedule.spaced('250 millis'), times: 80 }),
      Effect.flatMap((held) =>
        held
          ? Effect.void
          : Ref.get(scriptErrors).pipe(
              Effect.flatMap((errors) =>
                Effect.fail(
                  fail(
                    check,
                    Arr.isReadonlyArrayNonEmpty(errors)
                      ? `timed out after 20 s; script errors:\n${errors.join('\n')}`
                      : 'timed out after 20 s'
                  )
                )
              )
            )
      )
    )

  yield* send('Runtime.enable')
  yield* send('Page.enable')
  yield* send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  return { send, holds, waitFor, scriptErrors }
})

const loaded = `!/Loading|unavailable|Offline/.test(document.body.innerText)`
const clickScreen = (screen: string) =>
  `(() => { const b = [...document.querySelectorAll('.rail-item')].find((el) => el.innerText.trim().toLowerCase() === '${screen.toLowerCase()}'); if (b) b.click(); return b !== undefined })()`

const preflight = Effect.fn('frame.preflight')(function* () {
  const artifacts = yield* buildArtifacts()
  const url = `http://127.0.0.1:${SERVER_PORT}/`

  yield* spawnScoped(`${artifacts.server}/bin/garage-frame`, [], {
    FRAME_PORT: String(SERVER_PORT),
    FRAME_WEB_ROOT: artifacts.web,
    FRAME_BUILD_ID: 'preflight',
  })
  const profile = yield* Config.string('TMPDIR').pipe(Config.withDefault('/tmp'))
  yield* spawnScoped(
    `${artifacts.chromium}/bin/chromium-webview-106`,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${DEVTOOLS_PORT}`,
      `--user-data-dir=${profile}/garage-frame-preflight-${process.pid}`,
      'about:blank',
    ],
    {}
  )
  yield* waitUntilReachable(`${url}health`, 'server')
  yield* waitUntilReachable(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`, 'browser')

  const page = yield* openPage()
  yield* page.send('Page.navigate', { url })
  yield* page.waitFor('mount', `!document.querySelector('#root') && document.querySelector('.rail') !== null`)
  yield* Effect.forEach(
    SCREENS,
    (screen) =>
      page.waitFor(`open ${screen}`, clickScreen(screen)).pipe(Effect.andThen(page.waitFor(`load ${screen}`, loaded))),
    { concurrency: 1, discard: true }
  )
  const errors = yield* Ref.get(page.scriptErrors)
  if (Arr.isReadonlyArrayNonEmpty(errors)) {
    return yield* fail('script errors', errors.join('\n'))
  }
  yield* Console.log(`Preflight passed in Chromium 106: mounted, ${SCREENS.join(', ')} loaded, no script errors`)
})

const ScriptLayer = Layer.mergeAll(BunServices.layer, BunHttpClient.layer, Socket.layerWebSocketConstructorGlobal)

// @effect-diagnostics-next-line strictEffectProvide:off -- script entry point
BunRuntime.runMain(preflight().pipe(Effect.scoped, Effect.provide(ScriptLayer)))
