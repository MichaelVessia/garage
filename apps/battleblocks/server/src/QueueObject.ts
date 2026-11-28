import * as Cloudflare from '@alchemy.run/cloudflare'
import { QueueClientMessage, QueueServerMessage } from '@garage/battleblocks-domain'
import * as Arr from 'effect/Array'
import * as Clock from 'effect/Clock'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as Request from 'effect/http/HttpServerRequest'
import * as Response from 'effect/http/HttpServerResponse'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Semaphore from 'effect/Semaphore'
import * as Str from 'effect/String'

import DuelRoomObject from './DuelRoomObject.ts'
import type { QueueEntry } from './QueueLogic.ts'
import { QUEUE_TICK_MS, buildQueuedStatus, selectQueuePairs } from './QueueLogic.ts'
import { codeFromBytes } from './RatingsLogic.ts'
import RatingsObject from './RatingsObject.ts'

type QueuedSocket = QueueEntry & { socket: Cloudflare.WebSocket }
const Attachment = S.Struct({
  socketId: S.String,
  playerId: S.String,
  callsign: S.String,
  rating: S.Int,
  joinedAtMs: S.Finite,
})
const send = (socket: Cloudflare.WebSocket, message: QueueServerMessage) =>
  S.encodeEffect(S.fromJsonString(QueueServerMessage))(message).pipe(
    Effect.orDie,
    Effect.flatMap((text) => socket.send(text))
  )
