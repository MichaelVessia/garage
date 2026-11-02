import * as Alchemy from 'alchemy'
import * as Command from 'alchemy/Command'
import * as Docker from 'alchemy/Docker'
import * as Output from 'alchemy/Output'
import * as Arr from 'effect/Array'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as R from 'effect/Record'

// The frame host: Proxmox CT 126, reached with the workstation's root SSH key.
const DOCKER_HOST = 'ssh://root@192.168.1.147'
const PORT = 8080

// Optional settings pass through only when `.env.prod` sets them; the image supplies the rest.
const OPTIONAL_SETTINGS = ['FRAME_TIMEZONE', 'HOME_ASSISTANT_WEATHER_ENTITY', 'HOME_ASSISTANT_SHOPPING_ENTITY'] as const

const optionalSettings = Effect.forEach(
  OPTIONAL_SETTINGS,
  (name) => Config.nonEmptyString(name).pipe(Config.option, Effect.map(Option.map((value) => [name, value] as const))),
  { concurrency: 1 }
).pipe(Effect.map((entries) => R.fromEntries(Arr.getSomes(entries))))

// Alchemy 2.0.0-beta.70 types Command.providers() with an `any` requirement; nothing here widens it.
// @effect-diagnostics-next-line anyUnknownInErrorContext:off
const FrameProviders = Docker.providers().pipe(Layer.provideMerge(Command.providers()))

export default Alchemy.Stack(
  'Frame',
  {
    // @effect-diagnostics anyUnknownInErrorContext:off
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- upstream `any` requirement, see FrameProviders
    providers: FrameProviders,
    // @effect-diagnostics anyUnknownInErrorContext:on
    // Local state under apps/frame/.alchemy on the deploying workstation.
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    // `deploy:prod` sets this from the Nix image tag, so it names exactly the image being shipped.
    const tag = yield* Config.nonEmptyString('FRAME_IMAGE_TAG')
    const imageRef = `garage-frame:${tag}`

    const host = yield* Docker.Context('frame-host', {
      docker: `host=${DOCKER_HOST}`,
      description: 'Proxmox CT 126 (garage-frame)',
    })

    // No registry: stream the Nix-built tarball into the remote daemon. Re-runs only when the tag changes.
    const image = yield* Command.Exec('load-image', {
      command: [
        `docker -H ${DOCKER_HOST} load -i "$(nix build --no-link --print-out-paths ../..#garage-frame-image)"`,
        `docker -H ${DOCKER_HOST} image inspect ${imageRef} > /dev/null`,
      ].join(' && '),
      shell: true,
      env: { FRAME_IMAGE_TAG: tag },
      memo: { include: ['alchemy.run.ts'] },
      timeout: '15 minutes',
    })

    const container = yield* Docker.Container('frame', {
      name: 'garage-frame',
      context: host,
      image: image.hash.pipe(Output.map(() => imageRef)),
      ports: [{ external: PORT, internal: PORT }],
      restart: 'unless-stopped',
      environment: {
        ...(yield* optionalSettings),
        CALENDAR_ICS_URL: yield* Config.redacted('CALENDAR_ICS_URL'),
        HOME_ASSISTANT_URL: yield* Config.nonEmptyString('HOME_ASSISTANT_URL'),
        HOME_ASSISTANT_TOKEN: yield* Config.redacted('HOME_ASSISTANT_TOKEN'),
      },
      healthcheck: {
        cmd: `wget --quiet --spider http://127.0.0.1:${PORT}/health || exit 1`,
        interval: '30 seconds',
        timeout: '5 seconds',
        retries: 3,
        startPeriod: '5 seconds',
      },
      stopTimeout: '10 seconds',
      start: true,
    })

    return { image: imageRef, container: container.name }
  })
)
