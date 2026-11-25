import * as Schema from 'effect/Schema'

import { GoalId } from './Journal.id.ts'

export class GoalNotFound extends Schema.TaggedError<GoalNotFound, { readonly brand: unique symbol }>()(
  'GoalNotFound',
  { goalId: GoalId },
  { httpApiStatus: 404 }
) {}
