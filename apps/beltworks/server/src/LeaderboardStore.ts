import { leaderboardEligible } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as S from 'effect/Schema'

export const PlayerEntry = S.Struct({
  playerId: S.String,
  callsign: S.String,
  ascensions: S.Int,
  totalCores: S.Int,
  milestone: S.Int,
  medals: S.Int,
  bestRunTicks: S.OptionFromNullOr(S.Int),
  verifiedThroughput: S.Int,
  shareId: S.OptionFromNullOr(S.String),
  updatedAtMs: S.Int,
})
export type PlayerEntry = typeof PlayerEntry.Type

export const encodeEntry = (entry: PlayerEntry): typeof PlayerEntry.Encoded => ({
  ...entry,
  bestRunTicks: Option.getOrNull(entry.bestRunTicks),
  shareId: Option.getOrNull(entry.shareId),
})

const publicEntry = (entry: PlayerEntry, viewer: string) => {
  const { playerId, ...publicFields } = encodeEntry(entry)
  return { ...publicFields, isYou: playerId === viewer }
}

function rankPlayers(entries: Iterable<PlayerEntry>) {
  const foundryRank = Arr.filter(entries, (entry) =>
    leaderboardEligible({ milestoneIndex: entry.milestone - 1, ascensions: entry.ascensions })
  ).sort(
    (a, b) =>
      b.ascensions - a.ascensions ||
      b.totalCores - a.totalCores ||
      b.milestone - a.milestone ||
      b.verifiedThroughput - a.verifiedThroughput ||
      Order.String(a.playerId, b.playerId)
  )
  return {
    foundryRank,
    fastestM8: Arr.filter(foundryRank, (p) => Option.isSome(p.bestRunTicks)).sort(
      (a, b) => Option.getOrElse(a.bestRunTicks, () => Infinity) - Option.getOrElse(b.bestRunTicks, () => Infinity)
    ),
    throughput: Arr.filter(foundryRank, (p) => p.verifiedThroughput > 0).sort(
      (a, b) => b.verifiedThroughput - a.verifiedThroughput
    ),
  }
}

export function readBoards({ entries, viewer }: { entries: Iterable<PlayerEntry>; viewer: string }) {
  const boards = rankPlayers(entries)
  const top = (rows: Array<PlayerEntry>) => Arr.map(rows.slice(0, 50), (row) => publicEntry(row, viewer))
  return {
    foundryRank: top(boards.foundryRank),
    fastestM8: top(boards.fastestM8),
    throughput: top(boards.throughput),
    totalPlayers: boards.foundryRank.length,
  }
}

export function updateBoards({
  players,
  incoming,
  clearShare = false,
}: {
  players: ReadonlyMap<string, PlayerEntry>
  incoming: PlayerEntry
  clearShare?: boolean
}) {
  const prior = players.get(incoming.playerId)
  const priorTime = prior?.bestRunTicks ?? Option.none<number>()
  const updated = {
    ...incoming,
    bestRunTicks: Option.isNone(incoming.bestRunTicks)
      ? priorTime
      : Option.some(
          Math.min(
            incoming.bestRunTicks.value,
            Option.getOrElse(priorTime, () => Infinity)
          )
        ),
    shareId: clearShare
      ? Option.none<string>()
      : Option.orElse(incoming.shareId, () => prior?.shareId ?? Option.none<string>()),
    verifiedThroughput: Math.max(incoming.verifiedThroughput, prior?.verifiedThroughput ?? 0),
  }
  const others = Arr.filter(players.values(), (entry) => entry.playerId !== updated.playerId)
  const boards = rankPlayers([...others, updated])
  const rank = (rows: Array<PlayerEntry>) => {
    const index = rows.indexOf(updated)
    return index < 0 ? null : index + 1
  }
  return {
    updated,
    result: {
      entry: publicEntry(updated, updated.playerId),
      ranks: {
        foundryRank: rank(boards.foundryRank),
        fastestM8: rank(boards.fastestM8),
        throughput: rank(boards.throughput),
      },
    },
  }
}

export class LeaderboardStore extends Context.Service<
  LeaderboardStore,
  {
    readonly list: (viewer: string) => Effect.Effect<ReturnType<typeof readBoards>>
    readonly submit: (
      entry: PlayerEntry,
      clearShare: boolean
    ) => Effect.Effect<ReturnType<typeof updateBoards>['result']>
  }
>()('@garage/beltworks-server/LeaderboardStore') {}
