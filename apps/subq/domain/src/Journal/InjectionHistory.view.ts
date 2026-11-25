import * as Domain from '@alchemy.run/domain'
import * as Effect from 'effect/Effect'
import * as Record from 'effect/Record'
import * as Struct from 'effect/Struct'

import { CurrentActor } from '../CurrentActor.context.ts'
import { Session } from '../Session.middleware.ts'
import { Journal } from './Journal.aggregate.ts'
import { JournalId } from './Journal.id.ts'
import { Injections, applyScheduleRemoval, putEntries } from './JournalState.ts'

export class InjectionHistory extends Domain.View(
  'InjectionHistory',
  {
    from: [Journal],
    key: JournalId,
    keyOf: { Journal: ({ source }) => source.id },
    middleware: [Session],
    state: Injections,
    initial: {},
    evolve: {
      InjectionLogged: (state, { entry }) => Record.set(state, entry.id, entry),
      InjectionCorrected: (state, { entry }) => Record.set(state, entry.id, entry),
      InjectionRemoved: (state, { injectionId }) => Record.remove(state, injectionId),
      InjectionsAssignedToSchedule: (state, { entries }) => putEntries({ entries: state, updates: entries }),
      ScheduleRemoved: (injections, event) =>
        applyScheduleRemoval({ injections, ...Struct.pick(event, ['unassignedInjectionIds', 'updatedAt']) }),
      JournalImported: (_, { journal }) => journal.injections,
    },
  },
  { description: 'Read all medication injection entries by ID, including schedule assignments.' }
) {}

export const InjectionHistoryLive = InjectionHistory.toLayer(Effect.succeed(() => Effect.asVoid(CurrentActor)))
