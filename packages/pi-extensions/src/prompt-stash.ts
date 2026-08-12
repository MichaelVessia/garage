import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Str from 'effect/String'

/** The observable result of applying an editor prompt to the prompt stash. */
export type PromptStashTransition =
  | { readonly _tag: 'Stashed' }
  | { readonly _tag: 'Restored'; readonly prompt: string }
  | { readonly _tag: 'Empty' }

/** Stateful prompt-stash operations owned by one Pi extension runtime. */
export interface PromptStash {
  /** Stash a non-empty editor prompt, or restore the current stash when the editor is empty. */
  readonly toggle: (currentPrompt: string) => Effect.Effect<PromptStashTransition>
  /** Remove and return the currently stashed prompt. */
  readonly restore: Effect.Effect<Option.Option<string>>
}

/** Construct empty prompt-stash session state. */
export const makePromptStash = (): PromptStash => {
  const stash = Ref.makeUnsafe(Option.none<string>())
  const restore = Ref.getAndSet(stash, Option.none())

  return {
    restore,
    toggle: (currentPrompt) => {
      if (Str.isNonEmpty(currentPrompt)) {
        return Ref.set(stash, Option.some(currentPrompt)).pipe(Effect.as<PromptStashTransition>({ _tag: 'Stashed' }))
      }

      return restore.pipe(
        Effect.map(
          Option.match({
            onNone: (): PromptStashTransition => ({ _tag: 'Empty' }),
            onSome: (prompt): PromptStashTransition => ({ _tag: 'Restored', prompt }),
          })
        )
      )
    },
  }
}
