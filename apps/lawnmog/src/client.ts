import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { BlockView, Command, Rejection } from './model.ts'

const decodeView = Schema.decodeUnknownOption(BlockView)
const encodeCommand = Schema.encodeOption(Schema.fromJsonString(Command))
const RequestReason = Schema.Union([Rejection, Schema.Literals(['invalid-command', 'session-required', 'origin'])])
export type RequestReason = typeof RequestReason.Type
const decodeError = Schema.decodeUnknownOption(
  Schema.Struct({ reason: RequestReason, view: Schema.optionalKey(BlockView) })
)
const Pose = Schema.Struct({ x: Schema.Finite, z: Schema.Finite, yaw: Schema.Finite })
export type Pose = typeof Pose.Type
const encodePose = Schema.encodeOption(Schema.fromJsonString(Pose))
const decodePresence = Schema.decodeUnknownOption(
  Schema.Struct({
    peers: Schema.Array(Schema.Struct({ ...Pose.fields, lot: Schema.Int, name: Schema.String })),
  })
)

function decoded<A>(result: Option.Option<A>): A {
  if (Option.isNone(result)) {
    throw new Error('Invalid block message')
  }
  return result.value
}

function request(url: string, body?: string) {
  const signal = AbortSignal.timeout(7000)
  const options: RequestInit =
    body === undefined
      ? { cache: 'no-store', signal }
      : {
          method: 'POST',
          keepalive: url !== '/api/block/presence',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal,
        }
  return window.fetch(url, options).then((response) => response.json().then((raw: unknown) => ({ response, raw })))
}

export function readBlock() {
  return request('/api/block').then(({ response, raw }) => {
    if (!response.ok) {
      throw new Error('Block unavailable')
    }
    return decoded(decodeView(raw))
  })
}

export function sendCommand(command: Command) {
  return request('/api/block', decoded(encodeCommand(command))).then(({ response, raw }) => {
    if (response.ok) {
      return { view: decoded(decodeView(raw)), reason: null }
    }
    if (response.status >= 500) {
      throw new Error('Block unavailable')
    }
    return decoded(decodeError(raw))
  })
}

export function syncPresence(pose?: Pose) {
  return request('/api/block/presence', pose === undefined ? undefined : decoded(encodePose(pose))).then(
    ({ response, raw }) => {
      if (!response.ok) {
        throw new Error('Presence unavailable')
      }
      return decoded(decodePresence(raw)).peers
    }
  )
}

export function requestChat(body?: string) {
  return request('/api/block/chat', body)
}
