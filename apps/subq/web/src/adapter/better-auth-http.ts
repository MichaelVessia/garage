import * as Effect from 'effect/Effect'
import * as P from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

import { BetterAuthHttpError } from '../errors.js'

export const SessionUser = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
})
export type SessionUser = typeof SessionUser.Type

const SessionResponse = Schema.Struct({
  user: SessionUser,
})

const decodeSession = Schema.decodeUnknownEffect(SessionResponse)

const extractErrorMessage = (body: unknown, fallback: string): string => {
  if (P.isObject(body) && 'message' in body && P.isString(body.message)) {
    return body.message
  }
  return fallback
}

const failForStatus = Effect.fn('betterAuthHttp.failForStatus')(
  (status: number, body: unknown, fallback: string): Effect.Effect<void, BetterAuthHttpError> =>
    status >= 400 ? Effect.fail(new BetterAuthHttpError({ message: extractErrorMessage(body, fallback) })) : Effect.void
)

const postJson = Effect.fn('betterAuthHttp.postJson')(function* (url: string, body: unknown) {
  const client = yield* HttpClient.HttpClient
  const request = yield* HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJson(body))
  return yield* client.execute(request)
})

export const fetchSession = Effect.fn('betterAuthHttp.fetchSession')(function* () {
  const client = yield* HttpClient.HttpClient
  const response = yield* client.get('/api/auth/get-session')
  const body = yield* response.json
  yield* failForStatus(response.status, body, 'Session fetch failed')
  return yield* body === null ? Effect.succeed(null) : decodeSession(body).pipe(Effect.map((session) => session.user))
})

export const signIn = Effect.fn('betterAuthHttp.signIn')(function* (email: string, password: string) {
  const response = yield* postJson('/api/auth/sign-in/email', { email, password })
  const body = yield* response.json
  yield* failForStatus(response.status, body, 'Sign in failed')
  const session = yield* decodeSession(body)
  return session.user
})

export const signUp = Effect.fn('betterAuthHttp.signUp')(function* (email: string, name: string, password: string) {
  const response = yield* postJson('/api/auth/sign-up/email', { email, name, password })
  const body = yield* response.json
  yield* failForStatus(response.status, body, 'Sign up failed')
  const session = yield* decodeSession(body)
  return session.user
})

export const signOut = Effect.fn('betterAuthHttp.signOut')(function* () {
  const response = yield* postJson('/api/auth/sign-out', {})
  if (response.status >= 400) {
    const body = yield* response.json
    yield* failForStatus(response.status, body, 'Sign out failed')
  }
})

export const changePassword = Effect.fn('betterAuthHttp.changePassword')(function* (
  currentPassword: string,
  newPassword: string
) {
  const response = yield* postJson('/api/auth/change-password', {
    currentPassword,
    newPassword,
    revokeOtherSessions: true,
  })
  if (response.status >= 400) {
    const body = yield* response.json
    yield* failForStatus(response.status, body, 'Password change failed')
  }
})
