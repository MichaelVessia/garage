import * as Schema from 'effect/Schema'

import { GoalId } from './Journal.id.ts'

export class TimezoneNotConfigured extends Schema.TaggedError<
  TimezoneNotConfigured,
  { readonly brand: unique symbol }
>()('TimezoneNotConfigured', { goalId: GoalId }, { httpApiStatus: 422 }) {}
