import * as NodePath from '@effect/platform-node/NodePath'
import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import {
  applyFastMode,
  decodeConfiguredDefault,
  isFastModeSupported,
  loadConfiguredDefault,
} from '../src/gpt-fast-mode.js'

const supportedModel = Option.some({ id: 'gpt-5.6-sol', provider: 'openai-codex' })

describe('GPT fast-mode policy', () => {
  it('decodes only an explicitly enabled setting', () => {
    assert.isTrue(decodeConfiguredDefault('{"pi-gpt-fast-mode":{"enabled":true}}'))
    assert.isFalse(decodeConfiguredDefault('{"pi-gpt-fast-mode":{"enabled":false}}'))
    assert.isFalse(decodeConfiguredDefault('{}'))
    assert.isFalse(decodeConfiguredDefault('{not-json'))
  })

  it('uses an explicit supported-model allowlist', () => {
    assert.isTrue(isFastModeSupported(supportedModel))
    assert.isFalse(isFastModeSupported(Option.some({ id: 'claude-sonnet-4', provider: 'anthropic' })))
    assert.isFalse(isFastModeSupported(Option.none()))
  })

  it('adds priority only to a matching supported model request', () => {
    assert.deepStrictEqual(
      applyFastMode({ input: 'hello', model: 'gpt-5.6-sol' }, supportedModel, true),
      Option.some({
        input: 'hello',
        model: 'gpt-5.6-sol',
        service_tier: 'priority',
      })
    )
    assert.deepStrictEqual(applyFastMode({ model: 'other-model' }, supportedModel, true), Option.none())
    assert.deepStrictEqual(applyFastMode({ model: 'gpt-5.6-sol' }, supportedModel, false), Option.none())
    assert.deepStrictEqual(applyFastMode('not-an-object', supportedModel, true), Option.none())
  })

  it.effect('reads settings through Effect filesystem and path capabilities', () => {
    const reads: Array<string> = []
    const fileSystemLayer = FileSystem.layerNoop({
      readFileString: (path) => {
        reads.push(path)
        return Effect.succeed('{"pi-gpt-fast-mode":{"enabled":true}}')
      },
    })

    return Effect.gen(function* () {
      const enabled = yield* loadConfiguredDefault('/agent')
      assert.isTrue(enabled)
      assert.deepStrictEqual(reads, ['/agent/settings.json'])
    }).pipe(Effect.provide(Layer.mergeAll(fileSystemLayer, NodePath.layer)))
  })

  it.effect('defaults to disabled when stored settings are malformed', () => {
    const fileSystemLayer = FileSystem.layerNoop({
      readFileString: () => Effect.succeed('{not-json'),
    })

    return loadConfiguredDefault('/agent').pipe(
      Effect.provide(Layer.mergeAll(fileSystemLayer, NodePath.layer)),
      Effect.map((enabled) => {
        assert.isFalse(enabled)
        return enabled
      })
    )
  })
})
