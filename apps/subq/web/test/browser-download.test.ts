// @vitest-environment happy-dom
import { afterEach, assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import { vi } from 'vitest'

import { downloadTextFile } from '../src/adapter/browser-download.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('browser download adapter', () => {
  it.effect('creates and clicks a temporary download anchor, then cleans up', () => {
    const anchor = document.createElement('a')
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {})
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const contents = '{"version":"2.0.0"}'
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:subq-export')
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    return Effect.gen(function* () {
      yield* downloadTextFile({
        contents,
        filename: 'subq-export-2026-07-01.json',
        mediaType: 'application/json',
      })

      const blob = createObjectUrl.mock.calls[0]?.[0]

      if (!(blob instanceof Blob)) {
        assert.fail('expected a Blob')
      }

      assert.strictEqual(blob.type, 'application/json')
      assert.strictEqual(blob.size, contents.length)
      assert.strictEqual(click.mock.calls.length, 1)
      assert.strictEqual(anchor.href, 'blob:subq-export')
      assert.strictEqual(anchor.download, 'subq-export-2026-07-01.json')
      assert.isFalse(document.body.contains(anchor))
      assert.deepStrictEqual(revokeObjectUrl.mock.calls, [['blob:subq-export']])
    })
  })

  it.effect('removes the anchor and revokes the object URL when click fails', () => {
    const anchor = document.createElement('a')
    vi.spyOn(anchor, 'click').mockImplementation(() => {
      throw new Error('click failed')
    })
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:failed-export')
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    return Effect.gen(function* () {
      const error = yield* downloadTextFile({
        contents: '{}',
        filename: 'subq-export.json',
        mediaType: 'application/json',
      }).pipe(Effect.flip)

      assert.strictEqual(error._tag, 'BrowserDownloadError')
      assert.isFalse(document.body.contains(anchor))
      assert.deepStrictEqual(revokeObjectUrl.mock.calls, [['blob:failed-export']])
    })
  })
})
