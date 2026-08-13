// oxlint-disable effect/effect-run-in-body -- Pi extension callbacks are imperative runtime entrypoints that accept Promises, so they execute Effect programs at this adapter edge.
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { getAgentDir } from '@earendil-works/pi-coding-agent'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'

import type { SelectedModel } from '../src/gpt-fast-mode.js'
import { applyFastMode, isFastModeSupported, loadConfiguredDefault } from '../src/gpt-fast-mode.js'

const SEGMENT_ID = 'fast-mode'
const SERVICE_TIER = 'priority'
const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

const selectedModel = (ctx: ExtensionContext): Option.Option<SelectedModel> =>
  Option.fromUndefinedOr(ctx.model).pipe(Option.map((model) => ({ id: model.id, provider: model.provider })))

const modelKey = (model: Option.Option<SelectedModel>): string =>
  Option.match(model, {
    onNone: () => 'the current model',
    onSome: ({ id, provider }) => `${provider}/${id}`,
  })

const runEffect = function <A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  // ast-grep-ignore: no-runpromise-in-effect
  return Effect.runPromise(effect)
}

/** Register GPT priority-service-tier controls with Pi. */
export default function gptFastMode(pi: ExtensionAPI): void {
  const enabled = Ref.makeUnsafe(false)

  const updatePowerbar = Effect.fn('PiExtensions.GptFastMode.updatePowerbar')(function* (
    ctx: ExtensionContext
  ): Effect.fn.Return<void> {
    const isEnabled = yield* Ref.get(enabled)
    const supported = isFastModeSupported(selectedModel(ctx))

    yield* Effect.sync(() => {
      pi.events.emit('powerbar:update', {
        color: 'warning',
        icon: '⚡',
        id: SEGMENT_ID,
        text: isEnabled && supported ? 'FAST' : undefined,
      })
    })
  })

  const toggle = Effect.fn('PiExtensions.GptFastMode.toggle')(function* (
    ctx: ExtensionContext
  ): Effect.fn.Return<void> {
    const isEnabled = yield* Ref.updateAndGet(enabled, (current) => !current)
    const model = selectedModel(ctx)
    yield* updatePowerbar(ctx)

    yield* Effect.sync(() => {
      if (!isEnabled) {
        ctx.ui.notify('GPT Fast mode disabled.', 'info')
      } else if (isFastModeSupported(model)) {
        ctx.ui.notify(`GPT Fast mode enabled (service_tier: ${SERVICE_TIER}).`, 'info')
      } else {
        ctx.ui.notify(`GPT Fast mode enabled, but ${modelKey(model)} is unsupported.`, 'warning')
      }
    })
  })

  pi.events.emit('powerbar:register-segment', {
    id: SEGMENT_ID,
    label: 'GPT Fast Mode',
  })

  pi.registerCommand('fast', {
    description: 'Toggle GPT Fast mode (service_tier: priority)',
    handler: (_args, ctx) => runEffect(toggle(ctx)),
  })

  pi.registerShortcut('ctrl+alt+m', {
    description: 'Toggle GPT Fast mode',
    handler: (ctx) => runEffect(toggle(ctx)),
  })

  pi.on('session_start', (_event, ctx) =>
    runEffect(
      loadConfiguredDefault(getAgentDir()).pipe(
        // Pi callbacks are this extension's composition root; Node capabilities are selected here.
        // @effect-diagnostics-next-line strictEffectProvide:off
        Effect.provide(platformLayer),
        Effect.flatMap((isEnabled) => Ref.set(enabled, isEnabled)),
        Effect.andThen(updatePowerbar(ctx))
      )
    )
  )

  pi.on('model_select', (_event, ctx) => runEffect(updatePowerbar(ctx)))

  pi.on('before_provider_request', (event, ctx) =>
    runEffect(
      enabled.pipe(
        Ref.get,
        Effect.map((isEnabled) =>
          Schema.decodeUnknownOption(Schema.Json)(event.payload).pipe(
            Option.flatMap((payload) => applyFastMode(payload, selectedModel(ctx), isEnabled)),
            Option.getOrUndefined
          )
        )
      )
    )
  )
}
