import * as Schema from 'effect/Schema'

import { GoalId } from './Journal.id.ts'

export class GoalAlreadyCompleted extends Schema.TaggedError<GoalAlreadyCompleted, { readonly brand: unique symbol }>()(
  'GoalAlreadyCompleted',
  { goalId: GoalId },
  { httpApiStatus: 409 }
) {}
