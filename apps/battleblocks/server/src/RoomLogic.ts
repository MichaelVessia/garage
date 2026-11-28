import {
  ClientMessage,
  DuelCommand,
  MatchMode,
  ForfeitReason,
  RatingDelta,
  forfeitMatch,
  DuelPhase,
  DuelState,
  Seat,
  ServerMessage,
  applyCommand,
  createMatch,
  projectView,
} from '@garage/battleblocks-domain'
import * as Arr from 'effect/Array'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as F from 'effect/Function'
import type * as Request from 'effect/http/HttpServerRequest'
import type * as Response from 'effect/http/HttpServerResponse'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Struct from 'effect/Struct'

import { Callsign } from './RatingsLogic.ts'

export const Name = Callsign
export const JoinInput = S.Struct({ name: S.optionalKey(Name), token: S.optionalKey(S.String) })
type JoinInput = typeof JoinInput.Type
export const RoomRecord = S.Struct({
  roomId: S.String,
  duel: DuelState,
  status: ServerMessage.cases.RoomSnapshot.fields.status,
  names: S.Tuple([S.String, S.String]),
  tokens: S.Tuple([S.String, S.NullOr(S.String)]),
  seq: S.Int,
  mode: S.optionalKey(MatchMode),
  matchId: S.optionalKey(S.String),
  seatPlayerIds: S.optionalKey(S.Tuple([S.String, S.String])),
  seatRatings: ServerMessage.cases.RoomSnapshot.fields.seatRatings,
  ratingDeltas: S.optionalKey(S.Tuple([RatingDelta, RatingDelta])),
  turnDeadlineMs: ServerMessage.cases.RoomSnapshot.fields.turnDeadlineMs,
  disconnectDeadlines: S.optionalKey(S.Tuple([S.NullOr(S.Finite), S.NullOr(S.Finite)])),
  forfeitReason: S.optionalKey(ForfeitReason),
})
export type RoomRecord = typeof RoomRecord.Type
export const Admission = S.Struct({ roomId: S.String, seat: S.NullOr(Seat), token: S.NullOr(S.String) })
type Admission = typeof Admission.Type
interface JoinResult {
  readonly room: RoomRecord
  readonly admission: Admission
}
export class RoomGateway extends Context.Service<
  RoomGateway,
  {
    readonly create: (id: string, name: string, token: string, seed: number) => Effect.Effect<boolean>
    readonly join: (id: string, input: JoinInput, freshToken: string) => Effect.Effect<Option.Option<Admission>>
    readonly connect: (id: string, request: Request.HttpServerRequest) => Effect.Effect<Response.HttpServerResponse>
  }
>()('@garage/battleblocks-server/RoomLogic/RoomGateway') {}

export const createRoom = ({
  roomId,
  name,
  token,
  seed,
}: {
  roomId: string
  name: string
  token: string
  seed: number
}): RoomRecord => ({
  roomId,
  duel: createMatch(seed, 0),
  status: 'waiting',
  names: [name, 'Duelist 2'],
  tokens: [token, null],
  seq: 0,
})

