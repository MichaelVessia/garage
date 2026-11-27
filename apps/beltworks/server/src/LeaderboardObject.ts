import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'

import { encodeEntry, PlayerEntry, readBoards, updateBoards } from './LeaderboardStore.ts'

const decodeEntries = S.decodeUnknownEffect(S.ReadonlyMap(S.String, PlayerEntry))

export default class LeaderboardObject extends Cloudflare.DurableObject<LeaderboardObject>()(
  'LeaderboardObject',
  Effect.map(Cloudflare.DurableObjectState, ({ storage }) =>
    Effect.succeed({
      list: (viewer: string) =>
        storage.list().pipe(
          Effect.flatMap(decodeEntries),
          Effect.map((rows) => readBoards({ entries: rows.values(), viewer })),
          Effect.orDie
        ),
      submit: (entry: typeof PlayerEntry.Encoded, clearShare: boolean) =>
        storage
          .transaction((tx) =>
            Effect.gen(function* () {
              const rows = yield* tx.list().pipe(Effect.flatMap(decodeEntries))
              const incoming = yield* S.decodeEffect(PlayerEntry)(entry)
              const { updated, result } = updateBoards({
                players: rows,
                incoming,
                clearShare,
              })
              yield* tx.put(entry.playerId, encodeEntry(updated))
              return result
            })
          )
          .pipe(Effect.orDie),
    })
  )
) {}
