import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'
import { taggedStruct } from 'foldkit/schema'

import { changePassword, fetchSession, SessionUser, signIn, signOut, signUp } from './adapter/better-auth-http.js'
import type { BetterAuthHttpError } from './errors.js'
import { toCommandResult } from './lib/command.js'

export { SessionUser }

// ============================================
// Messages
// ============================================

export const SucceededFetchSession = taggedStruct('SucceededFetchSession', {
  user: Schema.NullOr(SessionUser),
})
export const SucceededSignIn = taggedStruct('SucceededSignIn', { user: SessionUser })
export const FailedSignIn = taggedStruct('FailedSignIn', { message: Schema.String })
export const SucceededSignUp = taggedStruct('SucceededSignUp', { user: SessionUser })
export const FailedSignUp = taggedStruct('FailedSignUp', { message: Schema.String })
export const SucceededSignOut = taggedStruct('SucceededSignOut')
export const SucceededChangePassword = taggedStruct('SucceededChangePassword')
export const FailedChangePassword = taggedStruct('FailedChangePassword', { message: Schema.String })

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
// Commands
// ============================================

const failedSignIn = (error: BetterAuthHttpError) => Effect.succeed(FailedSignIn({ message: error.message }))
const failedSignUp = (error: BetterAuthHttpError) => Effect.succeed(FailedSignUp({ message: error.message }))
const failedChangePassword = (error: BetterAuthHttpError) =>
  Effect.succeed(FailedChangePassword({ message: error.message }))

export const FetchSession = Command.define('FetchSession', {
  messages: [SucceededFetchSession],
  execute: fetchSession().pipe(
    Effect.matchCause({
      onFailure: () => SucceededFetchSession({ user: null }),
      onSuccess: (user) => SucceededFetchSession({ user }),
    })
  ),
})

export const SignIn = Command.define('SignIn', {
  args: { email: Schema.String, password: Schema.String },
  messages: [SucceededSignIn, FailedSignIn],
  execute: ({ email, password }) =>
    signIn(email, password).pipe(
      Effect.map((user) => SucceededSignIn({ user })),
      Effect.catchTag('BetterAuthHttpError', failedSignIn),
      toCommandResult(FailedSignIn, 'Sign in failed')
    ),
})

export const SignUp = Command.define('SignUp', {
  args: { email: Schema.String, password: Schema.String, name: Schema.String },
  messages: [SucceededSignUp, FailedSignUp],
  execute: ({ email, name, password }) =>
    signUp(email, name, password).pipe(
      Effect.map((user) => SucceededSignUp({ user })),
      Effect.catchTag('BetterAuthHttpError', failedSignUp),
      toCommandResult(FailedSignUp, 'Sign up failed')
    ),
})

export const SignOut = Command.define('SignOut', {
  messages: [SucceededSignOut],
  execute: signOut().pipe(
    Effect.matchCause({
      onFailure: () => SucceededSignOut(),
      onSuccess: () => SucceededSignOut(),
    })
  ),
})

export const ChangePassword = Command.define('ChangePassword', {
  args: { currentPassword: Schema.String, newPassword: Schema.String },
  messages: [SucceededChangePassword, FailedChangePassword],
  execute: ({ currentPassword, newPassword }) =>
    changePassword(currentPassword, newPassword).pipe(
      Effect.map(() => SucceededChangePassword()),
      Effect.catchTag('BetterAuthHttpError', failedChangePassword),
      toCommandResult(FailedChangePassword, 'Password change failed')
    ),
})
