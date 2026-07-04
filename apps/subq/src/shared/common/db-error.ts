import * as Effect from 'effect/Effect'

/**
 * Wraps a repo call's failure channel into one of the per-domain
 * `*DatabaseError` classes, tagging it with the operation that failed.
 * `ErrorClass` is duck-typed against `.make` rather than a specific schema
 * class so it also fits `SettingsDatabaseError`, whose operation literal set
 * excludes `'delete'`.
 */
export const mapDbError =
  <Self, Op extends string>(
    ErrorClass: { readonly make: (input: { readonly operation: Op; readonly cause: unknown }) => Self },
    operation: Op
  ) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, Self, R> =>
    Effect.mapError(self, (cause: unknown) => ErrorClass.make({ operation, cause }))
