import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import { BookInfoRecord } from '../packages/autocaliweb/src/index.js'
import { ActionResult, DeleteOptions } from '../packages/sabnzbd/src/index.js'

it.effect('exports public schemas for retained normalized models', () =>
  Effect.gen(function* () {
    assert.deepStrictEqual(
      yield* Schema.decodeEffect(BookInfoRecord)({
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
    assert.deepStrictEqual(
      yield* Schema.decodeEffect(ActionResult)({ action: 'delete', ok: true, deleteFiles: false }),
      {
        action: 'delete',
        ok: true,
        deleteFiles: false,
      }
    )
  })
)

it.effect('rejects invalid retained public options at runtime', () =>
  Effect.gen(function* () {
    const result = yield* Schema.decodeUnknownEffect(DeleteOptions)({
      nzoId: 'SABnzbd_nzo_1',
      deleteFiles: 'yes',
    }).pipe(Effect.exit)

    assert.isTrue(Exit.isFailure(result))
  })
)
