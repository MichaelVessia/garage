import * as Schema from 'effect/Schema'

import { GoalId } from './Journal.id.ts'

export class NoWeightData extends Schema.TaggedError<NoWeightData, { readonly brand: unique symbol }>()(
  'NoWeightData',
  { goalId: GoalId },
  { httpApiStatus: 422 }
) {}
