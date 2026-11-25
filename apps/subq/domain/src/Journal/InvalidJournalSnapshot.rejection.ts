import * as Schema from 'effect/Schema'

export class InvalidJournalSnapshot extends Schema.TaggedError<
  InvalidJournalSnapshot,
  { readonly brand: unique symbol }
>()(
  'InvalidJournalSnapshot',
  {
    reason: Schema.Literals([
      'duplicate-weight',
      'duplicate-injection',
      'duplicate-schedule',
      'duplicate-goal',
      'multiple-active-schedules',
      'multiple-active-goals',
      'active-completed-goal',
    ]),
    id: Schema.String,
  },
  { httpApiStatus: 422 }
) {}
