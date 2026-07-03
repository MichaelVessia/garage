import type { D1Database } from '@cloudflare/workers-types'
import { betterAuth } from 'better-auth'
import type { BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/d1'
import * as Context from 'effect/Context'

import { SESSION_COOKIE_CACHE_MAX_AGE_SECONDS, SESSION_EXPIRES_IN_SECONDS, SESSION_UPDATE_AGE_SECONDS } from '#shared'

import { account, session, user, verification } from '../db/schema.js'

export interface AuthConfig {
  readonly db: D1Database
  readonly secret: string
  readonly baseURL: string
}

// Auth tables (user, session, account, verification) are managed by the
// drizzle migrations in ./drizzle, applied at deploy time by the D1 resource.
export const makeAuth = ({ baseURL, db, secret }: AuthConfig) => {
  const options = {
    database: drizzleAdapter(drizzle(db), {
      provider: 'sqlite',
      schema: { account, session, user, verification },
    }),
    secret,
    baseURL,
    trustedOrigins: [baseURL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      // Cache session in signed cookie to avoid DB lookup on every request
      cookieCache: {
        enabled: true,
        maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
      },
    },
    advanced: {
      useSecureCookies: baseURL.startsWith('https://'),
      defaultCookieAttributes: {
        sameSite: 'lax',
        path: '/',
      },
    },
    plugins: [bearer()],
  } satisfies BetterAuthOptions
  return betterAuth(options)
}

export type AuthInstance = ReturnType<typeof makeAuth>

export class AuthService extends Context.Service<AuthService, { readonly auth: AuthInstance }>()(
  '@garage/subq/auth/auth-service/AuthService'
) {}
