import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'

/**
 * Turns an Effect into the Succeeded/Failed message pair a foldkit Command
 * expects: on failure, emits `onFailure({ message })` with a fixed message,
 * discarding the actual cause; on success, forwards the value unchanged.
 */
export const toCommandResult: {
  <Fail>(
    onFailure: (props: { readonly message: string }) => Fail,
    message: string
  ): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A | Fail, never, R>
  <A, E, R, Fail>(
    effect: Effect.Effect<A, E, R>,
    onFailure: (props: { readonly message: string }) => Fail,
    message: string
  ): Effect.Effect<A | Fail, never, R>
} = Function.dual(
  3,
  <A, E, R, Fail>(
    effect: Effect.Effect<A, E, R>,
    onFailure: (props: { readonly message: string }) => Fail,
    message: string
  ): Effect.Effect<A | Fail, never, R> =>
    effect.pipe(
      Effect.matchCause({
        onFailure: () => onFailure({ message }),
        onSuccess: (a) => a,
      })
    )
)
