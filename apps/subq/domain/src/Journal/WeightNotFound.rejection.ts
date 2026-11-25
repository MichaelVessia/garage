import * as Schema from 'effect/Schema'

import { WeightId } from './Journal.id.ts'

export class WeightNotFound extends Schema.TaggedError<WeightNotFound, { readonly brand: unique symbol }>()(
  'WeightNotFound',
  { weightId: WeightId },
  { httpApiStatus: 404 }
) {}
