import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import type * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'

interface ConfigReaders<E> {
  readonly readRequiredString: (name: string) => Effect.Effect<string, E>
  readonly readRequiredSecret: (name: string) => Effect.Effect<Redacted.Redacted, E>
}

export const makeConfigReaders = <E>(envMissing: (name: string) => E): ConfigReaders<E> => ({
  readRequiredString: (name) => Config.NonEmptyString(name).pipe(Effect.mapError(() => envMissing(name))),
  readRequiredSecret: (name) =>
    Config.schema(Schema.Redacted(Schema.NonEmptyString), name).pipe(Effect.mapError(() => envMissing(name))),
})
