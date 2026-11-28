import * as Cloudflare from '@alchemy.run/cloudflare'
import { PlayerProfile } from '@garage/battleblocks-domain'
import type { RuntimeContext } from 'alchemy/RuntimeContext'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

import { ratingsRepository } from './RatingsLogic.ts'

export default class RatingsObject extends Cloudflare.DurableObject<RatingsObject>()(
  'RatingsObject',
  Effect.map(Cloudflare.DurableObjectState, ({ storage }) =>
    Effect.gen(function* () {
      const services = yield* Layer.build(SecureRandom.layerWebCrypto)
      const random = yield* SecureRandom.SecureRandom.pipe(Effect.provide(services))
      const ratings = ratingsRepository<RuntimeContext>({
        random,
        storage: {
          transaction: (body) => storage.transaction((tx) => body(tx)).pipe(Effect.orDie),
          players: storage.list({ prefix: 'player:' }).pipe(
            Effect.flatMap((values) => S.decodeUnknownEffect(S.Array(PlayerProfile))(Array.from(values.values()))),
            Effect.orDie
          ),
        },
      })
      return {
        ...ratings,
        authenticate: (token: string) => ratings.authenticate(token).pipe(Effect.map(Option.getOrNull)),
        updateCallsign: (token: string, name: string) =>
          ratings.updateCallsign(token, name).pipe(Effect.map(Option.getOrNull)),
        createDeviceLink: (token: string) => ratings.createDeviceLink(token).pipe(Effect.map(Option.getOrNull)),
        leaderboard: (viewerId?: string) => ratings.leaderboard(Option.fromNullishOr(viewerId)),
        recordRankedResult: (input: Parameters<typeof ratings.recordRankedResult>[0]) =>
          ratings.recordRankedResult(input).pipe(Effect.map(Option.getOrNull)),
      }
    })
  )
) {}
