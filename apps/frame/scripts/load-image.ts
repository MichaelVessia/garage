import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunServices from '@effect/platform-bun/BunServices'
import * as Config from 'effect/Config'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as ChildProcess from 'effect/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/process/ChildProcessSpawner'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { ImageLoadFailed } from './errors.js'

const Arguments = Schema.Tuple([Schema.NonEmptyString])

// Streams the Nix-built image into the frame host's Docker daemon before Alchemy runs, so the
// container's image is a plain tag that Alchemy can diff and replace.
const loadImage = Effect.fn('frame.loadImage')(function* () {
  const [tag] = yield* Schema.decodeUnknownEffect(Arguments)(process.argv.slice(2))
  const dockerHost = yield* Config.NonEmptyString('FRAME_DOCKER_HOST')
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const imageRef = `garage-frame:${tag}`

  const present = yield* spawner.exitCode(
    ChildProcess.make('docker', ['-H', dockerHost, 'image', 'inspect', imageRef], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
  )

  if (present === 0) {
    return yield* Console.log(`${imageRef} is already on the frame host`)
  }

  // The image output is a script that streams the uncompressed image tar; pipe it into the host.
  const streamImage = yield* spawner.string(
    ChildProcess.make('nix', ['build', '--no-link', '--print-out-paths', '../..#garage-frame-image'], {
      stderr: 'inherit',
    })
  )

  const loaded = yield* spawner.exitCode(
    ChildProcess.make(Str.trim(streamImage), [], { stderr: 'inherit' }).pipe(
      ChildProcess.pipeTo(
        ChildProcess.make('docker', ['-H', dockerHost, 'load'], { stdout: 'inherit', stderr: 'inherit' })
      )
    )
  )

  if (loaded !== 0) {
    return yield* ImageLoadFailed.make({
      image: imageRef,
      exitCode: loaded,
      message: `docker load of ${imageRef} exited with ${loaded}`,
    })
  }
})

BunRuntime.runMain(loadImage().pipe(Effect.scoped, Effect.provide(BunServices.layer)))
