import { canMatchRatings, matchmakingWindow, QueueServerMessage } from '@garage/battleblocks-domain'
import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import * as F from 'effect/Function'
import type * as Request from 'effect/http/HttpServerRequest'
import type * as Response from 'effect/http/HttpServerResponse'
import * as MutableHashSet from 'effect/MutableHashSet'
import * as Option from 'effect/Option'

export const QUEUE_TICK_MS = 5000
export interface QueueEntry {
  id: string
  playerId: string
  callsign: string
  rating: number
  joinedAtMs: number
}
interface Pairing<T extends QueueEntry> {
  pairs: ReadonlyArray<readonly [T, T]>
  waiting: ReadonlyArray<T>
}
export const selectQueuePairs: {
  (nowMs: number): <T extends QueueEntry>(entries: ReadonlyArray<T>) => Pairing<T>
  <T extends QueueEntry>(entries: ReadonlyArray<T>, nowMs: number): Pairing<T>
} = F.dual(2, <T extends QueueEntry>(entries: ReadonlyArray<T>, nowMs: number) => {
  const ordered = Array.from(entries).sort((a, b) => a.joinedAtMs - b.joinedAtMs)
  const used = MutableHashSet.empty<string>()
  const pairs: Array<readonly [T, T]> = []
  for (const a of ordered) {
    if (MutableHashSet.has(used, a.id)) {
      continue
    }
    let closest = Option.none<T>()
    for (const b of ordered) {
      if (MutableHashSet.has(used, b.id) || a.playerId === b.playerId) {
        continue
      }
      if (
        canMatchRatings({
          ratingA: a.rating,
          waitMsA: nowMs - a.joinedAtMs,
          ratingB: b.rating,
          waitMsB: nowMs - b.joinedAtMs,
        }) &&
        (Option.isNone(closest) || Math.abs(a.rating - b.rating) < Math.abs(a.rating - closest.value.rating))
      ) {
        closest = Option.some(b)
      }
    }
    if (Option.isSome(closest)) {
      MutableHashSet.add(used, a.id)
      MutableHashSet.add(used, closest.value.id)
      pairs.push([a, closest.value])
    }
  }
  return { pairs, waiting: Arr.filter(ordered, (entry) => MutableHashSet.has(used, entry.id) === false) }
})
export const buildQueuedStatus: {
  (
    position: number,
    waitingCount: number,
    nowMs: number
  ): (entry: QueueEntry) => typeof QueueServerMessage.cases.Queued.Type
  (
    entry: QueueEntry,
    position: number,
    waitingCount: number,
    nowMs: number
  ): typeof QueueServerMessage.cases.Queued.Type
} = F.dual(4, (entry: QueueEntry, position: number, waitingCount: number, nowMs: number) =>
  QueueServerMessage.cases.Queued.make({
    position,
    waitingCount,
    rating: entry.rating,
    window: Option.getOrNull(matchmakingWindow(nowMs - entry.joinedAtMs)),
  })
)
export class QueueGateway extends Context.Service<
  QueueGateway,
  { connect: (request: Request.HttpServerRequest) => Effect.Effect<Response.HttpServerResponse> }
>()('@garage/battleblocks-server/QueueLogic/QueueGateway') {}
