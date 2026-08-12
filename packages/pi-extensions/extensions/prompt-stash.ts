// oxlint-disable effect/effect-run-in-body -- Pi extension callbacks are imperative runtime entrypoints that accept Promises, so they execute Effect programs at this adapter edge.
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { CustomEditor } from '@earendil-works/pi-coding-agent'
import { matchesKey } from '@earendil-works/pi-tui'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import type { PromptStashTransition } from '../src/prompt-stash.js'
import { makePromptStash } from '../src/prompt-stash.js'

class PromptStashEditor extends CustomEditor {
  onPromptStash = Option.none<() => void>()

  override handleInput(data: string): void {
    if (matchesKey(data, 'ctrl+s')) {
      if (Option.isSome(this.onPromptStash)) {
        this.onPromptStash.value()
      }
      return
    }

    super.handleInput(data)
  }
}

const runEffect = function <A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  // ast-grep-ignore: no-runpromise-in-effect
  return Effect.runPromise(effect)
}

const runSyncEffect = function <A>(effect: Effect.Effect<A>): A {
  // ast-grep-ignore: no-runpromise-in-effect
  return Effect.runSync(effect)
}

const applyTransition = (ctx: ExtensionContext, transition: PromptStashTransition): Effect.Effect<void> =>
  Match.value(transition).pipe(
    Match.tag('Stashed', () =>
      Effect.sync(() => {
        ctx.ui.setEditorText('')
        ctx.ui.notify('Prompt stashed. Send another prompt or press Ctrl+S to restore it.', 'info')
      })
    ),
    Match.tag('Restored', ({ prompt }) =>
      Effect.sync(() => {
        ctx.ui.setEditorText(prompt)
        ctx.ui.notify('Prompt restored.', 'info')
      })
    ),
    Match.tag('Empty', () =>
      Effect.sync(() => {
        ctx.ui.notify('No prompt is stashed.', 'info')
      })
    ),
    Match.exhaustive
  )

/** Register Claude Code-style prompt stashing with Pi. */
export default function promptStash(pi: ExtensionAPI): void {
  const stash = makePromptStash()

  const restorePrompt = Effect.fn('PiExtensions.PromptStash.restorePrompt')(function* (
    ctx: ExtensionContext
  ): Effect.fn.Return<void> {
    const prompt = yield* stash.restore
    yield* Option.match(prompt, {
      onNone: () => Effect.void,
      onSome: (value) => applyTransition(ctx, { _tag: 'Restored', prompt: value }),
    })
  })

  const toggleStash = Effect.fn('PiExtensions.PromptStash.toggleStash')(function* (
    ctx: ExtensionContext
  ): Effect.fn.Return<void> {
    const currentPrompt = yield* Effect.sync(() => ctx.ui.getEditorText())
    const transition = yield* stash.toggle(currentPrompt)
    yield* applyTransition(ctx, transition)
  })

  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui') {
      return
    }

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = new PromptStashEditor(tui, theme, keybindings)
      // oxlint-disable-next-line array-callback-return -- `Option.some` is an Effect constructor, not `Array.prototype.some`.
      editor.onPromptStash = Option.some(() => {
        runSyncEffect(toggleStash(ctx))
      })
      return editor
    })
  })

  pi.on('input', (event, ctx) => {
    if (event.source !== 'interactive') {
      return
    }
    return runEffect(restorePrompt(ctx))
  })
}