const cancel = Effect.fn(function* (socket: Cloudflare.WebSocket, reason: string) {
  yield* send(socket, QueueServerMessage.cases.Cancelled.make({})).pipe(Effect.ensuring(socket.close(1000, reason)))
})
export default class QueueObject extends Cloudflare.DurableObject<QueueObject>()(
  'QueueObject',
  Effect.all([Cloudflare.DurableObjectState, RatingsObject, DuelRoomObject], { concurrency: 1 }).pipe(
    Effect.map(([state, ratings, rooms]) =>
      Effect.gen(function* () {
        const services = yield* Layer.build(SecureRandom.layerWebCrypto)
        const random = yield* SecureRandom.SecureRandom.pipe(Effect.provide(services))
        const lock = yield* Semaphore.make(1)
        const matchPair = Effect.fn(function* ([a, b]: readonly [QueuedSocket, QueuedSocket], nowMs: number) {
          const bit = (yield* random.randomBytes(1))[0] ?? 0
          const [first, second] = bit % 2 === 0 ? [a, b] : [b, a]
          const matchId = yield* random.uuidV4()
          const token0 = yield* random.uuidV4()
          const token1 = yield* random.uuidV4()
          const seed = new DataView((yield* random.randomBytes(4)).slice().buffer).getUint32(0)
          const create = Effect.gen(function* () {
            const id = yield* random.randomBytes(6).pipe(Effect.map(codeFromBytes))
            const created = yield* rooms.getByName(id).createRanked({
              roomId: id,
              matchId,
              nowMs,
              seed,
              players: [
                { playerId: first.playerId, callsign: first.callsign, rating: first.rating, token: token0 },
                { playerId: second.playerId, callsign: second.callsign, rating: second.rating, token: token1 },
              ],
            })
            return created ? Option.some(id) : Option.none<string>()
          })
          const room = yield* create.pipe(Effect.repeat({ times: 3, until: Option.isSome }))
          if (Option.isNone(room)) {
            return false
          }
          const notify = (player: QueuedSocket, opponent: QueueEntry, seat: 0 | 1, token: string) =>
            send(
              player.socket,
              QueueServerMessage.cases.Matched.make({
                roomId: room.value,
                seat,
                token,
                opponentName: opponent.callsign,
                opponentRating: opponent.rating,
              })
            ).pipe(Effect.ensuring(player.socket.close(1000, 'Matched')), Effect.catchCause(Effect.logWarning))
          yield* notify(first, second, 0, token0)
          yield* notify(second, first, 1, token1)
          return true
        })
        const pass = Effect.fn(function* (nowMs: number, closing?: Cloudflare.WebSocket) {
          const allSockets = yield* state.getWebSockets()
          const sockets = Arr.filter(allSockets, (s) => s.ws.readyState === 1 && s.ws !== closing?.ws)
          const entries = yield* Effect.forEach(
            sockets,
            (s) =>
              s.getAttachment(Attachment).pipe(
                Effect.orDie,
                Effect.map((a) => ({ ...a, id: a.socketId, socket: s }))
              ),
            { concurrency: 1 }
          )
          const selected = selectQueuePairs(entries, nowMs)
          const waiting = Array.from(selected.waiting)
          if (entries.length > 0) {
            yield* state.storage.setAlarm(nowMs + QUEUE_TICK_MS)
          }
          yield* Effect.forEach(
            selected.pairs,
            Effect.fn(function* (pair) {
              if ((yield* matchPair(pair, nowMs)) === false) {
                waiting.push(...pair)
              }
            }),
            { concurrency: 1, discard: true }
          )
          waiting.sort((a, b) => a.joinedAtMs - b.joinedAtMs)
          yield* Effect.forEach(
            waiting,
            (entry, index) =>
              send(entry.socket, buildQueuedStatus(entry, index + 1, waiting.length, nowMs)).pipe(
                Effect.catchCause(Effect.logWarning)
              ),
            { concurrency: 1, discard: true }
          )
          if (waiting.length === 0) {
            yield* state.storage.deleteAlarm()
          }
        })
        const closed = (socket: Cloudflare.WebSocket) =>
          lock.withPermit(Clock.currentTimeMillis.pipe(Effect.flatMap((now) => pass(now, socket))))
        return {
          fetch: Effect.gen(function* () {
            const request = yield* Request.HttpServerRequest
            if (Str.toLowerCase(request.headers.upgrade ?? '') !== 'websocket') {
              return Response.empty({ status: 426 })
            }
            const token = new URL(request.url, 'https://battleblocks.local').searchParams.get('session')
            const profile = token === null ? null : yield* ratings.getByName('global').authenticate(token)
            if (profile === null) {
              return Response.empty({ status: 401 })
            }
            const tag = 'player-' + profile.playerId
            const peers = yield* state.getWebSockets(tag)
            yield* Effect.forEach(
              peers,
              Effect.fn(function* (peer) {
                if (peer.ws.readyState === 1) {
                  yield* cancel(peer, 'Replaced').pipe(Effect.catchCause(Effect.logWarning))
                }
              }),
              { concurrency: 1 }
            )
            const [response, socket] = yield* Cloudflare.upgrade({ tags: [tag] }).pipe(
              Effect.provideService(Cloudflare.DurableObjectState, state)
            )
            const nowMs = yield* Clock.currentTimeMillis
            yield* socket
              .setAttachment(Attachment, {
                socketId: yield* random.uuidV4(),
                playerId: profile.playerId,
                callsign: profile.callsign,
                rating: profile.rating,
                joinedAtMs: nowMs,
              })
              .pipe(Effect.orDie)
            yield* pass(nowMs)
            return response
          }).pipe((op) => lock.withPermit(op)),
          webSocketMessage: (socket: Cloudflare.WebSocket, data: string | Uint8Array | ArrayBuffer) =>
            lock.withPermit(
              Effect.gen(function* () {
                const message = yield* S.decodeEffect(S.fromJsonString(QueueClientMessage))(
                  typeof data === 'string' ? data : new TextDecoder().decode(data)
                ).pipe(Effect.option)
                if (Option.isNone(message)) {
                  return yield* send(socket, QueueServerMessage.cases.ErrorNotice.make({ message: 'Invalid message' }))
                }
                if (QueueClientMessage.guards.Ping(message.value)) {
                  return yield* send(socket, QueueServerMessage.cases.Pong.make({}))
                }
                yield* cancel(socket, 'Cancelled')
                const nowMs = yield* Clock.currentTimeMillis
                yield* pass(nowMs, socket)
              })
            ),
          webSocketClose: closed,
          webSocketError: closed,
          alarm: () => lock.withPermit(Clock.currentTimeMillis.pipe(Effect.flatMap((now) => pass(now)))),
        }
      })
    )
  )
) {}
