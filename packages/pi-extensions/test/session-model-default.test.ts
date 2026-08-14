import { assert, describe, it } from '@effect/vitest'
import * as Option from 'effect/Option'

import { decodeModelDefault, restoreModelDefault } from '../src/session-model-default.js'

const configuredDefault = {
  provider: 'openai-codex',
  model: 'gpt-5.6-luna',
}

describe('session model default policy', () => {
  it('decodes the provider and model from Pi settings', () => {
    assert.deepStrictEqual(
      decodeModelDefault('{"defaultProvider":"openai-codex","defaultModel":"gpt-5.6-luna"}'),
      Option.some(configuredDefault)
    )
  })

  it('rejects missing or malformed default-model settings', () => {
    assert.deepStrictEqual(decodeModelDefault('{}'), Option.none())
    assert.deepStrictEqual(decodeModelDefault('{'), Option.none())
  })

  it('restores model defaults without changing other settings', () => {
    const restored = restoreModelDefault(
      JSON.stringify({
        defaultProvider: 'openai-codex',
        defaultModel: 'gpt-5.6-sol',
        defaultThinkingLevel: 'medium',
        theme: 'light',
      }),
      configuredDefault
    )

    assert.deepStrictEqual(
      restored,
      Option.some(
        '{"defaultProvider":"openai-codex","defaultModel":"gpt-5.6-luna","defaultThinkingLevel":"medium","theme":"light"}'
      )
    )
  })

  it('rejects a malformed Pi settings document', () => {
    assert.deepStrictEqual(restoreModelDefault('{', configuredDefault), Option.none())
  })
})
