import * as Cloudflare from '@alchemy.run/cloudflare'
import { RuntimeContext } from 'alchemy/RuntimeContext'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { router } from './BattleblocksRouter.ts'
import DuelRoomObject from './DuelRoomObject.ts'
import { QueueGateway } from './QueueLogic.ts'
import QueueObject from './QueueObject.ts'
import { RatingsGateway } from './RatingsLogic.ts'
import RatingsObject from './RatingsObject.ts'
import { RoomGateway } from './RoomLogic.ts'

export default class BattleblocksWorker extends Cloudflare.Worker<BattleblocksWorker>()(
  'BattleblocksWorker',
  { main: import.meta.url, compatibility: { flags: ['nodejs_compat'] } },
  Effect.gen(function* () {
    const services = yield* Layer.build(SecureRandom.layerWebCrypto)
    const ratingsObject = yield* RatingsObject
    const queue = yield* QueueObject
    const rooms = yield* DuelRoomObject
    return {
      fetch: Effect.gen(function* () {
        const context = yield* RuntimeContext
        const ratings = ratingsObject.getByName('global')
        const rpc = <A, E>(operation: Effect.Effect<A, E, RuntimeContext>) =>
          operation.pipe(Effect.provideService(RuntimeContext, context), Effect.orDie)
        return yield* router.pipe(
          Effect.provideService(RatingsGateway, {
            register: (name) => rpc(ratings.register(name)),
            authenticate: (token) => rpc(ratings.authenticate(token)).pipe(Effect.map(Option.fromNullishOr)),
            updateCallsign: (token, name) =>
              rpc(ratings.updateCallsign(token, name)).pipe(Effect.map(Option.fromNullishOr)),
            createDeviceLink: (token) => rpc(ratings.createDeviceLink(token)).pipe(Effect.map(Option.fromNullishOr)),
            claimDeviceLink: (code) => rpc(ratings.claimDeviceLink(code)),
            leaderboard: (id) => rpc(ratings.leaderboard(Option.getOrUndefined(id))),
          }),
          Effect.provideService(QueueGateway, {
            connect: (req) => queue.getByName('global').fetch(req).pipe(Effect.orDie),
          }),
          Effect.provideService(RoomGateway, {
            create: (id, name, token, seed) =>
              rooms
                .getByName(id)
                .create(id, name, token, seed)
                .pipe(Effect.provideService(RuntimeContext, context), Effect.orDie),
            join: (id, input, token) =>
              rooms
                .getByName(id)
                .join(input, token)
                .pipe(Effect.map(Option.fromNullishOr), Effect.provideService(RuntimeContext, context), Effect.orDie),
            connect: (id, request) => rooms.getByName(id).fetch(request).pipe(Effect.orDie),
          }),
          Effect.provide(services)
        )
      }),
    }
  })
) {}
