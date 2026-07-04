import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

export const makeConfigReaders = <E>(envMissing: (name: string) => E) => ({
  readRequiredString: (name: string): Effect.Effect<string, E> =>
    Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name))),
  readRequiredSecret: (name: string) =>
    Config.schema(Schema.Redacted(Schema.NonEmptyString), name).pipe(Effect.mapError(() => envMissing(name))),
})
