import {
  Container as DockerContainer,
  Context as DockerContext,
  providers as dockerProviders,
} from '@alchemy.run/docker'
import { Stack, localState } from 'alchemy'
import * as Arr from 'effect/Array'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as R from 'effect/Record'

const PORT = 8080

// Optional settings pass through only when the deploy environment sets them; the image supplies the rest.
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
  (name) => Config.NonEmptyString(name).pipe(Config.option, Effect.map(Option.map((value) => [name, value] as const))),
  { concurrency: 1 }
).pipe(Effect.map((entries) => R.fromEntries(Arr.getSomes(entries))))

export default Stack(
  'Frame',
  {
    providers: dockerProviders(),
    // Local state under apps/frame/.alchemy on the deploying workstation.
    state: localState(),
  },
  Effect.gen(function* () {
    // `deploy:prod` sets this from the Nix image tag and loads that image onto the host first
    // (`scripts/load-image.ts`). A plain tag lets Alchemy diff it and replace the container.
    const tag = yield* Config.NonEmptyString('FRAME_IMAGE_TAG')
    const imageRef = `garage-frame:${tag}`
    // The frame host's Docker endpoint, e.g. `ssh://root@<host>`, reached with the workstation's SSH key.
    const dockerHost = yield* Config.NonEmptyString('FRAME_DOCKER_HOST')

    const host = yield* DockerContext('frame-host', {
      docker: `host=${dockerHost}`,
      description: 'garage-frame host',
    })

    const container = yield* DockerContainer('frame', {
      name: 'garage-frame',
      context: host,
      image: imageRef,
      ports: [{ external: PORT, internal: PORT }],
      restart: 'unless-stopped',
      environment: {
        ...(yield* optionalSettings),
        GOOGLE_CALENDAR_ID: yield* Config.NonEmptyString('GOOGLE_CALENDAR_ID'),
        GOOGLE_SERVICE_ACCOUNT_KEY: yield* Config.Redacted('GOOGLE_SERVICE_ACCOUNT_KEY'),
        HOME_ASSISTANT_URL: yield* Config.NonEmptyString('HOME_ASSISTANT_URL'),
        HOME_ASSISTANT_TOKEN: yield* Config.Redacted('HOME_ASSISTANT_TOKEN'),
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
