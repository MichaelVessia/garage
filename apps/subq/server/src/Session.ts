// @effect-diagnostics-next-line nodeBuiltinImport:off -- Worker Node compatibility provides a native constant-time comparison.
import { createHash, timingSafeEqual } from 'node:crypto'

import type { Actor } from '@garage/subq-domain/Actor'
import { owner, system } from '@garage/subq-domain/Actor'
import { CurrentActor } from '@garage/subq-domain/CurrentActor.context'
import { Session, Unauthorized } from '@garage/subq-domain/Session.middleware'
import { ALCHEMY_DEV } from 'alchemy'
import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Fn from 'effect/Function'
import * as Cookies from 'effect/http/Cookies'
import type * as Headers from 'effect/http/Headers'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Str from 'effect/String'

import { AccessJwt } from './AccessJwt.ts'

const digest = (value: string) => createHash('sha256').update(value).digest()
const optionalText = (name: string) =>
  Config.String(name).pipe(Config.option, Config.map(Option.filter(Str.isNonEmpty)))

export class SessionAuthentication extends Context.Service<
  SessionAuthentication,
  {
    readonly authenticate: (headers: Headers.Headers) => Effect.Effect<Actor, Unauthorized>
  }
>()('@garage/subq-server/Session/SessionAuthentication', {
  make: Effect.gen(function* () {
    const jwt = yield* AccessJwt
    const dev = yield* ALCHEMY_DEV
    const { teamDomain, audience, ownerEmail, apiToken } = yield* Config.all({
      teamDomain: optionalText('CF_ACCESS_TEAM_DOMAIN'),
      audience: optionalText('CF_ACCESS_AUD'),
      ownerEmail: optionalText('SUBQ_OWNER_EMAIL'),
      apiToken: Config.Redacted('SUBQ_API_TOKEN').pipe(Config.option),
    })
    const devEmail = dev ? yield* optionalText('SUBQ_DEV_EMAIL') : Option.none()
    const access = Option.all({ teamDomain, audience }).pipe(
      Option.map(({ teamDomain, audience }) => ({
        issuer: `https://${Fn.pipe(teamDomain, Str.replace(/^https:\/\//u, ''), Str.replace(/\/$/u, ''))}`,
        audience,
      }))
    )
    const tokenDigest = apiToken.pipe(Option.map(Redacted.value), Option.filter(Str.isNonEmpty), Option.map(digest))

    const authenticate = Effect.fn('subq.session.authenticate')(function* (headers: Headers.Headers) {
      const assertion =
        headers['cf-access-jwt-assertion'] ?? Cookies.parseHeader(headers['cookie'] ?? '')['CF_Authorization']
      if (assertion !== undefined) {
        if (Option.isNone(access)) {
          return yield* Unauthorized.make({})
        }
        const { email, common_name } = yield* jwt.verify({ token: assertion, ...access.value })
        if (email !== undefined) {
          if (Option.isNone(ownerEmail) || Str.toLowerCase(email) !== Str.toLowerCase(ownerEmail.value)) {
            return yield* Unauthorized.make({})
          }
          return owner(email)
        }
        return common_name === undefined ? yield* Unauthorized.make({}) : system(common_name)
      }

      const bearer = /^Bearer ([^\s]+)$/iu.exec(headers['authorization'] ?? '')?.[1]
      if (headers['authorization'] !== undefined) {
        if (Option.isNone(tokenDigest) || bearer === undefined || !timingSafeEqual(digest(bearer), tokenDigest.value)) {
          return yield* Unauthorized.make({})
        }
        return system('api-token')
      }

      return Option.isNone(devEmail) ? yield* Unauthorized.make({}) : owner(devEmail.value)
    })
    return { authenticate }
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make)
}

const authentication = SessionAuthentication.layer.pipe(Layer.provide(AccessJwt.layer))

// oxlint-disable-next-line anti-slop-effect/require-service-make-layer -- The domain owns the RPC middleware tag. The server provides its implementation.
export const SessionLive = Layer.effect(
  Session,
  Effect.gen(function* () {
    const { authenticate } = yield* SessionAuthentication
    return (effect, { headers }) => Effect.provideServiceEffect(effect, CurrentActor, authenticate(headers))
  })
).pipe(Layer.provideMerge(authentication))
