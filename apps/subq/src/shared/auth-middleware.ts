import { Context, Schema } from 'effect'
import * as RpcMiddleware from 'effect/unstable/rpc/RpcMiddleware'

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
export class Unauthorized extends Schema.TaggedClass<Unauthorized>()('Unauthorized', {
  details: Schema.String,
}) {}

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