export const resolveSeat = ({
  room,
  token,
}: {
  room: RoomRecord
  token: Option.Option<string>
}): Option.Option<Seat> => {
  if (Option.contains(token, room.tokens[0])) {
    return Option.some(0)
  }
  return room.tokens[1] !== null && Option.contains(token, room.tokens[1]) ? Option.some(1) : Option.none()
}
const rename = (room: RoomRecord, seat: Seat, name: string): RoomRecord => ({
  ...room,
  names: seat === 0 ? [name, room.names[1]] : [room.names[0], name],
})
export const joinRoom = ({
  room,
  input,
  freshToken,
}: {
  room: RoomRecord
  input: JoinInput
  freshToken: string
}): JoinResult => {
  const { roomId } = room
  const seat = resolveSeat({ room, token: Option.fromNullishOr(input.token) })
  if (Option.isSome(seat)) {
    return {
      room: input.name === undefined ? room : rename(room, seat.value, input.name),
      admission: { roomId, seat: seat.value, token: room.tokens[seat.value] },
    }
  }
  if (room.tokens[1] === null) {
    return {
      room: {
        ...rename(room, 1, input.name ?? room.names[1]),
        status: 'playing',
        tokens: [room.tokens[0], freshToken],
      },
      admission: { roomId, seat: 1, token: freshToken },
    }
  }
  return { room, admission: { roomId, seat: null, token: null } }
}
export const buildSnapshot = ({
  room,
  seat,
  connected,
}: {
  room: RoomRecord
  seat: Option.Option<Seat>
  connected: readonly [boolean, boolean]
}) =>
  ServerMessage.cases.RoomSnapshot.make({
    roomId: room.roomId,
    seat,
    status: room.status,
    seatNames: room.names,
    connected,
    view: projectView(room.duel, seat),
    seq: room.seq,
    ...Struct.pick(room, ['mode', 'seatRatings', 'ratingDeltas', 'turnDeadlineMs', 'forfeitReason']),
  })

