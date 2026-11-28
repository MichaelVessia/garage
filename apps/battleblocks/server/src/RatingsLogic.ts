import { STARTING_RATING, computeEloUpdate, PlayerProfile, RatingDelta } from '@garage/battleblocks-domain'
import type { DeviceSession, DeviceLinkResponse, LeaderboardResponse } from '@garage/battleblocks-domain'
import * as Arr from 'effect/Array'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import type * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

export const Callsign = S.Trim.check(S.isMinLength(1), S.isMaxLength(20))
export const LINK_CODE_TTL_MS = 5 * 60 * 1000
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const codeFromBytes = (bytes: Uint8Array) =>
  Arr.join(
    Array.from(bytes, (byte) => alphabet[byte % alphabet.length] ?? ''),
    ''
  )
export type Claim = { status: 'ok'; session: DeviceSession } | { status: 'not_found' } | { status: 'expired' }
export class RatingsGateway extends Context.Service<
  RatingsGateway,
  {
    register(callsign?: string): Effect.Effect<DeviceSession>
    authenticate(token: string): Effect.Effect<Option.Option<PlayerProfile>>
    updateCallsign(token: string, callsign: string): Effect.Effect<Option.Option<PlayerProfile>>
    createDeviceLink(token: string): Effect.Effect<Option.Option<DeviceLinkResponse>>
    claimDeviceLink(code: string): Effect.Effect<Claim>
    leaderboard(viewerPlayerId: Option.Option<string>): Effect.Effect<LeaderboardResponse>
  }
>()('@garage/battleblocks-server/RatingsLogic/RatingsGateway') {}
const newProfile = ({ playerId, callsign }: Pick<PlayerProfile, 'playerId' | 'callsign'>): PlayerProfile => ({
  playerId,
  callsign,
  rating: STARTING_RATING,
  peakRating: STARTING_RATING,
  wins: 0,
  losses: 0,
  streak: 0,
})
export const buildLeaderboard = ({
  profiles,
  viewerId,
}: {
  profiles: ReadonlyArray<PlayerProfile>
  viewerId: Option.Option<string>
}): LeaderboardResponse => {
  const ranked = Arr.filter(profiles, (p) => p.wins + p.losses > 0).sort(
    (a, b) =>
      b.rating - a.rating || b.wins - a.wins || Str.Order(a.callsign, b.callsign) || Str.Order(a.playerId, b.playerId)
  )
  const entry = (profile: PlayerProfile, index: number) => ({
    ...profile,
    rank: index + 1,
    isViewer: Option.contains(viewerId, profile.playerId),
  })
  const viewer = Option.getOrUndefined(Arr.findFirst(profiles, (p) => Option.contains(viewerId, p.playerId)))
  return {
    totalPlayers: ranked.length,
    entries: Arr.map(ranked.slice(0, 50), entry),
    viewer: viewer === undefined ? null : entry(viewer, ranked.indexOf(viewer)),
  }
}
const Result = S.Struct({ winnerDelta: RatingDelta, loserDelta: RatingDelta })
const Link = S.Struct({ playerId: S.String, expiresAtMs: S.Finite })
const rateMatch = ({ winner, loser }: { winner: PlayerProfile; loser: PlayerProfile }) => {
  const { winner: w, loser: l } = computeEloUpdate({
    winnerRating: winner.rating,
    loserRating: loser.rating,
    winnerGames: winner.wins + winner.losses,
    loserGames: loser.wins + loser.losses,
  })
  return {
    result: { winnerDelta: w, loserDelta: l },
    winner: {
      ...winner,
      rating: w.after,
      peakRating: Math.max(winner.peakRating, w.after),
      wins: winner.wins + 1,
      streak: Math.max(0, winner.streak) + 1,
    },
    loser: { ...loser, rating: l.after, losses: loser.losses + 1, streak: Math.min(0, loser.streak) - 1 },
  }
}

