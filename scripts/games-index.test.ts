import * as BunServices from '@effect/platform-bun/BunServices'
import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Str from 'effect/String'

it.effect('links to the published games from the static arcade page', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const html = yield* fs.readFileString('apps/games/public/index.html')
    for (const destination of ['https://battleblocks.vessia.net/', 'https://beltworks.vessia.net/']) {
      assert.isTrue(Str.includes(`<a href="${destination}"`)(html), destination)
    }
  }).pipe(Effect.provide(BunServices.layer))
)
