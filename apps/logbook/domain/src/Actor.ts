import * as Schema from 'effect/Schema'

export const Actor = Schema.TaggedUnion({
  Owner: { email: Schema.NonEmptyString },
  System: { name: Schema.NonEmptyString },
})
export type Actor = typeof Actor.Type

export const owner = (email: string): Actor => Actor.cases.Owner.make({ email })
export const system = (name: string): Actor => Actor.cases.System.make({ name })
