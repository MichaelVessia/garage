import * as Schema from 'effect/Schema'

import { GoalId } from './Journal.id.ts'

export class GoalAlreadyExists extends Schema.TaggedError<GoalAlreadyExists, { readonly brand: unique symbol }>()(
  'GoalAlreadyExists',
  { goalId: GoalId },
  { httpApiStatus: 409 }
) {}