interface RatingsTransaction<R> {
  get(key: string): Effect.Effect<unknown, never, R>
  put(
    entries: Record<string, string | PlayerProfile | typeof Result.Type | typeof Link.Type>
  ): Effect.Effect<void, never, R>
  delete(key: string): Effect.Effect<boolean, never, R>
}
interface RatingsStorage<R> {
  transaction<A>(body: (tx: RatingsTransaction<R>) => Effect.Effect<A, never, R>): Effect.Effect<A, never, R>
  players: Effect.Effect<ReadonlyArray<PlayerProfile>, never, R>
}
const read = Effect.fn(function* <R, A extends S.ConstraintDecoder<unknown, never>>(
  tx: RatingsTransaction<R>,
  schema: A,
  key: string
) {
  const raw = yield* tx.get(key)
  return raw === undefined ? undefined : yield* S.decodeEffect(schema)(raw).pipe(Effect.orDie)
})
const byToken = Effect.fn(function* <R>(tx: RatingsTransaction<R>, token: string) {
  const id = yield* read(tx, S.String, 'session:' + token)
  return id === undefined
    ? Option.none<PlayerProfile>()
    : yield* read(tx, PlayerProfile, 'player:' + id).pipe(Effect.map(Option.fromNullishOr))
})
export function ratingsRepository<R>({
  storage,
  random,
}: {
  storage: RatingsStorage<R>
  random: SecureRandom.SecureRandom['Service']
}) {
  return {
    register: Effect.fn(function* (callsign?: string) {
      const playerId = yield* random.uuidV4()
      const name = callsign ?? 'Knight-' + (yield* random.randomBytes(4).pipe(Effect.map(codeFromBytes)))
      const profile = newProfile({ playerId, callsign: name })
      const token = yield* random.uuidV4()
      yield* storage.transaction((tx) =>
        tx.put({ ['player:' + profile.playerId]: profile, ['session:' + token]: profile.playerId })
      )
      return { profile, token }
    }),
    authenticate: (token: string) => storage.transaction((tx) => byToken(tx, token)),
    updateCallsign: (token: string, callsign: string) =>
      storage.transaction((tx) =>
        Effect.gen(function* () {
          const profile = yield* byToken(tx, token)
          if (Option.isNone(profile)) {
            return Option.none<PlayerProfile>()
          }
          const updated = { ...profile.value, callsign }
          yield* tx.put({ ['player:' + profile.value.playerId]: updated })
          return Option.some(updated)
        })
      ),
    createDeviceLink: (token: string) =>
      storage.transaction((tx) =>
        Effect.gen(function* () {
          const profile = yield* byToken(tx, token)
          if (Option.isNone(profile)) {
            return Option.none<DeviceLinkResponse>()
          }
          let code = yield* random.randomBytes(6).pipe(Effect.map(codeFromBytes))
          while ((yield* tx.get('link:' + code)) !== undefined) {
            code = yield* random.randomBytes(6).pipe(Effect.map(codeFromBytes))
          }
          const expiresAtMs = (yield* Clock.currentTimeMillis) + LINK_CODE_TTL_MS
          yield* tx.put({ ['link:' + code]: { playerId: profile.value.playerId, expiresAtMs } })
          return Option.some({ code, expiresAtMs })
        })
      ),
    claimDeviceLink: (code: string) =>
      storage.transaction((tx) =>
        Effect.gen(function* () {
          const key = 'link:' + Str.toUpperCase(Str.trim(code))
          const link = yield* read(tx, Link, key)
          if (link === undefined) {
            return { status: 'not_found' } satisfies Claim
          }
          yield* tx.delete(key)
          if ((yield* Clock.currentTimeMillis) >= link.expiresAtMs) {
            return { status: 'expired' } satisfies Claim
          }
          const profile = yield* read(tx, PlayerProfile, 'player:' + link.playerId)
          if (profile === undefined) {
            return { status: 'not_found' } satisfies Claim
          }
          const token = yield* random.uuidV4()
          yield* tx.put({ ['session:' + token]: profile.playerId })
          return { status: 'ok', session: { token, profile } } satisfies Claim
        })
      ),
    leaderboard: Effect.fn(function* (viewer: Option.Option<string>) {
      const players = yield* storage.players
      return buildLeaderboard({ profiles: players, viewerId: viewer })
    }),
    recordRankedResult: (input: { matchId: string; winnerId: string; loserId: string }) =>
      storage.transaction((tx) =>
        Effect.gen(function* () {
          const key = 'match:' + input.matchId
          const existing = yield* read(tx, Result, key)
          if (existing !== undefined) {
            return Option.some(existing)
          }
          if (input.winnerId === input.loserId) {
            return Option.none<typeof Result.Type>()
          }
          const winner = yield* read(tx, PlayerProfile, 'player:' + input.winnerId)
          const loser = yield* read(tx, PlayerProfile, 'player:' + input.loserId)
          if (winner === undefined || loser === undefined) {
            return Option.none<typeof Result.Type>()
          }
          const update = rateMatch({ winner, loser })
          yield* tx.put({
            [key]: update.result,
            ['player:' + winner.playerId]: update.winner,
            ['player:' + loser.playerId]: update.loser,
          })
          return Option.some(update.result)
        })
      ),
  }
}
