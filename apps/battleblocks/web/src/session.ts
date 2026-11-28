import {
  ClientMessage,
  DuelPhase,
  Seat,
  QueueClientMessage,
  QueueServerMessage,
  ServerMessage,
  applyCommand,
  chooseBotCommand,
  createMatch,
  projectView,
} from '@garage/battleblocks-domain'
import type { DuelCommand, PlayerView } from '@garage/battleblocks-domain'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

import { buildRoomShareUrl } from './arenaMath.ts'

const RoomAdmission = S.Struct({ roomId: S.String, seat: S.NullOr(Seat), token: S.NullOr(S.String) })
const admission = S.decodeUnknownOption(RoomAdmission)
const decode = S.decodeUnknownOption(S.fromJsonString(ServerMessage))
const encode = S.encodeOption(S.fromJsonString(ClientMessage))
const joinBody = S.encodeOption(S.fromJsonString(S.Struct({ token: S.optional(S.String), name: S.optional(S.String) })))
const key = (id: string) => 'battleblocks.seat.' + id
function rememberSeat(room: typeof RoomAdmission.Type) {
  if (room.token === null) {
    return
  }
  try {
    localStorage.setItem(key(room.roomId), room.token)
  } catch {
    // The current connection can still use its token when storage is unavailable.
  }
}
type Network = { socket?: WebSocket }
export type Snapshot = {
  ranked: boolean
  seatRatings?: (typeof ServerMessage.cases.RoomSnapshot.Type)['seatRatings']
  ratingDeltas?: (typeof ServerMessage.cases.RoomSnapshot.Type)['ratingDeltas']
  turnDeadlineMs?: (typeof ServerMessage.cases.RoomSnapshot.Type)['turnDeadlineMs']
  forfeitReason?: (typeof ServerMessage.cases.RoomSnapshot.Type)['forfeitReason']
  view: PlayerView
  mode: string
  names: readonly [string, string]
  events: boolean
}
type Controls = { send: (command: DuelCommand) => void; close: () => void }
const idle: Controls = { send: () => {}, close: () => {} }

