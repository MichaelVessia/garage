import * as Effect from 'effect/Effect'
import * as P from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { Command } from 'foldkit'
import { m } from 'foldkit/message'

// ============================================
// Session
// ============================================

export const SessionUser = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
})
export type SessionUser = typeof SessionUser.Type

const SessionResponse = Schema.Struct({
  user: SessionUser,
})

// ============================================
// Messages
// ============================================

export const SucceededFetchSession = m('SucceededFetchSession', {
  user: Schema.NullOr(SessionUser),
})
export const SucceededSignIn = m('SucceededSignIn', { user: SessionUser })
export const FailedSignIn = m('FailedSignIn', { message: Schema.String })
export const SucceededSignUp = m('SucceededSignUp', { user: SessionUser })
export const FailedSignUp = m('FailedSignUp', { message: Schema.String })
export const SucceededSignOut = m('SucceededSignOut')
export const SucceededChangePassword = m('SucceededChangePassword')
export const FailedChangePassword = m('FailedChangePassword', { message: Schema.String })

export const AuthMessage = Schema.Union([
  SucceededFetchSession,
  SucceededSignIn,
  FailedSignIn,
  SucceededSignUp,
  FailedSignUp,
  SucceededSignOut,
  SucceededChangePassword,
  FailedChangePassword,
])
export type AuthMessage = typeof AuthMessage.Type

// ============================================
// HTTP helpers (better-auth REST endpoints)
// ============================================

const errorMessage =
  (fallback: string) =>
  (body: unknown): string => {
    if (P.isObject(body) && 'message' in body && P.isString(body.message)) {
      return body.message
    }
    return fallback
  }

const postJson = Effect.fn('auth.postJson')(function* (url: string, body: unknown) {
  const client = yield* HttpClient.HttpClient
  const request = yield* HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJson(body))
  return yield* client.execute(request)
})

// ============================================
// Commands
// ============================================

export const FetchSession = Command.define(
  'FetchSession',
  SucceededFetchSession
)(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get('/api/auth/get-session')
    const body = yield* response.json
    if (body === null) {
      return SucceededFetchSession({ user: null })
    }
    const session = yield* Schema.decodeUnknownEffect(SessionResponse)(body)
    return SucceededFetchSession({ user: session.user })
  }).pipe(
    Effect.matchCause({
      onFailure: () => SucceededFetchSession({ user: null }),
      onSuccess: (message) => message,
    })
  )
)

export const SignIn = Command.define(
  'SignIn',
  { email: Schema.String, password: Schema.String },
  SucceededSignIn,
  FailedSignIn
)(({ email, password }) =>
  Effect.gen(function* () {
    const response = yield* postJson('/api/auth/sign-in/email', { email, password })
    const body = yield* response.json
    if (response.status >= 400) {
      return FailedSignIn({ message: errorMessage('Sign in failed')(body) })
    }
    const session = yield* Schema.decodeUnknownEffect(SessionResponse)(body)
    return SucceededSignIn({ user: session.user })
  }).pipe(
    Effect.matchCause({
      onFailure: () => FailedSignIn({ message: 'Sign in failed' }),
      onSuccess: (message) => message,
    })
  )
)

export const SignUp = Command.define(
  'SignUp',
  { email: Schema.String, password: Schema.String, name: Schema.String },
  SucceededSignUp,
  FailedSignUp
)(({ email, name, password }) =>
  Effect.gen(function* () {
    const response = yield* postJson('/api/auth/sign-up/email', { email, name, password })
    const body = yield* response.json
    if (response.status >= 400) {
      return FailedSignUp({ message: errorMessage('Sign up failed')(body) })
    }
    const session = yield* Schema.decodeUnknownEffect(SessionResponse)(body)
    return SucceededSignUp({ user: session.user })
  }).pipe(
    Effect.matchCause({
      onFailure: () => FailedSignUp({ message: 'Sign up failed' }),
      onSuccess: (message) => message,
    })
  )
)

export const SignOut = Command.define(
  'SignOut',
  SucceededSignOut
)(
  postJson('/api/auth/sign-out', {}).pipe(
    Effect.matchCause({
      onFailure: () => SucceededSignOut(),
      onSuccess: () => SucceededSignOut(),
    })
  )
)

export const ChangePassword = Command.define(
  'ChangePassword',
  { currentPassword: Schema.String, newPassword: Schema.String },
  SucceededChangePassword,
  FailedChangePassword
)(({ currentPassword, newPassword }) =>
  Effect.gen(function* () {
    const response = yield* postJson('/api/auth/change-password', {
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    })
    if (response.status >= 400) {
      const body = yield* response.json
      return FailedChangePassword({ message: errorMessage('Password change failed')(body) })
    }
    return SucceededChangePassword()
  }).pipe(
    Effect.matchCause({
      onFailure: () => FailedChangePassword({ message: 'Password change failed' }),
      onSuccess: (message) => message,
    })
  )
)
