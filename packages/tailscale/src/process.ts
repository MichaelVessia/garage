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

const statusText = (process: TailscaleProcessService): Effect.Effect<string, TailscaleError> => {
  const args = ['status', '--json']
  return process.run(args).pipe(Effect.flatMap((result) => expectSuccess(args, result)))
}

const requireRunning = (status: StatusResult): Effect.Effect<void, TailscaleError> =>
  status.backendState === 'Running' ? Effect.void : Effect.fail(notRunning(status.backendState))

const statusResult = (process: TailscaleProcessService, limit: number): Effect.Effect<StatusResult, TailscaleError> =>
  statusText(process).pipe(Effect.flatMap((json) => decodeJson(json, StatusResultSchema(limit))))

const exitNodeList = (
  process: TailscaleProcessService,
  limit: number
): Effect.Effect<readonly [StatusResult, ListResult<PeerRecord>], TailscaleError> =>
  statusText(process).pipe(
    Effect.flatMap((json) =>
      Effect.all([decodeJson(json, StatusResultSchema(1)), decodeJson(json, ExitNodeListSchema(limit))], {
        concurrency: 1,
      })
    )
  )

const runText = (
  process: TailscaleProcessService,
  args: ReadonlyArray<string>
): Effect.Effect<string, TailscaleError> =>
  process.run(args).pipe(Effect.flatMap((result) => expectSuccess(args, result)))

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
      status: (options) => statusResult(process, options.limit),
      peers: (options) =>
        statusResult(process, options.limit).pipe(
          Effect.flatMap((status) => requireRunning(status).pipe(Effect.as(status.peers)))
        ),
      exitNodes: (options) =>
        exitNodeList(process, options.limit).pipe(
          Effect.flatMap(([status, nodes]) => requireRunning(status).pipe(Effect.as(nodes)))
        ),
      currentExitNode: statusResult(process, 1).pipe(
        Effect.flatMap((status) => requireRunning(status).pipe(Effect.as(status))),
        Effect.map((status) => ({ usingExitNode: status.currentExitNode !== undefined, peer: status.currentExitNode }))
      ),
      dns: statusResult(process, 1).pipe(
        Effect.flatMap((status) => requireRunning(status)),
        Effect.andThen(runText(process, ['dns', 'status'])),
        Effect.map((output) => ({ output, lines: lines(output) }))
      ),
      ip: statusResult(process, 1).pipe(
        Effect.flatMap((status) => requireRunning(status)),
        Effect.andThen(
          Effect.all({ v4: process.run(['ip', '-4']), v6: process.run(['ip', '-6']) }, { concurrency: 1 })
        ),
        Effect.map((result) => ({
          ipv4: result.v4.exitCode === 0 ? firstLine(result.v4.stdout) : undefined,
          ipv6: result.v6.exitCode === 0 ? firstLine(result.v6.stdout) : undefined,
        }))
      ),
      whois: (options) => runText(process, ['whois', '--json', options.target]).pipe(Effect.flatMap(decodeJsonObject)),
      ping: (options) =>
        runText(process, ['ping', '--c', '3', options.target]).pipe(
          Effect.map((output) => ({ target: options.target, output, lines: lines(output) }))
        ),
    })
  })
)
