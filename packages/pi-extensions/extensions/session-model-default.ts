// oxlint-disable effect/effect-run-in-body -- Pi extension callbacks are imperative runtime entrypoints that accept Promises, so they execute Effect programs at this adapter edge.
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { getAgentDir } from '@earendil-works/pi-coding-agent'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

import type { ModelDefault } from '../src/session-model-default.js'
import { loadModelDefault, persistModelDefault } from '../src/session-model-default.js'

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

const runEffect = function <A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  // ast-grep-ignore: no-runpromise-in-effect
  return Effect.runPromise(effect)
}

/** Keep Ctrl+P model cycling local to the active Pi session. */
export default function sessionModelDefault(pi: ExtensionAPI): void {
  const configuredDefault = Ref.makeUnsafe(Option.none<ModelDefault>())

  pi.on('session_start', () =>
    runEffect(
      loadModelDefault(getAgentDir()).pipe(
        // Pi callbacks are this extension's composition root; Node capabilities are selected here.
        // @effect-diagnostics-next-line strictEffectProvide:off
        Effect.provide(platformLayer),
        Effect.flatMap((modelDefault) => Ref.set(configuredDefault, modelDefault))
      )
    )
  )

  pi.on('model_select', (event) => {
    if (event.source !== 'cycle') {
      return
    }

    // Pi writes the cycled model after model_select handlers finish. Restore
    // the configured default in the next microtask without changing the model
    // already selected in this session.
    queueMicrotask(() => {
      void runEffect(
        configuredDefault.pipe(
          Ref.get,
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: (modelDefault) => persistModelDefault(getAgentDir(), modelDefault),
            })
          ),
          // @effect-diagnostics-next-line strictEffectProvide:off
          Effect.provide(platformLayer)
        )
      )
    })
  })
}
