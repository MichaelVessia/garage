import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as P from 'effect/Predicate'
import * as R from 'effect/Record'
import * as Result from 'effect/Result'
import type { Headers } from 'effect/unstable/http/Headers'

import { AuthContext, AuthRpcMiddleware, Unauthorized } from '#shared'

import { AuthService } from './auth-service.js'

/**
 * Layer that provides the auth middleware implementation.
 * Extracts session from cookies or Authorization header via better-auth.
 * The bearer plugin converts Authorization: Bearer <token> to session cookie.
 */
export const AuthRpcMiddlewareLive = Layer.effect(
  AuthRpcMiddleware,
  Effect.gen(function* () {
    const { auth } = yield* AuthService

    return AuthRpcMiddleware.of((effect, { headers }: { headers: Headers }) => {
      const authenticate = Effect.fn('AuthRpcMiddleware.authenticate')(function* () {
        // Convert Headers to a plain object of string values for better-auth
        const headerObj = R.filterMap(headers, (value) => (P.isString(value) ? Result.succeed(value) : Result.failVoid))

        // better-auth's getSession handles both cookies and Bearer tokens (via bearer plugin)
        const session = yield* Effect.tryPromise(() => auth.api.getSession({ headers: headerObj })).pipe(
          Effect.tapError((error) =>
            Effect.logDebug('Auth: session lookup failed').pipe(Effect.annotateLogs({ error }))
          ),
          Effect.catchTag('UnknownError', () => Effect.succeed(null))
        )

        if (session?.user === undefined) {
          yield* Effect.logDebug('Auth: no session found')
          return yield* Effect.fail(Unauthorized.make({ details: 'Not authenticated' }))
        }

        yield* Effect.logDebug('Auth: session verified').pipe(
          Effect.annotateLogs({
            userId: session.user.id,
            email: session.user.email,
            sessionId: session.session.id,
          })
        )

        return yield* effect.pipe(
          Effect.provideService(AuthContext, {
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
            },
            session: {
              id: session.session.id,
              userId: session.session.userId,
            },
          })
        )
      })

      return authenticate()
    })
  })
)
