import * as Domain from '@alchemy.run/domain'
import * as Effect from 'effect/Effect'
import * as Record from 'effect/Record'

import { CurrentActor } from '../CurrentActor.context.ts'
import { Session } from '../Session.middleware.ts'
import { Journal } from './Journal.aggregate.ts'
import { JournalId } from './Journal.id.ts'
import { Weights } from './JournalState.ts'

export class WeightHistory extends Domain.View(
  'WeightHistory',
  {
    from: [Journal],
    key: JournalId,
    keyOf: { Journal: ({ source }) => source.id },
    middleware: [Session],
    state: Weights,
    initial: {},
    evolve: {
      WeightRecorded: (state, { entry }) => Record.set(state, entry.id, entry),
      WeightCorrected: (state, { entry }) => Record.set(state, entry.id, entry),
      WeightRemoved: (state, { weightId }) => Record.remove(state, weightId),
      JournalImported: (_, { journal }) => journal.weights,
    },
  },
  { description: 'Read all body weight entries, in pounds, by ID.' }
) {}

export const WeightHistoryLive = WeightHistory.toLayer(Effect.succeed(() => Effect.asVoid(CurrentActor)))
