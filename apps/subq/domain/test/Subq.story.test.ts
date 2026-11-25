import * as Domain from '@alchemy.run/domain'
import { Story } from '@alchemy.run/domain/Story'
import { expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'

import { owner } from '../src/Actor.ts'
import { CalendarDate, IanaTimezone } from '../src/Calendar.ts'
import { CurrentActor } from '../src/CurrentActor.context.ts'
import type { JournalSnapshot } from '../src/ExportFormat.ts'
import { ActivateSchedule, ScheduleActivated } from '../src/Journal/ActivateSchedule.command.ts'
import {
  AssignInjectionsToSchedule,
  InjectionsAssignedToSchedule,
} from '../src/Journal/AssignInjectionsToSchedule.command.ts'
import { CompleteGoal, GoalCompleted } from '../src/Journal/CompleteGoal.command.ts'
import { CorrectInjection, InjectionCorrected } from '../src/Journal/CorrectInjection.command.ts'
import { CorrectWeight, WeightCorrected } from '../src/Journal/CorrectWeight.command.ts'
import { CreateSchedule, ScheduleCreated } from '../src/Journal/CreateSchedule.command.ts'
import { DeactivateSchedule, ScheduleDeactivated } from '../src/Journal/DeactivateSchedule.command.ts'
import { GoalAlreadyCompleted } from '../src/Journal/GoalAlreadyCompleted.rejection.ts'
import { GoalAlreadyExists } from '../src/Journal/GoalAlreadyExists.rejection.ts'
import { GoalNotFound } from '../src/Journal/GoalNotFound.rejection.ts'
import { ImportJournal, JournalImported } from '../src/Journal/ImportJournal.command.ts'
import { InjectionAlreadyExists } from '../src/Journal/InjectionAlreadyExists.rejection.ts'
import { InjectionHistory } from '../src/Journal/InjectionHistory.view.ts'
import { InjectionNotFound } from '../src/Journal/InjectionNotFound.rejection.ts'
import { InvalidJournalSnapshot } from '../src/Journal/InvalidJournalSnapshot.rejection.ts'
import { InvalidSchedulePhases } from '../src/Journal/InvalidSchedulePhases.rejection.ts'
import { Journal } from '../src/Journal/Journal.aggregate.ts'
import {
  GoalId,
  InjectionId,
  PERSONAL_JOURNAL_ID,
  ScheduleId,
  SchedulePhaseId,
  WeightId,
} from '../src/Journal/Journal.id.ts'
import { JournalProfile } from '../src/Journal/JournalProfile.view.ts'
import type { InjectionEntry } from '../src/Journal/JournalRecords.ts'
import { InjectionLogged, LogInjection } from '../src/Journal/LogInjection.command.ts'
import { NoWeightData } from '../src/Journal/NoWeightData.rejection.ts'
import { RecordWeight, WeightRecorded } from '../src/Journal/RecordWeight.command.ts'
import { GoalRemoved, RemoveGoal } from '../src/Journal/RemoveGoal.command.ts'
import { InjectionRemoved, RemoveInjection } from '../src/Journal/RemoveInjection.command.ts'
import { RemoveSchedule, ScheduleRemoved } from '../src/Journal/RemoveSchedule.command.ts'
import { RemoveWeight, WeightRemoved } from '../src/Journal/RemoveWeight.command.ts'
import { GoalRevised, ReviseGoal } from '../src/Journal/ReviseGoal.command.ts'
import { ReviseSchedule, ScheduleRevised } from '../src/Journal/ReviseSchedule.command.ts'
import { ScheduleAlreadyExists } from '../src/Journal/ScheduleAlreadyExists.rejection.ts'
import { ScheduleNotFound } from '../src/Journal/ScheduleNotFound.rejection.ts'
import { GoalSet, SetGoal } from '../src/Journal/SetGoal.command.ts'
import { TimezoneNotConfigured } from '../src/Journal/TimezoneNotConfigured.rejection.ts'
import { PreferencesUpdated, UpdatePreferences } from '../src/Journal/UpdatePreferences.command.ts'
import { WeightAlreadyExists } from '../src/Journal/WeightAlreadyExists.rejection.ts'
import { WeightHistory } from '../src/Journal/WeightHistory.view.ts'
import { WeightNotFound } from '../src/Journal/WeightNotFound.rejection.ts'
import { Subq, SubqHandlers } from '../src/Subq.model.ts'
import { SubqApi } from '../src/SubqApi.api.ts'
import { DoseMg, InjectionSite, Notes, PhaseDurationDays, PhaseOrder, ScheduleName, WeightLbs } from '../src/Values.ts'

const story = Story.make(Subq, { layer: SubqHandlers })
const signedIn = Story.provide(CurrentActor, owner('owner@example.com'))
const journal = Journal.ref(PERSONAL_JOURNAL_ID)
const now = DateTime.makeUnsafe('2025-01-03T01:00:00Z')
const later = DateTime.makeUnsafe('2025-01-04T01:00:00Z')
const audit = { createdAt: now, updatedAt: now }
const clock = Story.clock(DateTime.formatIso(now))
const laterClock = Story.clock(DateTime.formatIso(later))
const timezone = IanaTimezone.make('America/New_York')
const jan1 = CalendarDate.make('2025-01-01')
const jan2 = CalendarDate.make('2025-01-02')
const emptyProfile = {
  preferences: {},
  schedules: {},
  goals: {},
  latestWeight: null,
  lastInjection: null,
  knownSites: [],
}
const weightId = WeightId.make('weight')
const weight2Id = WeightId.make('weight2')
const weight = { id: weightId, recordedAt: now, weightLbs: WeightLbs.make(200), notes: null, ...audit }
const earlierWeight = {
  ...weight,
  id: weight2Id,
  recordedAt: DateTime.makeUnsafe('2025-01-02T01:00:00Z'),
  weightLbs: WeightLbs.make(205),
}
const injectionId = InjectionId.make('injection')
const injection = {
  id: injectionId,
  administeredAt: now,
  compound: 'Semaglutide',
  doseMg: DoseMg.make(0.5),
  site: InjectionSite.make('Left abdomen'),
  supplier: null,
  notes: null,
  scheduleId: null,
  ...audit,
} satisfies InjectionEntry
const scheduleId = ScheduleId.make('schedule')
const schedule2Id = ScheduleId.make('schedule2')
const phase = {
  id: SchedulePhaseId.make('phase'),
  order: PhaseOrder.make(1),
  durationDays: null,
  doseMg: DoseMg.make(0.5),
}
const scheduleInput = {
  name: ScheduleName.make('Weekly'),
  compound: 'Semaglutide',
  frequency: 'weekly',
  startDate: jan1,
  supplier: null,
  notes: null,
  phases: [phase],
} satisfies Omit<Parameters<typeof CreateSchedule.make>[0], 'scheduleId'>
const schedule = { ...scheduleInput, id: scheduleId, isActive: true, phases: [{ ...phase, ...audit }], ...audit }
const goalId = GoalId.make('goal')
const goal2Id = GoalId.make('goal2')
const goalInput = { goalWeightLbs: WeightLbs.make(180), targetDate: null, notes: null }
const goal = {
  id: goalId,
  ...goalInput,
  startingDate: jan1,
  startingWeightLbs: earlierWeight.weightLbs,
  isActive: true,
  completedAt: null,
  ...audit,
}

it('verifies the model and exposes every command and view', () => {
  expect(Domain.verify(Subq)).toEqual([])
  expect(SubqApi.serves).toEqual([...Journal.definition.commands, JournalProfile, WeightHistory, InjectionHistory])
})

it.effect('updates preferences and maintains the latest weight through corrections and removals', () => {
  const corrected = {
    ...weight,
    recordedAt: earlierWeight.recordedAt,
    weightLbs: WeightLbs.make(201),
    updatedAt: later,
  }
  const prefs = { timezone, weightUnit: 'kg' } as const
  return story(
    clock,
    signedIn,
    Story.when(journal, UpdatePreferences.make({ timezone })),
    Story.then(journal, PreferencesUpdated.make({ preferences: { timezone } })),
    Story.when(journal, UpdatePreferences.make({ weightUnit: 'kg' })),
    Story.then(journal, PreferencesUpdated.make({ preferences: prefs })),
    Story.when(journal, CorrectWeight.make({ weightId })),
    Story.rejected(WeightNotFound.make({ weightId })),
    Story.when(journal, RemoveWeight.make({ weightId })),
    Story.rejected(WeightNotFound.make({ weightId })),
    Story.when(journal, RecordWeight.make({ weightId, recordedAt: now, weightLbs: weight.weightLbs })),
    Story.then(journal, WeightRecorded.make({ entry: weight, latestWeight: weight })),
    Story.when(journal, RecordWeight.make({ weightId, recordedAt: now, weightLbs: weight.weightLbs, notes: null })),
    Story.rejected(WeightAlreadyExists.make({ weightId })),
    Story.when(
      journal,
      RecordWeight.make({
        weightId: weight2Id,
        recordedAt: earlierWeight.recordedAt,
        weightLbs: earlierWeight.weightLbs,
        notes: null,
      })
    ),
    Story.then(journal, WeightRecorded.make({ entry: earlierWeight, latestWeight: weight })),
    laterClock,
    Story.when(
      journal,
      CorrectWeight.make({ weightId, recordedAt: corrected.recordedAt, weightLbs: corrected.weightLbs })
    ),
    Story.then(journal, WeightCorrected.make({ entry: corrected, latestWeight: corrected })),
    Story.view(WeightHistory, PERSONAL_JOURNAL_ID, { [weightId]: corrected, [weight2Id]: earlierWeight }),
    Story.when(journal, RemoveWeight.make({ weightId })),
    Story.then(journal, WeightRemoved.make({ weightId, latestWeight: earlierWeight })),
    Story.view(WeightHistory, PERSONAL_JOURNAL_ID, { [weight2Id]: earlierWeight }),
    Story.view(JournalProfile, PERSONAL_JOURNAL_ID, {
      ...emptyProfile,
      preferences: prefs,
      latestWeight: earlierWeight,
    })
  )
})

it.effect('validates injections and schedule assignments and detaches injections on removal', () => {
  const missing = ScheduleNotFound.make({ scheduleId, injectionId })
  const unknown = InjectionNotFound.make({ injectionId })
  const input = {
    injectionId,
    administeredAt: now,
    compound: injection.compound,
    doseMg: injection.doseMg,
    site: injection.site,
    supplier: null,
    notes: null,
    scheduleId: null,
  }
  const corrected = { ...injection, site: null, updatedAt: later }
  const assigned = { ...corrected, scheduleId }
  return story(
    clock,
    signedIn,
    Story.when(journal, LogInjection.make({ ...input, scheduleId })),
    Story.rejected(missing),
    Story.when(journal, CorrectInjection.make({ injectionId })),
    Story.rejected(unknown),
    Story.when(journal, RemoveInjection.make({ injectionId })),
    Story.rejected(unknown),
    Story.when(journal, AssignInjectionsToSchedule.make({ injectionIds: [injectionId], scheduleId })),
    Story.rejected(ScheduleNotFound.make({ scheduleId })),
    Story.when(journal, AssignInjectionsToSchedule.make({ injectionIds: [injectionId], scheduleId: null })),
    Story.rejected(unknown),
    Story.when(journal, LogInjection.make(input)),
    Story.then(
      journal,
      InjectionLogged.make({ entry: injection, lastInjection: injection, knownSites: [injection.site] })
    ),
    Story.when(journal, LogInjection.make(input)),
    Story.rejected(InjectionAlreadyExists.make({ injectionId })),
    Story.when(journal, CorrectInjection.make({ injectionId, scheduleId })),
    Story.rejected(missing),
    Story.when(journal, CreateSchedule.make({ scheduleId, ...scheduleInput })),
    Story.then(journal, ScheduleCreated.make({ schedule, deactivated: null })),
    laterClock,
    Story.when(journal, CorrectInjection.make({ injectionId, site: null })),
    Story.then(journal, InjectionCorrected.make({ entry: corrected, lastInjection: corrected, knownSites: [] })),
    Story.when(journal, AssignInjectionsToSchedule.make({ injectionIds: [injectionId], scheduleId })),
    Story.then(
      journal,
      InjectionsAssignedToSchedule.make({ entries: [assigned], lastInjection: assigned, knownSites: [] })
    ),
    Story.view(InjectionHistory, PERSONAL_JOURNAL_ID, { [injectionId]: assigned }),
    Story.when(journal, RemoveSchedule.make({ scheduleId })),
    Story.then(
      journal,
      ScheduleRemoved.make({
        scheduleId,
        unassignedInjectionIds: [injectionId],
        updatedAt: later,
        lastInjection: corrected,
        knownSites: [],
      })
    ),
    Story.view(InjectionHistory, PERSONAL_JOURNAL_ID, { [injectionId]: corrected }),
    Story.view(JournalProfile, PERSONAL_JOURNAL_ID, { ...emptyProfile, lastInjection: corrected }),
    Story.when(journal, RemoveInjection.make({ injectionId })),
    Story.then(journal, InjectionRemoved.make({ injectionId, lastInjection: null, knownSites: [] })),
    Story.view(InjectionHistory, PERSONAL_JOURNAL_ID, {}),
    Story.view(JournalProfile, PERSONAL_JOURNAL_ID, emptyProfile)
  )
})

it.effect('keeps one active schedule and rejects missing schedules and invalid phases', () => {
  const phase2 = { ...phase, id: SchedulePhaseId.make('phase2') }
  const schedule2 = { ...schedule, id: schedule2Id, phases: [{ ...phase2, ...audit }] }
  const inactive = { ...schedule, isActive: false }
  const revised = { ...schedule2, name: ScheduleName.make('Revised'), updatedAt: later }
  const activated = { ...schedule, updatedAt: later }
  const deactivated = { ...revised, isActive: false }
  const missing = ScheduleNotFound.make({ scheduleId })
  const invalid = InvalidSchedulePhases.make({ scheduleId, reason: 'empty' })
  return story(
    clock,
    signedIn,
    Story.when(journal, RemoveSchedule.make({ scheduleId })),
    Story.rejected(missing),
    Story.when(journal, ReviseSchedule.make({ scheduleId })),
    Story.rejected(missing),
    Story.when(journal, ActivateSchedule.make({ scheduleId })),
    Story.rejected(missing),
    Story.when(journal, DeactivateSchedule.make({ scheduleId })),
    Story.rejected(missing),
    Story.when(journal, CreateSchedule.make({ scheduleId, ...scheduleInput, phases: [] })),
    Story.rejected(invalid),
    Story.when(
      journal,
      CreateSchedule.make({ scheduleId, ...scheduleInput, phases: [{ ...phase, order: PhaseOrder.make(2) }] })
    ),
    Story.rejected(InvalidSchedulePhases.make({ scheduleId, phaseId: phase.id, reason: 'nonconsecutive-order' })),
    Story.when(
      journal,
      CreateSchedule.make({ scheduleId, ...scheduleInput, phases: [phase, { ...phase2, order: PhaseOrder.make(2) }] })
    ),
    Story.rejected(InvalidSchedulePhases.make({ scheduleId, phaseId: phase.id, reason: 'indefinite-before-final' })),
    Story.when(
      journal,
      CreateSchedule.make({
        scheduleId,
        ...scheduleInput,
        phases: [
          { ...phase, durationDays: PhaseDurationDays.make(7) },
          { ...phase, order: PhaseOrder.make(2) },
        ],
      })
    ),
    Story.rejected(InvalidSchedulePhases.make({ scheduleId, phaseId: phase.id, reason: 'duplicate-id' })),

    Story.when(journal, CreateSchedule.make({ scheduleId, ...scheduleInput })),
    Story.then(journal, ScheduleCreated.make({ schedule, deactivated: null })),
    Story.when(journal, CreateSchedule.make({ scheduleId, ...scheduleInput })),
    Story.rejected(ScheduleAlreadyExists.make({ scheduleId })),
    Story.when(journal, ReviseSchedule.make({ scheduleId, phases: [] })),
    Story.rejected(invalid),
    Story.when(journal, CreateSchedule.make({ scheduleId: schedule2Id, ...scheduleInput, phases: [phase2] })),
    Story.then(journal, ScheduleCreated.make({ schedule: schedule2, deactivated: inactive })),
    laterClock,
    Story.when(journal, ReviseSchedule.make({ scheduleId: schedule2Id, name: revised.name })),
    Story.then(journal, ScheduleRevised.make({ schedule: revised })),
    Story.when(journal, ActivateSchedule.make({ scheduleId })),
    Story.then(journal, ScheduleActivated.make({ schedule: activated, deactivated })),
    Story.view(JournalProfile, PERSONAL_JOURNAL_ID, {
      ...emptyProfile,
      schedules: { [scheduleId]: activated, [schedule2Id]: deactivated },
    }),
    Story.when(journal, DeactivateSchedule.make({ scheduleId })),
    Story.then(journal, ScheduleDeactivated.make({ schedule: { ...activated, isActive: false } }))
  )
})

it.effect('resolves a goal starting weight in the journal timezone and records explicit completion', () => {
  const tiedWeight = { ...weight, id: WeightId.make('tie'), weightLbs: WeightLbs.make(190) }
  const revised = { ...goal, notes: Notes.make('Revised') }
  const redated = { ...revised, startingDate: jan2, startingWeightLbs: weight.weightLbs }
  const restored = { ...redated, startingDate: jan1, startingWeightLbs: earlierWeight.weightLbs }
  const goal2 = { ...goal, ...goalInput, id: goal2Id, startingDate: jan2, startingWeightLbs: weight.weightLbs }
  const inactive = { ...restored, isActive: false }
  const complete = { ...goal2, completedAt: later, updatedAt: later, isActive: false }
  const missing = GoalNotFound.make({ goalId })
  return story(
    clock,
    signedIn,
    Story.when(journal, SetGoal.make({ goalId, ...goalInput })),
    Story.rejected(TimezoneNotConfigured.make({ goalId })),
    Story.when(journal, ReviseGoal.make({ goalId })),
    Story.rejected(missing),
    Story.when(journal, RemoveGoal.make({ goalId })),
    Story.rejected(missing),
    Story.when(journal, CompleteGoal.make({ goalId })),
    Story.rejected(missing),
    Story.when(journal, UpdatePreferences.make({ timezone })),
    Story.then(journal, PreferencesUpdated.make({ preferences: { timezone } })),
    Story.when(journal, SetGoal.make({ goalId, ...goalInput })),
    Story.rejected(NoWeightData.make({ goalId })),
    Story.when(journal, RecordWeight.make({ weightId, recordedAt: now, weightLbs: weight.weightLbs, notes: null })),
    Story.then(journal, WeightRecorded.make({ entry: weight, latestWeight: weight })),
    Story.when(
      journal,
      RecordWeight.make({
        weightId: weight2Id,
        recordedAt: earlierWeight.recordedAt,
        weightLbs: earlierWeight.weightLbs,
        notes: null,
      })
    ),
    Story.then(journal, WeightRecorded.make({ entry: earlierWeight, latestWeight: weight })),
    Story.when(journal, SetGoal.make({ goalId, ...goalInput, startingDate: jan1 })),
    Story.then(journal, GoalSet.make({ goal, deactivated: null })),
    Story.when(journal, SetGoal.make({ goalId, ...goalInput })),
    Story.rejected(GoalAlreadyExists.make({ goalId })),
    Story.when(journal, ReviseGoal.make({ goalId, notes: revised.notes, startingDate: jan1 })),
    Story.then(journal, GoalRevised.make({ goal: revised })),
    Story.when(journal, ReviseGoal.make({ goalId, startingDate: jan2 })),
    Story.then(journal, GoalRevised.make({ goal: redated })),
    Story.when(journal, ReviseGoal.make({ goalId, startingDate: jan1 })),
    Story.then(journal, GoalRevised.make({ goal: restored })),
    Story.when(
      journal,
      RecordWeight.make({ weightId: tiedWeight.id, recordedAt: now, weightLbs: tiedWeight.weightLbs })
    ),
    Story.then(journal, WeightRecorded.make({ entry: tiedWeight, latestWeight: weight })),
    Story.when(journal, SetGoal.make({ goalId: goal2Id, ...goalInput })),
    Story.then(journal, GoalSet.make({ goal: goal2, deactivated: inactive })),
    laterClock,
    Story.when(journal, CompleteGoal.make({ goalId: goal2Id })),
    Story.then(journal, GoalCompleted.make({ goal: complete })),
    Story.when(journal, CompleteGoal.make({ goalId: goal2Id })),
    Story.rejected(GoalAlreadyCompleted.make({ goalId: goal2Id })),
    Story.when(journal, RemoveGoal.make({ goalId })),
    Story.then(journal, GoalRemoved.make({ goalId })),
    Story.view(JournalProfile, PERSONAL_JOURNAL_ID, {
      ...emptyProfile,
      preferences: { timezone },
      latestWeight: weight,
      goals: { [goal2Id]: complete },
    })
  )
})

it.effect('recomputes goal starting weight only when startingDate changes without explicit weight', () => {
  const customWeight = WeightLbs.make(195)
  const importedGoal = { ...goal, startingWeightLbs: customWeight }
  const unchangedDateRevised = { ...importedGoal, notes: Notes.make('Keep custom weight') }
  return story(
    clock,
    signedIn,
    Story.when(
      journal,
      ImportJournal.make({
        snapshot: {
          version: '4.0.0',
          exportedAt: now,
          data: { preferences: {}, weights: [], injections: [], schedules: [], goals: [importedGoal] },
        },
      })
    ),
    Story.then(
      journal,
      JournalImported.make({
        journal: {
          preferences: {},
          weights: {},
          injections: {},
          schedules: {},
          goals: { [goalId]: importedGoal },
        },
      })
    ),
    Story.when(journal, ReviseGoal.make({ goalId, startingDate: jan1, notes: unchangedDateRevised.notes })),
    Story.then(journal, GoalRevised.make({ goal: unchangedDateRevised })),
    Story.when(journal, ReviseGoal.make({ goalId, startingDate: jan2 })),
    Story.rejected(TimezoneNotConfigured.make({ goalId })),
    Story.when(journal, UpdatePreferences.make({ timezone })),
    Story.then(journal, PreferencesUpdated.make({ preferences: { timezone } })),
    Story.when(journal, ReviseGoal.make({ goalId, startingDate: jan2 })),
    Story.rejected(NoWeightData.make({ goalId }))
  )
})

const importSnapshot = (data: JournalSnapshot['data']) =>
  ImportJournal.make({ snapshot: { version: '4.0.0', exportedAt: now, data } })

it.effect('replaces all journal data atomically and rejects invalid snapshots', () => {
  const data = {
    preferences: { timezone },
    weights: [weight],
    injections: [injection],
    schedules: [schedule],
    goals: [goal],
  }
  const blank = { preferences: {}, weights: [], injections: [], schedules: [], goals: [] }
  return story(
    clock,
    signedIn,
    Story.when(journal, importSnapshot(data)),
    Story.then(
      journal,
      JournalImported.make({
        journal: {
          preferences: { timezone },
          weights: { [weightId]: weight },
          injections: { [injectionId]: injection },
          schedules: { [scheduleId]: schedule },
          goals: { [goalId]: goal },
        },
      })
    ),
    Story.when(journal, importSnapshot({ ...blank, injections: [{ ...injection, scheduleId }] })),
    Story.rejected(ScheduleNotFound.make({ scheduleId, injectionId })),
    Story.when(journal, importSnapshot({ ...blank, schedules: [{ ...schedule, phases: [] }] })),
    Story.rejected(InvalidSchedulePhases.make({ scheduleId, reason: 'empty' })),
    Story.when(journal, importSnapshot({ ...blank, schedules: [schedule, { ...schedule, id: schedule2Id }] })),
    Story.rejected(InvalidJournalSnapshot.make({ reason: 'multiple-active-schedules', id: schedule2Id })),
    Story.when(journal, importSnapshot({ ...blank, goals: [goal, { ...goal, id: goal2Id }] })),
    Story.rejected(InvalidJournalSnapshot.make({ reason: 'multiple-active-goals', id: goal2Id })),
    Story.when(journal, importSnapshot({ ...blank, weights: [weight, weight] })),
    Story.rejected(InvalidJournalSnapshot.make({ reason: 'duplicate-weight', id: weightId })),
    Story.view(WeightHistory, PERSONAL_JOURNAL_ID, { [weightId]: weight }),
    Story.view(InjectionHistory, PERSONAL_JOURNAL_ID, { [injectionId]: injection }),
    Story.view(JournalProfile, PERSONAL_JOURNAL_ID, {
      preferences: { timezone },
      latestWeight: weight,
      lastInjection: injection,
      knownSites: [injection.site],
      schedules: { [scheduleId]: schedule },
      goals: { [goalId]: goal },
    }),
    Story.when(journal, importSnapshot(blank)),
    Story.then(
      journal,
      JournalImported.make({ journal: { ...blank, weights: {}, injections: {}, schedules: {}, goals: {} } })
    ),
    Story.view(JournalProfile, PERSONAL_JOURNAL_ID, emptyProfile),
    Story.view(InjectionHistory, PERSONAL_JOURNAL_ID, {}),
    Story.view(WeightHistory, PERSONAL_JOURNAL_ID, {})
  )
})
