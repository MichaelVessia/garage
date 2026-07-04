// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'

import { DEMO_USER } from '#shared'

import {
  ChangedLoginEmail,
  ChangedLoginName,
  ChangedLoginPassword,
  ClickedDemoLogin,
  SubmittedLogin,
  ToggledLoginMode,
  initialLoginModel,
  loginFailed,
  loginSucceeded,
  updateLogin,
} from '../src/page/login.js'
import type { LoginModel } from '../src/page/login.js'

describe('login page update', () => {
  it('field changes update the model', () => {
    const [withEmail] = updateLogin(initialLoginModel, ChangedLoginEmail({ value: 'a@example.com' }))
    expect(withEmail.email).toBe('a@example.com')

    const [withPassword] = updateLogin(withEmail, ChangedLoginPassword({ value: 'secret' }))
    expect(withPassword.password).toBe('secret')

    const [withName] = updateLogin(withPassword, ChangedLoginName({ value: 'Jane' }))
    expect(withName.name).toBe('Jane')
  })

  it('toggling mode flips signin/signup and clears any error', () => {
    const withError: LoginModel = { ...initialLoginModel, error: 'boom' }
    const [signup] = updateLogin(withError, ToggledLoginMode())
    expect(signup.mode).toBe('signup')
    expect(signup.error).toBeNull()

    const [signin] = updateLogin(signup, ToggledLoginMode())
    expect(signin.mode).toBe('signin')
  })

  it('submitting in signin mode dispatches SignIn with the entered credentials', () => {
    const model: LoginModel = { ...initialLoginModel, email: 'a@example.com', mode: 'signin', password: 'secret' }
    const [next, commands] = updateLogin(model, SubmittedLogin())
    expect(next.loading).toBe(true)
    expect(next.error).toBeNull()
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('SignIn')
    expect(commands[0]?.args).toEqual({ email: 'a@example.com', password: 'secret' })
  })

  it('submitting in signup mode dispatches SignUp with name, email, and password', () => {
    const model: LoginModel = {
      ...initialLoginModel,
      email: 'a@example.com',
      mode: 'signup',
      name: 'Jane',
      password: 'secret',
    }
    const [next, commands] = updateLogin(model, SubmittedLogin())
    expect(next.loading).toBe(true)
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('SignUp')
    expect(commands[0]?.args).toEqual({ email: 'a@example.com', name: 'Jane', password: 'secret' })
  })

  it('the demo login button signs in with the shared demo account regardless of form state', () => {
    const model: LoginModel = { ...initialLoginModel, email: 'someone-else@example.com', mode: 'signin' }
    const [next, commands] = updateLogin(model, ClickedDemoLogin())
    expect(next.loading).toBe(true)
    expect(next.error).toBeNull()
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('SignIn')
    expect(commands[0]?.args).toEqual({ email: DEMO_USER.email, password: DEMO_USER.password })
  })

  it('loginSucceeded clears the error and loading flags (applied by the parent update)', () => {
    const model: LoginModel = { ...initialLoginModel, error: 'boom', loading: true }
    const next = loginSucceeded(model)
    expect(next.error).toBeNull()
    expect(next.loading).toBe(false)
  })

  it('loginFailed surfaces the error message and clears loading (applied by the parent update)', () => {
    const model: LoginModel = { ...initialLoginModel, loading: true }
    const next = loginFailed(model, 'Sign in failed')
    expect(next.error).toBe('Sign in failed')
    expect(next.loading).toBe(false)
  })
})