export function createDuelSession({
  show,
  notice,
  autoRound,
  onRankedFinished,
}: {
  show: (snapshot: Snapshot) => void
  notice: (text: string) => void
  onRankedFinished?: () => void
  autoRound: () => boolean
}) {
  const current = { controls: idle, generation: 0 }
  function reset() {
    current.generation += 1
    current.controls.close()
    current.controls = idle
    return current.generation
  }
  function practice() {
    reset()
    const url = new URL(location.href)
    url.searchParams.delete('room')
    history.replaceState({}, '', url)
    const local = { match: createMatch(crypto.getRandomValues(new Uint32Array(1))[0] ?? 1), timer: 0 }
    function act(seat: Seat, command: DuelCommand) {
      const next = Effect.runSyncExit(applyCommand(local.match, seat, command))
      if (Exit.isSuccess(next)) {
        local.match = next.value.state
        render()
      }
    }
    function render() {
      clearTimeout(local.timer)
      const view = projectView(local.match, Option.some(0))
      show({ ranked: false, view, names: ['You', 'Practice bot'], mode: 'Bot practice', events: true })
      if (DuelPhase.guards.MatchOver(view.phase)) {
        return
      }
      const roundOver = DuelPhase.guards.RoundOver(view.phase)
      if (roundOver && autoRound() === false) {
        return
      }
      local.timer = window.setTimeout(
        () => {
          if (roundOver && autoRound() === false) {
            return
          }
          Option.map(chooseBotCommand(local.match, 1), (cmd) => act(1, cmd))
        },
        roundOver ? 1600 : 530
      )
    }
    current.controls = { send: (cmd) => act(0, cmd), close: () => clearTimeout(local.timer) }
    render()
  }

  function online(code?: string, name?: string) {
    const normalized = code === undefined ? undefined : Str.toUpperCase(Str.trim(code))
    const generation = reset()
    const active = () => generation === current.generation
    const abort = new AbortController()
    current.controls = { send: idle.send, close: () => abort.abort() }
    notice('Connecting to room…')
    return Promise.resolve()
      .then(() => {
        const token = normalized === undefined ? undefined : (localStorage.getItem(key(normalized)) ?? undefined)
        return window.fetch(normalized === undefined ? '/api/rooms' : '/api/rooms/' + normalized + '/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: Option.getOrElse(joinBody({ token, name }), () => '{}'),
          signal: abort.signal,
        })
      })
      .then((response) => {
        if (response.ok === false) {
          throw new Error('Room request failed (' + response.status + ').')
        }
        return response.json()
      })
      .then((raw: unknown) => {
        const result = admission(raw)
        if (active() === false) {
          return
        }
        if (Option.isNone(result)) {
          throw new Error('Invalid room response.')
        }
        rememberSeat(result.value)
        connectRoom(result.value)
      })
      .catch((error: unknown) => {
        if (active()) {
          notice(String(error))
        }
      })
  }
  function connectRoom(room: typeof RoomAdmission.Type) {
    const generation = reset()
    const active = () => current.generation === generation
    const timers = { retry: 0, ping: 0, attempt: 0, seq: -1, pending: false }
    const network: Network = {}
    let finished = false
    current.controls = {
      send(command) {
        if (timers.seq >= 0 && timers.pending === false && network.socket?.readyState === WebSocket.OPEN) {
          const message = encode(ClientMessage.cases.Command.make({ command }))
          if (Option.isNone(message)) {
            notice('Invalid command.')
            return
          }
          network.socket.send(message.value)
          timers.pending = true
        }
      },
      close() {
        clearTimeout(timers.retry)
        clearInterval(timers.ping)
        network.socket?.close()
      },
    }
    history.replaceState({}, '', buildRoomShareUrl(location.href, room.roomId))
    const url = new URL('/api/rooms/' + room.roomId + '/ws', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (room.token !== null) {
      url.searchParams.set('token', room.token)
    }
    function connect() {
      if (active() === false) {
        return
      }
      const socket = new WebSocket(url)
      network.socket = socket
      socket.onopen = () => {
        if (active() === false) {
          return
        }
        timers.ping = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            Option.map(encode(ClientMessage.cases.Ping.make({})), (msg) => socket.send(msg))
          }
        }, 25_000)
      }
      socket.onmessage = (event) => {
        if (active() === false) {
          return
        }
        const parsed = decode(event.data)
        if (Option.isNone(parsed)) {
          notice('Invalid room message.')
          return
        }
        ServerMessage.match(parsed.value, {
          Pong: () => {},
          ErrorNotice: ({ message }) => {
            timers.pending = false
            notice(message)
          },
          RoomSnapshot: (snap) => {
            timers.attempt = 0
            timers.pending = false
            const waiting = snap.status === 'waiting'
            const spectator = Option.isNone(snap.seat)
            show({
              view: waiting ? { ...snap.view, legalCommands: [] } : snap.view,
              names: snap.seatNames,
              ranked: snap.mode === 'ranked',
              seatRatings: snap.seatRatings,
              ratingDeltas: snap.ratingDeltas,
              turnDeadlineMs: snap.turnDeadlineMs,
              forfeitReason: snap.forfeitReason,
              mode: (snap.mode === 'ranked' ? '★ Ranked' : 'Room ' + room.roomId) + (spectator ? ' · Spectator' : ''),
              events: snap.seq > timers.seq,
            })
            if (
              snap.mode === 'ranked' &&
              snap.status === 'finished' &&
              snap.ratingDeltas !== undefined &&
              finished === false
            ) {
              finished = true
              onRankedFinished?.()
            }
            timers.seq = snap.seq
            notice(
              waiting
                ? 'Waiting for an opponent. Copy the invite link.'
                : snap.connected.includes(false)
                  ? 'A duelist is offline.'
                  : ''
            )
          },
        })
      }
      socket.onclose = () => {
        if (active() === false) {
          return
        }
        clearInterval(timers.ping)
        notice('Connection lost. Reconnecting…')
        timers.retry = window.setTimeout(connect, Math.min(15_000, 500 * 2 ** timers.attempt))
        timers.attempt += 1
      }
    }
    connect()
  }
  type QueueControl = { stop?: () => void }
  const queue: QueueControl = {}
  function quickMatch({
    sessionToken,
    onQueueUpdate,
    onMatched,
    onQueueClosed,
  }: {
    sessionToken: string
    onQueueUpdate: (msg: typeof QueueServerMessage.cases.Queued.Type) => void
    onMatched: (msg: typeof QueueServerMessage.cases.Matched.Type) => void
    onQueueClosed: (message: string) => void
  }) {
    const generation = reset()
    const url = new URL('/api/queue/ws', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('session', sessionToken)
    const socket = new WebSocket(url)
    let ping = 0
    function send(msg: QueueClientMessage) {
      if (socket.readyState === WebSocket.OPEN) {
        Option.map(S.encodeOption(S.fromJsonString(QueueClientMessage))(msg), (text) => socket.send(text))
      }
    }
    function close() {
      delete queue.stop
      clearInterval(ping)
      socket.close()
    }
    function cancel() {
      send(QueueClientMessage.cases.Cancel.make({}))
      reset()
    }
    function closed(message: string) {
      if (current.generation === generation) {
        reset()
        onQueueClosed(message)
      }
    }
    queue.stop = cancel
    current.controls = { send: idle.send, close }
    socket.onopen = () => {
      if (current.generation === generation) {
        ping = window.setInterval(() => send(QueueClientMessage.cases.Ping.make({})), 20_000)
      }
    }
    socket.onclose = () => closed('Queue connection closed.')
    socket.onmessage = (event) => {
      if (current.generation !== generation) {
        return
      }
      const msg = S.decodeUnknownOption(S.fromJsonString(QueueServerMessage))(event.data)
      if (Option.isNone(msg)) {
        closed('Invalid queue message.')
        return
      }
      QueueServerMessage.match(msg.value, {
        Queued: onQueueUpdate,
        Matched: (match) => {
          rememberSeat(match)
          onMatched(match)
          connectRoom(match)
        },
        Cancelled: () => closed('Matchmaking cancelled.'),
        ErrorNotice: ({ message }) => closed(message),
        Pong: () => {},
      })
    }
  }
  return {
    practice,
    online,
    quickMatch,
    cancelQueue: () => queue.stop?.(),
    send: (command: DuelCommand) => current.controls.send(command),
  }
}
