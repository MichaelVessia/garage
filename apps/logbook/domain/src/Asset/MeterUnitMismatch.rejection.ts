import * as Schema from 'effect/Schema'

import { MeterUnit } from '../Values.ts'

export class MeterUnitMismatch extends Schema.TaggedError<MeterUnitMismatch, { readonly brand: unique symbol }>()(
  'MeterUnitMismatch',
  {
    configured: MeterUnit,
    requested: MeterUnit,
  }
) {}
