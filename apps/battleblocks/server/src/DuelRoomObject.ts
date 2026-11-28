import * as Cloudflare from '@alchemy.run/cloudflare'
import { DuelPhase, Seat, ServerMessage } from '@garage/battleblocks-domain'
import type { DurableObjectTransaction } from 'alchemy/Workers/Workerd/DurableObjectStorage'
import * as Arr from 'effect/Array'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Request from 'effect/http/HttpServerRequest'
import * as Response from 'effect/http/HttpServerResponse'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

import RatingsObject from './RatingsObject.ts'
import type { JoinInput, RankedRoomInput } from './RoomLogic.ts'
import {
  RoomRecord,
  applyRankedAlarm,
  createRankedRoom,
  markSeatConnected,
  markSeatDisconnected,
  nextAlarmMs,
  buildSnapshot,
  createRoom,
  handleMessage,
  joinRoom,
  resolveSeat,
} from './RoomLogic.ts'

const PendingResult = S.Struct({ matchId: S.String, winnerId: S.String, loserId: S.String, winner: Seat })
const readPending = (storage: Pick<DurableObjectTransaction, 'get'>) =>
  storage.get('pendingResult').pipe(Effect.flatMap(S.decodeUnknownEffect(S.UndefinedOr(PendingResult))), Effect.orDie)
const SocketAttachment = S.Struct({ seat: Seat.pipe(S.Option, S.toCodecJson) })
const readRoom = (storage: Pick<DurableObjectTransaction, 'get'>) =>
  storage.get('room').pipe(Effect.flatMap(S.decodeUnknownEffect(S.UndefinedOr(RoomRecord))), Effect.orDie)
const saveRoom = (tx: DurableObjectTransaction, room: RoomRecord) =>
  S.encodeEffect(RoomRecord)(room).pipe(
    Effect.flatMap((data) => tx.put('room', data)),
    Effect.orDie
  )
const send = (socket: Cloudflare.WebSocket, message: ServerMessage) =>
  S.encodeEffect(S.fromJsonString(ServerMessage))(message).pipe(
    Effect.orDie,
    Effect.flatMap((text) => socket.send(text))
  )
