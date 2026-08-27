import { assert, it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

import { BookInfoRecord } from '../packages/autocaliweb/src/index.js'
import { ActionResult, DeleteOptions } from '../packages/sabnzbd/src/index.js'

it('exports public schemas for retained normalized models', () => {
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(BookInfoRecord)({
      authors: [],
      languages: [],
      categories: [],
      downloads: [],
      formats: [],
      tags: [],
    }),
    {
      authors: [],
      languages: [],
      categories: [],
      downloads: [],
      formats: [],
      tags: [],
    }
  )
  assert.deepStrictEqual(Schema.decodeUnknownSync(ActionResult)({ action: 'delete', ok: true, deleteFiles: false }), {
    action: 'delete',
    ok: true,
    deleteFiles: false,
  })
})

it('rejects invalid retained public options at runtime', () => {
  assert.throws(() => {
    Schema.decodeUnknownSync(DeleteOptions)({ deleteFiles: 'yes' })
  })
})
