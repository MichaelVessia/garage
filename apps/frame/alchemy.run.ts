import {
  Container as DockerContainer,
  Context as DockerContext,
  providers as dockerProviders,
} from '@alchemy.run/docker'
import { Stack, localState } from 'alchemy'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'

import { CONTAINER_ENV_FILE, HOST_ENV_FILE } from './scripts/frame-host.js'

const PORT = 8080

export default Stack(
  'Frame',
  {
    providers: dockerProviders(),
    // Local state under apps/frame/.alchemy holds no credentials. Without it, Alchemy adopts the container it labelled.
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
      // Bind mounts resolve on the Docker host, so credentials never leave it.
      volumes: [{ hostPath: HOST_ENV_FILE, containerPath: CONTAINER_ENV_FILE, readOnly: true }],
      environment: { FRAME_ENV_FILE: CONTAINER_ENV_FILE },
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