type Outcome = { readonly room: RoomRecord } | { readonly reply: ServerMessage }
const notice = (message: string): Outcome => ({ reply: ServerMessage.cases.ErrorNotice.make({ message }) })
export const handleMessage = Effect.fn(function* (
  room: RoomRecord,
  seat: Option.Option<Seat>,
  data: string | Uint8Array | ArrayBuffer,
  atMs?: number
): Effect.fn.Return<Outcome> {
  const text: unknown = typeof data === 'string' ? data : new TextDecoder().decode(data)
  const decoded = yield* S.decodeUnknownEffect(S.fromJsonString(ClientMessage))(text).pipe(Effect.option)
  if (Option.isNone(decoded)) {
    return notice('Invalid message')
  }
  const message = decoded.value
  if (ClientMessage.guards.Ping(message)) {
    return { reply: ServerMessage.cases.Pong.make({}) }
  }
  if (Option.isNone(seat)) {
    return notice('Spectators cannot change the room')
  }
  if (ClientMessage.guards.SetName(message)) {
    const name = yield* S.decodeEffect(Name)(message.name).pipe(Effect.option)
    return Option.isSome(name)
      ? { room: rename(room, seat.value, name.value) }
      : notice('Name must contain 1 to 20 characters')
  }
  if (room.status === 'waiting') {
    return notice('Waiting for opponent to join')
  }
  const nowMs = atMs ?? (yield* Clock.currentTimeMillis)
  return yield* applyCommand(room.duel, seat.value, message.command).pipe(
    Effect.match({
      onFailure: (error) => notice(error.reason),
      onSuccess: ({ state }): Outcome => {
        const base = { roomId: room.roomId, tokens: room.tokens, names: room.names, duel: state, seq: room.seq + 1 }
        if (room.mode === 'ranked' && DuelCommand.guards.Rematch(message.command)) {
          return { room: { ...base, mode: 'casual', status: 'playing' } }
        }
        const finished = DuelPhase.guards.MatchOver(state.phase)
        const next: RoomRecord = { ...room, ...base, status: finished ? 'finished' : 'playing' }
        if (room.mode !== 'ranked') {
          return { room: next }
        }
        return {
          room: finished
            ? { ...next, turnDeadlineMs: null, disconnectDeadlines: [null, null] }
            : {
                ...next,
                turnDeadlineMs:
                  nowMs +
                  (DuelPhase.guards.RoundOver(state.phase) ? RANKED_ROUND_OVER_TIMEOUT_MS : RANKED_TURN_TIMEOUT_MS),
              },
        }
      },
    })
  )
})
export const RANKED_TURN_TIMEOUT_MS = 45_000
export const RANKED_ROUND_OVER_TIMEOUT_MS = 10_000
export const RANKED_DISCONNECT_TIMEOUT_MS = 20_000
interface RankedPlayer {
  playerId: string
  callsign: string
  rating: number
  token: string
}
export interface RankedRoomInput {
  roomId: string
  matchId: string
  seed: number
  players: readonly [RankedPlayer, RankedPlayer]
  nowMs: number
}
export const createRankedRoom = ({
  roomId,
  matchId,
  seed,
  players: [first, second],
  nowMs,
}: RankedRoomInput): RoomRecord => ({
  roomId,
  matchId,
  duel: createMatch(seed, 0),
  mode: 'ranked',
  status: 'playing',
  seq: 0,
  names: [first.callsign, second.callsign],
  tokens: [first.token, second.token],
  seatPlayerIds: [first.playerId, second.playerId],
  seatRatings: [first.rating, second.rating],
  turnDeadlineMs: nowMs + RANKED_TURN_TIMEOUT_MS,
  disconnectDeadlines: [null, null],
})
export const nextAlarmMs = (room: RoomRecord) => {
  const deadlines = Arr.filter(
    [room.turnDeadlineMs, ...(room.disconnectDeadlines ?? [])],
    (n): n is number => typeof n === 'number'
  )
  return room.mode === 'ranked' && room.status === 'playing' && deadlines.length > 0
    ? Option.some(Math.min(...deadlines))
    : Option.none<number>()
}
const setDisconnect = (
  room: RoomRecord,
  seat: Seat,
  deadline: NonNullable<RoomRecord['disconnectDeadlines']>[Seat]
): RoomRecord => {
  if (room.mode !== 'ranked' || room.status !== 'playing') {
    return room
  }
  const [a, b] = room.disconnectDeadlines ?? [null, null]
  return { ...room, disconnectDeadlines: seat === 0 ? [deadline, b] : [a, deadline] }
}
export const markSeatConnected: {
  (seat: Seat): (room: RoomRecord) => RoomRecord
  (room: RoomRecord, seat: Seat): RoomRecord
} = F.dual(2, (room: RoomRecord, seat: Seat) => setDisconnect(room, seat, null))
export const markSeatDisconnected: {
  (seat: Seat, nowMs: number): (room: RoomRecord) => RoomRecord
  (room: RoomRecord, seat: Seat, nowMs: number): RoomRecord
} = F.dual(3, (room: RoomRecord, seat: Seat, nowMs: number) =>
  setDisconnect(room, seat, room.disconnectDeadlines?.[seat] ?? nowMs + RANKED_DISCONNECT_TIMEOUT_MS)
)
export const applyRankedAlarm = Effect.fn(function* (room: RoomRecord, nowMs: number) {
  const unchanged = { room, changed: false }
  if (room.mode !== 'ranked' || room.status !== 'playing') {
    return unchanged
  }
  const lose = (seat: Seat, reason: ForfeitReason) => ({
    changed: true,
    room: {
      ...room,
      duel: forfeitMatch(room.duel, seat === 0 ? 1 : 0),
      status: 'finished',
      forfeitReason: reason,
      disconnectDeadlines: [null, null],
      turnDeadlineMs: null,
      seq: room.seq + 1,
    } satisfies RoomRecord,
  })
  const [a, b] = room.disconnectDeadlines ?? [null, null]
  if (a !== null && a <= nowMs && (b === null || a <= b)) {
    return lose(0, 'disconnect')
  }
  if (b !== null && b <= nowMs) {
    return lose(1, 'disconnect')
  }
  if (room.turnDeadlineMs === null || room.turnDeadlineMs === undefined || room.turnDeadlineMs > nowMs) {
    return unchanged
  }
  const phase = room.duel.phase
  if (DuelPhase.guards.AwaitAction(phase)) {
    return lose(phase.active, 'timeout')
  }
  if (DuelPhase.guards.AwaitDefense(phase)) {
    return lose(phase.defender, 'timeout')
  }
  if (DuelPhase.guards.RoundOver(phase)) {
    const { state } = yield* applyCommand(room.duel, 0, DuelCommand.cases.StartNextRound.make({})).pipe(Effect.orDie)
    return {
      changed: true,
      room: { ...room, duel: state, turnDeadlineMs: nowMs + RANKED_TURN_TIMEOUT_MS, seq: room.seq + 1 },
    }
  }
  return unchanged
})