export default class DuelRoomObject extends Cloudflare.DurableObject<DuelRoomObject>()(
  'DuelRoomObject',
  Effect.all([Cloudflare.DurableObjectState, RatingsObject], { concurrency: 1 }).pipe(
    Effect.map(([state, ratings]) => {
      const persist = Effect.fn(function* (tx: DurableObjectTransaction, room: RoomRecord) {
        yield* saveRoom(tx, room)
        if (
          room.mode === 'ranked' &&
          room.status === 'finished' &&
          room.ratingDeltas === undefined &&
          room.matchId !== undefined &&
          room.seatPlayerIds !== undefined &&
          DuelPhase.guards.MatchOver(room.duel.phase)
        ) {
          const winner = room.duel.phase.winner
          yield* tx.put('pendingResult', {
            matchId: room.matchId,
            winnerId: room.seatPlayerIds[winner],
            loserId: room.seatPlayerIds[winner === 0 ? 1 : 0],
            winner,
          } satisfies typeof PendingResult.Type)
          const now = yield* Clock.currentTimeMillis
          yield* tx.setAlarm(now + 5000)
        } else if (room.mode === 'ranked') {
          yield* Option.match(nextAlarmMs(room), { onNone: () => tx.deleteAlarm(), onSome: (at) => tx.setAlarm(at) })
        }
      })
      const finalize = Effect.fn(function* () {
        const pending = yield* readPending(state.storage)
        if (pending === undefined) {
          return false
        }
        const { winner, matchId, winnerId, loserId } = pending
        const deltas = yield* ratings.getByName('global').recordRankedResult({ matchId, winnerId, loserId })
        return yield* state.storage.transaction((tx) =>
          Effect.gen(function* () {
            const current = yield* readRoom(tx)
            yield* tx.delete('pendingResult')
            yield* tx.deleteAlarm()
            if (
              deltas === null ||
              current === undefined ||
              current.matchId !== matchId ||
              current.ratingDeltas !== undefined
            ) {
              return false
            }
            yield* saveRoom(tx, {
              ...current,
              ratingDeltas:
                winner === 0 ? [deltas.winnerDelta, deltas.loserDelta] : [deltas.loserDelta, deltas.winnerDelta],
            })
            return true
          })
        )
      })
      const updatePresence = (seat: Seat, connected: boolean) =>
        state.storage.transaction((tx) =>
          Effect.gen(function* () {
            const current = yield* readRoom(tx)
            const nowMs = yield* Clock.currentTimeMillis
            if (current?.mode === 'ranked' && current.status === 'playing') {
              yield* persist(
                tx,
                connected ? markSeatConnected(current, seat) : markSeatDisconnected(current, seat, nowMs)
              )
            }
          })
        )

      const broadcast = Effect.fn(function* (closing?: Cloudflare.WebSocket) {
        const room = yield* readRoom(state.storage)
        if (room === undefined) {
          return
        }
        const sockets = yield* state.getWebSockets()
        const peers = yield* Effect.forEach(
          Arr.filter(sockets, (socket) => socket.ws !== closing?.ws && socket.ws.readyState === 1),
          (socket) =>
            socket.getAttachment(SocketAttachment).pipe(
              Effect.map(({ seat }) => ({ socket, seat })),
              Effect.orDie
            ),
          { concurrency: 1 }
        )
        const occupied = (seat: Seat) => Arr.some(peers, (peer) => Option.contains(peer.seat, seat))
        const connected: readonly [boolean, boolean] = [occupied(0), occupied(1)]
        yield* Effect.forEach(
          peers,
          (peer) =>
            send(peer.socket, buildSnapshot({ room, seat: peer.seat, connected })).pipe(
              Effect.catchCause(Effect.logWarning)
            ),
          { discard: true, concurrency: 1 }
        )
      })
      const closed = Effect.fn(function* (socket: Cloudflare.WebSocket) {
        const { seat } = yield* socket.getAttachment(SocketAttachment).pipe(Effect.orDie)
        if (Option.isSome(seat)) {
          const peers = yield* state.getWebSockets('seat-' + seat.value)
          if (Arr.some(peers, (peer) => peer.ws !== socket.ws && peer.ws.readyState === 1) === false) {
            yield* updatePresence(seat.value, false)
          }
        }
        yield* broadcast(socket)
      })
      return Effect.succeed({
        createRanked: (input: RankedRoomInput) =>
          state.storage.transaction((tx) =>
            Effect.gen(function* () {
              if ((yield* tx.get('room')) !== undefined) {
                return false
              }
              yield* persist(tx, createRankedRoom(input))
              return true
            })
          ),
        alarm: () =>
          Effect.gen(function* () {
            const outcome = yield* state.storage.transaction((tx) =>
              Effect.gen(function* () {
                const current = yield* readRoom(tx)
                if (current === undefined) {
                  return
                }
                const nowMs = yield* Clock.currentTimeMillis
                const result = yield* applyRankedAlarm(current, nowMs)
                yield* persist(tx, result.room)
                return result
              })
            )
            if (outcome !== undefined) {
              const rated = yield* finalize().pipe(
                Effect.catchCause((cause) =>
                  Effect.gen(function* () {
                    yield* Effect.logWarning(cause)
                    const now = yield* Clock.currentTimeMillis
                    yield* state.storage.setAlarm(now + 5000)
                    return false
                  })
                )
              )
              if (outcome.changed || rated) {
                yield* broadcast()
              }
            }
          }),
        create: (id: string, name: string, token: string, seed: number) =>
          state.storage.transaction((tx) =>
            Effect.gen(function* () {
              if ((yield* tx.get('room')) !== undefined) {
                return false
              }
              yield* saveRoom(tx, createRoom({ roomId: id, name, token, seed }))
              return true
            })
          ),
        join: (input: typeof JoinInput.Type, freshToken: string) =>
          state.storage
            .transaction((tx) =>
              Effect.gen(function* () {
                const room = yield* readRoom(tx)
                if (room === undefined) {
                  return undefined
                }
                const joined = joinRoom({ room, input, freshToken })
                if (joined.room !== room) {
                  yield* saveRoom(tx, joined.room)
                }
                return { admission: joined.admission, changed: joined.room !== room }
              })
            )
            .pipe(
              Effect.tap((result) => (result?.changed === true ? broadcast() : Effect.void)),
              Effect.map((result) => result?.admission)
            ),
        fetch: Effect.gen(function* () {
          const request = yield* Request.HttpServerRequest
          const room = yield* readRoom(state.storage)
          if (room === undefined) {
            return Response.empty({ status: 404 })
          }
          if (Str.toLowerCase(request.headers.upgrade ?? '') !== 'websocket') {
            return Response.empty({ status: 426 })
          }
          const seat = resolveSeat({
            room,
            token: Option.fromNullishOr(new URL(request.url, 'https://battleblocks.local').searchParams.get('token')),
          })
          const [response, socket] = yield* Cloudflare.upgrade({
            tags: [Option.match(seat, { onNone: () => 'spectator', onSome: (s) => 'seat-' + s })],
          }).pipe(Effect.provideService(Cloudflare.DurableObjectState, state))
          yield* socket.setAttachment(SocketAttachment, { seat }).pipe(Effect.orDie)
          if (Option.isSome(seat)) {
            yield* updatePresence(seat.value, true)
          }
          yield* broadcast()
          return response
        }),
        webSocketMessage: Effect.fn(function* (socket: Cloudflare.WebSocket, data: string | Uint8Array | ArrayBuffer) {
          const { seat } = yield* socket.getAttachment(SocketAttachment).pipe(Effect.orDie)
          const result = yield* state.storage.transaction((tx) =>
            Effect.gen(function* () {
              const room = yield* readRoom(tx)
              if (room === undefined) {
                return Option.some(ServerMessage.cases.ErrorNotice.make({ message: 'Room not found' }))
              }
              const outcome = yield* handleMessage(room, seat, data)
              if ('reply' in outcome) {
                return Option.some(outcome.reply)
              }
              yield* persist(tx, outcome.room)
              return Option.none<ServerMessage>()
            })
          )
          if (Option.isSome(result)) {
            yield* send(socket, result.value)
            return
          }
          yield* finalize().pipe(Effect.catchCause(Effect.logWarning))
          yield* broadcast()
        }),
        webSocketClose: closed,
        webSocketError: closed,
      })
    })
  )
) {}
