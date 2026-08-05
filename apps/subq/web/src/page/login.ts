import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import type { HttpClient } from 'effect/unstable/http'
import type { Command } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import { DEMO_USER } from '#shared'

import { FailedSignIn, FailedSignUp, SignIn, SignUp, SucceededSignIn, SucceededSignUp } from '../auth.js'
import { button, input } from '../ui.js'

// ============================================
// Model
// ============================================

export const LoginModel = Schema.Struct({
  mode: Schema.Literals(['signin', 'signup']),
  email: Schema.String,
  password: Schema.String,
  name: Schema.String,
  error: Schema.NullOr(Schema.String),
  loading: Schema.Boolean,
})
export type LoginModel = typeof LoginModel.Type

export const initialLoginModel: LoginModel = {
  email: '',
  error: null,
  loading: false,
  mode: 'signin',
  name: '',
  password: '',
}

// ============================================
// Messages
// ============================================

export const ChangedLoginEmail = m('ChangedLoginEmail', { value: Schema.String })
export const ChangedLoginPassword = m('ChangedLoginPassword', { value: Schema.String })
export const ChangedLoginName = m('ChangedLoginName', { value: Schema.String })
export const ToggledLoginMode = m('ToggledLoginMode')
export const SubmittedLogin = m('SubmittedLogin')
export const ClickedDemoLogin = m('ClickedDemoLogin')

export const LoginMessage = Schema.Union([
  ChangedLoginEmail,
  ChangedLoginPassword,
  ChangedLoginName,
  ToggledLoginMode,
  SubmittedLogin,
  ClickedDemoLogin,
])
export type LoginMessage = typeof LoginMessage.Type

// ============================================
// Update
// ============================================

type AuthCommandMessage =
  | typeof SucceededSignIn.Type
  | typeof FailedSignIn.Type
  | typeof SucceededSignUp.Type
  | typeof FailedSignUp.Type

type UpdateReturn = readonly [
  LoginModel,
  ReadonlyArray<Command.Command<AuthCommandMessage, never, HttpClient.HttpClient>>,
]

export const updateLogin = (model: LoginModel, message: LoginMessage): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      ChangedLoginEmail: ({ value }) => [evo(model, { email: () => value }), []],
      ChangedLoginName: ({ value }) => [evo(model, { name: () => value }), []],
      ChangedLoginPassword: ({ value }) => [evo(model, { password: () => value }), []],
      ClickedDemoLogin: () => [
        evo(model, { error: () => null, loading: () => true }),
        [SignIn({ email: DEMO_USER.email, password: DEMO_USER.password })],
      ],
      SubmittedLogin: () => [
        evo(model, { error: () => null, loading: () => true }),
        model.mode === 'signup'
          ? [SignUp({ email: model.email, name: model.name, password: model.password })]
          : [SignIn({ email: model.email, password: model.password })],
      ],
      ToggledLoginMode: () => [
        evo(model, {
          error: () => null,
          mode: (mode) => (mode === 'signin' ? 'signup' : 'signin'),
        }),
        [],
      ],
    })
  )

// Results of the auth commands, applied by the parent update.
export const loginSucceeded = (model: LoginModel): LoginModel => evo(model, { error: () => null, loading: () => false })

export const loginFailed = (model: LoginModel, message: string): LoginModel =>
  evo(model, { error: () => message, loading: () => false })

// ============================================
// View
// ============================================

const loginSubmitLabel = (model: LoginModel): string => {
  if (model.loading) {
    return model.mode === 'signup' ? 'Creating account...' : 'Signing in...'
  }
  return model.mode === 'signup' ? 'Create Account' : 'Sign In'
}

const makeViewLogin =
  <ParentMessage>(h: HtmlBuilder<ParentMessage | LoginMessage>) =>
  (model: LoginModel) => {
    const submitLabel = loginSubmitLabel(model)

    return h.div(
      [h.Class('max-w-xs mx-auto mt-16 p-6')],
      [
        h.h1([h.Class('text-lg font-semibold mb-6')], [model.mode === 'signin' ? 'Sign In' : 'Create Account']),
        model.mode === 'signin'
          ? h.div(
              [h.Class('mb-6')],
              [
                h.p([h.Class('text-xs text-muted-foreground mb-3')], ['Try a demo account:']),
                h.button(
                  [
                    h.Class(button({ class: 'justify-start text-xs', size: 'sm', variant: 'outline' })),
                    h.Disabled(model.loading),
                    h.OnClick(ClickedDemoLogin()),
                  ],
                  ['Demo Account']
                ),
              ]
            )
          : h.empty,
        h.form(
          [h.Class('flex flex-col gap-4'), h.OnSubmit(SubmittedLogin())],
          [
            model.mode === 'signup'
              ? h.input([
                  h.Class(input()),
                  h.Type('text'),
                  h.Placeholder('Name'),
                  h.Value(model.name),
                  h.OnInput((value) => ChangedLoginName({ value })),
                ])
              : h.empty,
            h.input([
              h.Class(input()),
              h.Type('email'),
              h.Placeholder('Email'),
              h.Value(model.email),
              h.OnInput((value) => ChangedLoginEmail({ value })),
            ]),
            h.input([
              h.Class(input()),
              h.Type('password'),
              h.Placeholder('Password'),
              h.Value(model.password),
              h.OnInput((value) => ChangedLoginPassword({ value })),
            ]),
            model.error === null ? h.empty : h.p([h.Class('text-sm text-destructive')], [model.error]),
            h.button([h.Class(button()), h.Type('submit'), h.Disabled(model.loading)], [submitLabel]),
          ]
        ),
        h.p(
          [h.Class('text-sm text-muted-foreground mt-4')],
          [
            model.mode === 'signin' ? "Don't have an account? " : 'Already have an account? ',
            h.button(
              [h.Class(button({ variant: 'link' })), h.OnClick(ToggledLoginMode())],
              [model.mode === 'signin' ? 'Sign up' : 'Sign in']
            ),
          ]
        ),
      ]
    )
  }

export const viewLogin = <ParentMessage>(model: LoginModel, h: HtmlBuilder<ParentMessage | LoginMessage>) =>
  makeViewLogin(h)(model)

export { FailedSignIn, FailedSignUp, SucceededSignIn, SucceededSignUp }
