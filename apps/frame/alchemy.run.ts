import * as Alchemy from 'alchemy'
import * as Docker from 'alchemy/Docker'
import * as Arr from 'effect/Array'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as R from 'effect/Record'

const PORT = 8080

// Optional settings pass through only when `.env.prod` sets them; the image supplies the rest.
const OPTIONAL_SETTINGS = [
  'FRAME_TIMEZONE',
  'HOME_ASSISTANT_WEATHER_ENTITY',
  'HOME_ASSISTANT_SHOPPING_ENTITY',
  'HOME_ASSISTANT_MEDIA_PLAYERS',
  'HOME_ASSISTANT_SPEAKER_ZONES',
  'HOME_ASSISTANT_SPEAKERS_ALL_ON',
  'HOME_ASSISTANT_SPEAKERS_ALL_OFF',
  'HOME_ASSISTANT_SPOTIFY_PLAYER',
] as const

const optionalSettings = Effect.forEach(
  OPTIONAL_SETTINGS,
  (name) => Config.nonEmptyString(name).pipe(Config.option, Effect.map(Option.map((value) => [name, value] as const))),
  { concurrency: 1 }
).pipe(Effect.map((entries) => R.fromEntries(Arr.getSomes(entries))))

export default Alchemy.Stack(
  'Frame',
  {
    // Alchemy 2.0.0-beta.70 types Docker.providers() with an `any` requirement; nothing here widens it.
    // @effect-diagnostics anyUnknownInErrorContext:off
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- upstream `any` requirement
    providers: Docker.providers(),
    // @effect-diagnostics anyUnknownInErrorContext:on
    // Local state under apps/frame/.alchemy on the deploying workstation.
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    // `deploy:prod` sets this from the Nix image tag and loads that image onto the host first
    // (`scripts/load-image.ts`). A plain tag lets Alchemy diff it and replace the container.
    const tag = yield* Config.nonEmptyString('FRAME_IMAGE_TAG')
    const imageRef = `garage-frame:${tag}`
    // The frame host's Docker endpoint, e.g. `ssh://root@<host>`, reached with the workstation's SSH key.
    const dockerHost = yield* Config.nonEmptyString('FRAME_DOCKER_HOST')

    const host = yield* Docker.Context('frame-host', {
      docker: `host=${dockerHost}`,
      description: 'garage-frame host',
    })

    const container = yield* Docker.Container('frame', {
      name: 'garage-frame',
      context: host,
      image: imageRef,
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
