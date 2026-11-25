import * as Domain from '@alchemy.run/domain'
import * as Effect from 'effect/Effect'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'

import { CurrentActor } from '../CurrentActor.context.ts'
import { Session } from '../Session.middleware.ts'
import { Journal } from './Journal.aggregate.ts'
import { JournalId } from './Journal.id.ts'
import { Preferences } from './JournalRecords.ts'
import {
  Goals,
  InjectionSummary,
  Schedules,
  WeightSummary,
  emptyJournal,
  putEntries,
  summarizeInjections,
  summarizeWeights,
} from './JournalState.ts'

const Profile = Schema.Struct({
  preferences: Preferences,
  schedules: Schedules,
  goals: Goals,
  ...WeightSummary.fields,
  ...InjectionSummary.fields,
})
type Profile = typeof Profile.Type

const profile = (state: typeof emptyJournal): Profile => ({
  ...Struct.pick(state, ['preferences', 'schedules', 'goals']),
  ...summarizeWeights(state.weights),
  ...summarizeInjections(state.injections),
})

const withInjectionSummary = (state: Profile, event: typeof InjectionSummary.Type): Profile => ({
  ...state,
  ...Struct.pick(event, ['lastInjection', 'knownSites']),
})

export class JournalProfile extends Domain.View(
  'JournalProfile',
  {
    from: [Journal],
    key: JournalId,
    keyOf: { Journal: ({ source }) => source.id },
    middleware: [Session],
    state: Profile,
    initial: profile(emptyJournal),
    evolve: {
      PreferencesUpdated: (state, { preferences }) => ({ ...state, preferences }),
      WeightRecorded: (state, { latestWeight }) => ({ ...state, latestWeight }),
      WeightCorrected: (state, { latestWeight }) => ({ ...state, latestWeight }),
      WeightRemoved: (state, { latestWeight }) => ({ ...state, latestWeight }),
      InjectionLogged: withInjectionSummary,
      InjectionCorrected: withInjectionSummary,
      InjectionRemoved: withInjectionSummary,
      InjectionsAssignedToSchedule: withInjectionSummary,
      ScheduleCreated: (state, { schedule, deactivated }) => ({
        ...state,
        schedules: putEntries({
          entries: state.schedules,
          updates: deactivated === null ? [schedule] : [deactivated, schedule],
        }),
      }),
      ScheduleRevised: (state, { schedule }) => ({
        ...state,
        schedules: Record.set(state.schedules, schedule.id, schedule),
      }),
      ScheduleActivated: (state, { schedule, deactivated }) => ({
        ...state,
        schedules: putEntries({
          entries: state.schedules,
          updates: deactivated === null ? [schedule] : [deactivated, schedule],
        }),
      }),
      ScheduleDeactivated: (state, { schedule }) => ({
        ...state,
        schedules: Record.set(state.schedules, schedule.id, schedule),
      }),
      ScheduleRemoved: (state, event) => ({
        ...withInjectionSummary(state, event),
        schedules: Record.remove(state.schedules, event.scheduleId),
      }),
      GoalSet: (state, { goal, deactivated }) => ({
        ...state,
        goals: putEntries({ entries: state.goals, updates: deactivated === null ? [goal] : [deactivated, goal] }),
      }),
      GoalRevised: (state, { goal }) => ({ ...state, goals: Record.set(state.goals, goal.id, goal) }),
      GoalCompleted: (state, { goal }) => ({ ...state, goals: Record.set(state.goals, goal.id, goal) }),
      GoalRemoved: (state, { goalId }) => ({ ...state, goals: Record.remove(state.goals, goalId) }),
      JournalImported: (_, { journal }) => profile(journal),
    },
  },
  { description: 'Read preferences, schedules, goals, recent journal entries, and known injection sites.' }
) {}

export const JournalProfileLive = JournalProfile.toLayer(Effect.succeed(() => Effect.asVoid(CurrentActor)))
