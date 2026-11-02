import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as RpcMiddleware from 'effect/rpc/RpcMiddleware'
import * as Schema from 'effect/Schema'

// Minimal user/session types (matches better-auth structure)
export interface AuthUser {
  readonly id: string
  readonly email: string
  readonly name: string
}

export interface AuthSession {
  readonly id: string
  readonly userId: string
}

// Auth context for authenticated requests
export class AuthContext extends Context.Service<
  AuthContext,
  { readonly user: AuthUser; readonly session: AuthSession }
>()('@garage/subq/shared/auth-middleware/AuthContext') {}

// Error for unauthorized access
export class Unauthorized extends Schema.TaggedClass<Unauthorized, { readonly brand: unique symbol }>()(
  'Unauthorized',
  {
    details: Schema.String,
  }
) {}

/**
 * RPC Middleware that extracts the authenticated user from request headers
 * and provides AuthContext to RPC handlers.
 */
export class AuthRpcMiddleware extends RpcMiddleware.Service<AuthRpcMiddleware, { provides: AuthContext }>()(
  '@garage/subq/shared/auth-middleware/AuthRpcMiddleware',
  {
    error: Unauthorized,
  }
) {}

/**
 * Extracts the authenticated user for an RPC handler body, removing the
 * `const { user } = yield* Effect.service(AuthContext)` boilerplate repeated
 * across every handler. `body` receives the user first, followed by the
 * handler's own arguments (zero for payload-less RPCs, one otherwise). Name
 * the handler span at the call site with `Effect.fn('rpc.<domain>.<operation>')`.
 */
export const authedRpc =
  <Args extends ReadonlyArray<unknown>, A, E, R>(
    body: (user: AuthUser, ...args: Args) => Effect.Effect<A, E, R>
  ): ((...args: Args) => Effect.Effect<A, E, R | AuthContext>) =>
  (...args: Args) =>
    Effect.flatMap(Effect.service(AuthContext), ({ user }) => body(user, ...args))
