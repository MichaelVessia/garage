import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunServices from '@effect/platform-bun/BunServices'
import * as Arr from 'effect/Array'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { WebviewIncompatible } from './errors.js'
import { findIncompatibilities } from './webview-compat.js'

const distDirectory = Schema.decodeUnknownEffect(Schema.Tuple([Schema.String]))(process.argv.slice(2))

const checkDist = Effect.fn('frame.checkWebviewCompat')(function* () {
  const [dist] = yield* distDirectory
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const files = yield* fs.readDirectory(dist, { recursive: true })

  const findings = yield* Effect.forEach(
    Arr.filter(files, (file) => Str.endsWith('.js')(file) || Str.endsWith('.css')(file)),
    (file) =>
      fs.readFileString(path.join(dist, file)).pipe(Effect.map((text) => findIncompatibilities({ file, text }))),
    { concurrency: 4 }
  )

  const problems = Arr.flatten(findings)

  if (Arr.isReadonlyArrayNonEmpty(problems)) {
    return yield* WebviewIncompatible.make({
      findings: Arr.map(problems, (problem) => `${problem.file}: ${problem.feature}`),
    })
  }

  yield* Console.log(`WebView 106 compatibility check passed for ${files.length} files`)
})

// @effect-diagnostics-next-line strictEffectProvide:off -- script entry point
BunRuntime.runMain(checkDist().pipe(Effect.provide(BunServices.layer)))
