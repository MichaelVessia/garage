import * as Schema from 'effect/Schema'

import { MeterReading } from '../Values.ts'

export class MeterRollback extends Schema.TaggedError<MeterRollback, { readonly brand: unique symbol }>()(
  'MeterRollback',
  {
    current: MeterReading,
    submitted: MeterReading,
  }
) {}
