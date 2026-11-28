import { DeviceLinkRequest } from '@garage/battleblocks-domain'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as Request from 'effect/http/HttpServerRequest'
import * as Response from 'effect/http/HttpServerResponse'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

import { QueueGateway } from './QueueLogic.ts'
import { RatingsGateway, Callsign, codeFromBytes } from './RatingsLogic.ts'
import { JoinInput, RoomGateway } from './RoomLogic.ts'

const Register = S.Struct({ callsign: S.optionalKey(Callsign) })
const Rename = S.Struct({ callsign: Callsign })
const bad = Response.empty({ status: 400 })
const unauthorized = Response.empty({ status: 401 })
const profileResponse = <T>(value: Option.Option<T>) =>
  Option.isSome(value) ? Response.jsonUnsafe({ profile: value.value }) : unauthorized
const readBody = <A extends S.ConstraintDecoder<unknown, never>>(
  request: Request.HttpServerRequest,
  schema: A,
  optional = false
) =>
  request.text.pipe(
    Effect.flatMap((text) => S.decodeEffect(S.fromJsonString(schema))(optional && text === '' ? '{}' : text)),
    Effect.option
  )
const missing = Response.empty({ status: 404 })
export const router = Effect.gen(function* () {
  const request = yield* Request.HttpServerRequest
  const url = new URL(request.url, 'https://battleblocks.local')
  const path = url.pathname
  if (path === '/api/queue/ws' && request.method === 'GET') {
    return yield* (yield* QueueGateway).connect(request)
  }
  if (Str.startsWith('/api/profile')(path) || path === '/api/leaderboard') {
    const ratings = yield* RatingsGateway
    const token = /^Bearer ([^\s]+)$/iu.exec(request.headers.authorization ?? '')?.[1]
    if (path === '/api/profile/register' && request.method === 'POST') {
      const input = yield* readBody(request, Register, true)
      return Option.isSome(input)
        ? yield* ratings.register(input.value.callsign).pipe(Effect.map((value) => Response.jsonUnsafe(value)))
        : bad
    }
    if (path === '/api/profile/claim' && request.method === 'POST') {
      const input = yield* readBody(request, DeviceLinkRequest)
      if (Option.isNone(input) || Str.trim(input.value.code) === '') {
        return bad
      }
      const result = yield* ratings.claimDeviceLink(input.value.code)
      return result.status === 'ok'
        ? Response.jsonUnsafe(result.session)
        : Response.empty({ status: result.status === 'expired' ? 410 : 404 })
    }
    if (path === '/api/leaderboard' && request.method === 'GET') {
      const profile = token === undefined ? Option.none() : yield* ratings.authenticate(token)
      const viewer = Option.isSome(profile)
        ? Option.some(profile.value.playerId)
        : Option.fromNullishOr(url.searchParams.get('playerId'))
      return yield* ratings.leaderboard(viewer).pipe(Effect.map((value) => Response.jsonUnsafe(value)))
    }
    if (path === '/api/profile' && request.method === 'GET') {
      return token === undefined ? unauthorized : yield* ratings.authenticate(token).pipe(Effect.map(profileResponse))
    }
    if (path === '/api/profile' && request.method === 'PATCH') {
      if (token === undefined) {
        return unauthorized
      }
      const input = yield* readBody(request, Rename)
      return Option.isNone(input)
        ? bad
        : yield* ratings.updateCallsign(token, input.value.callsign).pipe(Effect.map(profileResponse))
    }
    if (path === '/api/profile/link' && request.method === 'POST') {
      if (token === undefined) {
        return unauthorized
      }
      const link = yield* ratings.createDeviceLink(token)
      return Option.isSome(link) ? Response.jsonUnsafe(link.value) : unauthorized
    }
    return missing
  }
  if (path === '/health' && request.method === 'GET') {
    return Response.jsonUnsafe({ status: 'ok' })
  }
  const create = path === '/api/rooms' && request.method === 'POST'
  const match = /^\/api\/rooms\/([^/]+)\/(join|ws)$/u.exec(path)
  const id = Str.toUpperCase(match?.[1] ?? '')
  if (create === false && match === null) {
    return missing
  }
  if (create === false && /^[A-Z0-9]{6}$/u.test(id) === false) {
    return Response.empty({ status: 400 })
  }
  const rooms = yield* RoomGateway
  if (match?.[2] === 'ws' && request.method === 'GET') {
    return yield* rooms.connect(id, request)
  }
  if (create === false && (match?.[2] !== 'join' || request.method !== 'POST')) {
    return missing
  }
  const input = yield* request.text.pipe(
    Effect.flatMap((body) => S.decodeEffect(S.fromJsonString(JoinInput))(body === '' ? '{}' : body)),
    Effect.option
  )
  if (Option.isNone(input)) {
    return Response.empty({ status: 400 })
  }
  const random = yield* SecureRandom.SecureRandom
  const token = yield* random.uuidV4()
  if (create) {
    const seed = new DataView((yield* random.randomBytes(4)).slice().buffer).getUint32(0)
    const result = yield* Effect.gen(function* () {
      const bytes = yield* random.randomBytes(6)
      const roomId = codeFromBytes(bytes)
      if (yield* rooms.create(roomId, input.value.name ?? 'Duelist 1', token, seed)) {
        return Response.jsonUnsafe({ roomId, seat: 0, token })
      }
      return Response.empty({ status: 503 })
    }).pipe(Effect.repeat({ times: 3, until: (response) => response.status === 200 }))
    return result
  }
  const admission = yield* rooms.join(id, input.value, token)
  return Option.isNone(admission) ? missing : Response.jsonUnsafe(admission.value)
})
