import * as Schema from 'effect/Schema'

export const HouseholdId = Schema.NonEmptyString.pipe(Schema.brand('HouseholdId'))
export type HouseholdId = typeof HouseholdId.Type

export const HOME_HOUSEHOLD_ID = HouseholdId.make('home')
