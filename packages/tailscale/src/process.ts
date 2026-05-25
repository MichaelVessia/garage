import { Effect, Layer, Schema } from 'effect'

import { ExitNodeListSchema, JsonObjectSchema, StatusResultSchema } from './api-schema.js'
import { commandFailed, decodeError, notRunning } from './errors.js'
import type { TailscaleError } from './errors.js'
import type { JsonObject, ListResult, PeerRecord, ProcessResult, StatusResult } from './model.js'
import { TailscaleApi, TailscaleProcess } from './services.js'
import type { TailscaleProcessService } from './services.js'

const commandName = (args: ReadonlyArray<string>): string => `tailscale ${args.join(' ')}`

const commandOutput = (result: ProcessResult): string => {
  const stderr = result.stderr.trim()
  const stdout = result.stdout.trim()
  return stderr.length === 0 ? stdout : stderr
}

const expectSuccess = (args: ReadonlyArray<string>, result: ProcessResult): Effect.Effect<string, TailscaleError> =>
  result.exitCode === 0
    ? Effect.succeed(result.stdout)
    : Effect.fail(commandFailed(commandName(args), result.exitCode, commandOutput(result)))

const decodeJson = <A, I, RD, RE>(
  input: string,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, TailscaleError, RD> =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(input).pipe(
    Effect.mapError((issue) => decodeError(issue.message))
  )

const statusText = Effect.fn('tailscale.statusText')(function* (
  process: TailscaleProcessService
): Effect.fn.Return<string, TailscaleError> {
  const args = ['status', '--json']
  return yield* process.run(args).pipe(Effect.flatMap((result) => expectSuccess(args, result)))
})

const requireRunning = (status: StatusResult): Effect.Effect<void, TailscaleError> =>
  status.backendState === 'Running' ? Effect.void : Effect.fail(notRunning(status.backendState))

const statusResult = Effect.fn('tailscale.statusResult')(function* (
  process: TailscaleProcessService,
  limit: number
): Effect.fn.Return<StatusResult, TailscaleError> {
  yield* Effect.annotateCurrentSpan({ 'tailscale.limit': limit })
  return yield* statusText(process).pipe(Effect.flatMap((json) => decodeJson(json, StatusResultSchema(limit))))
})

const exitNodeList = Effect.fn('tailscale.exitNodeList')(function* (
  process: TailscaleProcessService,
  limit: number
): Effect.fn.Return<readonly [StatusResult, ListResult<PeerRecord>], TailscaleError> {
  yield* Effect.annotateCurrentSpan({ 'tailscale.limit': limit })
  return yield* statusText(process).pipe(
    Effect.flatMap((json) =>
      Effect.all([decodeJson(json, StatusResultSchema(1)), decodeJson(json, ExitNodeListSchema(limit))], {
        concurrency: 1,
      })
    )
  )
})

const runText = Effect.fn('tailscale.runText')(function* (
  process: TailscaleProcessService,
  args: ReadonlyArray<string>
): Effect.fn.Return<string, TailscaleError> {
  yield* Effect.annotateCurrentSpan({ 'tailscale.arg_count': args.length })
  return yield* process.run(args).pipe(Effect.flatMap((result) => expectSuccess(args, result)))
})

const lines = (output: string): ReadonlyArray<string> => output.split(/\r?\n/u).filter((line) => line.length > 0)

const firstLine = (output: string): string | undefined =>
  lines(output)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

const decodeJsonObject = (input: string): Effect.Effect<JsonObject, TailscaleError> =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(JsonObjectSchema))(input).pipe(
    Effect.mapError((issue) => decodeError(issue.message))
  )

export const TailscaleApiLive = Layer.effect(
  TailscaleApi,
  Effect.gen(function* () {
    const process = yield* TailscaleProcess

    return TailscaleApi.of({
      status: Effect.fn('TailscaleApi.status')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tailscale.limit': options.limit })
          return yield* statusResult(process, options.limit)
        },
        Effect.annotateLogs({ package: '@garage/tailscale', service: 'TailscaleApi', method: 'status' })
      ),
      peers: Effect.fn('TailscaleApi.peers')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tailscale.limit': options.limit })
          const status = yield* statusResult(process, options.limit)
          return yield* requireRunning(status).pipe(Effect.as(status.peers))
        },
        Effect.annotateLogs({ package: '@garage/tailscale', service: 'TailscaleApi', method: 'peers' })
      ),
      exitNodes: Effect.fn('TailscaleApi.exitNodes')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tailscale.limit': options.limit })
          const [status, nodes] = yield* exitNodeList(process, options.limit)
          return yield* requireRunning(status).pipe(Effect.as(nodes))
        },
        Effect.annotateLogs({ package: '@garage/tailscale', service: 'TailscaleApi', method: 'exitNodes' })
      ),
      currentExitNode: Effect.fn('TailscaleApi.currentExitNode')(
        function* () {
          const status = yield* statusResult(process, 1)
          yield* requireRunning(status)
          return { usingExitNode: status.currentExitNode !== undefined, peer: status.currentExitNode }
        },
        Effect.annotateLogs({ package: '@garage/tailscale', service: 'TailscaleApi', method: 'currentExitNode' })
      ),
      dns: Effect.fn('TailscaleApi.dns')(
        function* () {
          const status = yield* statusResult(process, 1)
          yield* requireRunning(status)
          const output = yield* runText(process, ['dns', 'status'])
          return { output, lines: lines(output) }
        },
        Effect.annotateLogs({ package: '@garage/tailscale', service: 'TailscaleApi', method: 'dns' })
      ),
      ip: Effect.fn('TailscaleApi.ip')(
        function* () {
          const status = yield* statusResult(process, 1)
          yield* requireRunning(status)
          const result = yield* Effect.all(
            { v4: process.run(['ip', '-4']), v6: process.run(['ip', '-6']) },
            { concurrency: 1 }
          )
          return {
            ipv4: result.v4.exitCode === 0 ? firstLine(result.v4.stdout) : undefined,
            ipv6: result.v6.exitCode === 0 ? firstLine(result.v6.stdout) : undefined,
          }
        },
        Effect.annotateLogs({ package: '@garage/tailscale', service: 'TailscaleApi', method: 'ip' })
      ),
      whois: Effect.fn('TailscaleApi.whois')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tailscale.target_length': options.target.length })
          return yield* runText(process, ['whois', '--json', options.target]).pipe(Effect.flatMap(decodeJsonObject))
        },
        Effect.annotateLogs({ package: '@garage/tailscale', service: 'TailscaleApi', method: 'whois' })
      ),
      ping: Effect.fn('TailscaleApi.ping')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tailscale.target_length': options.target.length })
          const output = yield* runText(process, ['ping', '--c', '3', options.target])
          return { target: options.target, output, lines: lines(output) }
        },
        Effect.annotateLogs({ package: '@garage/tailscale', service: 'TailscaleApi', method: 'ping' })
      ),
    })
  })
)
