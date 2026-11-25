import * as Schema from 'effect/Schema'

import { WeightId } from './Journal.id.ts'

export class WeightAlreadyExists extends Schema.TaggedError<WeightAlreadyExists, { readonly brand: unique symbol }>()(
  'WeightAlreadyExists',
  { weightId: WeightId },
  { httpApiStatus: 409 }
) {}
