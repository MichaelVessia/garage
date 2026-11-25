import * as Domain from '@alchemy.run/domain'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
import * as Result from 'effect/Result'
import * as Struct from 'effect/Struct'

import { calendarDaysBetween, projectInstantToCalendarDate } from '../Calendar.ts'
import { ActivateSchedule, ScheduleActivated } from './ActivateSchedule.command.ts'
import { AssignInjectionsToSchedule, InjectionsAssignedToSchedule } from './AssignInjectionsToSchedule.command.ts'
import { CompleteGoal, GoalCompleted } from './CompleteGoal.command.ts'
import { CorrectInjection, InjectionCorrected } from './CorrectInjection.command.ts'
import { CorrectWeight, WeightCorrected } from './CorrectWeight.command.ts'
import { CreateSchedule, ScheduleCreated } from './CreateSchedule.command.ts'
import { DeactivateSchedule, ScheduleDeactivated } from './DeactivateSchedule.command.ts'
import { GoalAlreadyCompleted } from './GoalAlreadyCompleted.rejection.ts'
import { GoalAlreadyExists } from './GoalAlreadyExists.rejection.ts'
import { GoalNotFound } from './GoalNotFound.rejection.ts'
import { ImportJournal, JournalImported } from './ImportJournal.command.ts'
import { InjectionAlreadyExists } from './InjectionAlreadyExists.rejection.ts'
import { InjectionNotFound } from './InjectionNotFound.rejection.ts'
import { JournalId } from './Journal.id.ts'
import type { Goal, InjectionEntry, Schedule, WeightEntry } from './JournalRecords.ts'
import {
  applyScheduleRemoval,
  emptyJournal,
  JournalState,
  putEntries,
  summarizeInjections,
  summarizeWeights,
} from './JournalState.ts'
import { phaseIdsOutside, prepareImport, validatePhases } from './JournalValidation.ts'
import { InjectionLogged, LogInjection } from './LogInjection.command.ts'
import { NoWeightData } from './NoWeightData.rejection.ts'
import { RecordWeight, WeightRecorded } from './RecordWeight.command.ts'
import { GoalRemoved, RemoveGoal } from './RemoveGoal.command.ts'
import { InjectionRemoved, RemoveInjection } from './RemoveInjection.command.ts'
import { RemoveSchedule, ScheduleRemoved } from './RemoveSchedule.command.ts'
import { RemoveWeight, WeightRemoved } from './RemoveWeight.command.ts'
import { GoalRevised, ReviseGoal } from './ReviseGoal.command.ts'
import { ReviseSchedule, ScheduleRevised } from './ReviseSchedule.command.ts'
import { ScheduleAlreadyExists } from './ScheduleAlreadyExists.rejection.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'
import { GoalSet, SetGoal } from './SetGoal.command.ts'
import { TimezoneNotConfigured } from './TimezoneNotConfigured.rejection.ts'
import { PreferencesUpdated, UpdatePreferences } from './UpdatePreferences.command.ts'
import { WeightAlreadyExists } from './WeightAlreadyExists.rejection.ts'
import { WeightNotFound } from './WeightNotFound.rejection.ts'

const priorActive = <Entry extends Schedule | Goal>(entries: ReadonlyArray<Entry>, current: Entry, now: DateTime.Utc) =>
  Arr.findFirst(entries, (entry) => entry.isActive && entry.id !== current.id).pipe(
    Option.map((previous) => ({ ...previous, isActive: false, updatedAt: now })),
    Option.getOrNull
  )

const stamp = (now: DateTime.Utc) => ({ createdAt: now, updatedAt: now })

export class Journal extends Domain.Aggregate('Journal', {
  id: JournalId,
  state: JournalState,
  initial: emptyJournal,
  commands: [
    UpdatePreferences,
    RecordWeight,
    CorrectWeight,
    RemoveWeight,
    LogInjection,
    CorrectInjection,
    RemoveInjection,
    AssignInjectionsToSchedule,
    CreateSchedule,
    ReviseSchedule,
    ActivateSchedule,
    DeactivateSchedule,
    RemoveSchedule,
    SetGoal,
    ReviseGoal,
    CompleteGoal,
    RemoveGoal,
    ImportJournal,
  ],
  decide: {
    UpdatePreferences: (state, cmd) => [
      PreferencesUpdated.make({ preferences: { ...state.preferences, ...Struct.omit(cmd, ['_tag']) } }),
    ],
    RecordWeight: ({ weights }, { weightId, recordedAt, weightLbs, notes = null }, { now }) => {
      if (Rec.has(weights, weightId)) {
        return WeightAlreadyExists.make({ weightId })
      }
      const entry: WeightEntry = { id: weightId, recordedAt, weightLbs, notes, ...stamp(now) }
      return [WeightRecorded.make({ entry, ...summarizeWeights(Rec.set(weights, entry.id, entry)) })]
    },
    CorrectWeight: ({ weights }, cmd, { now }) => {
      const { weightId } = cmd
      const previous = Rec.get(weights, weightId)
      if (Option.isNone(previous)) {
        return WeightNotFound.make({ weightId })
      }
      const entry = { ...previous.value, ...Struct.omit(cmd, ['_tag', 'weightId']), updatedAt: now }
      return [WeightCorrected.make({ entry, ...summarizeWeights(Rec.set(weights, entry.id, entry)) })]
    },
    RemoveWeight: ({ weights }, { weightId }) =>
      Rec.has(weights, weightId)
        ? [WeightRemoved.make({ weightId, ...summarizeWeights(Rec.remove(weights, weightId)) })]
        : WeightNotFound.make({ weightId }),
    LogInjection: ({ injections, schedules }, cmd, { now }) => {
      const { injectionId, scheduleId = null, site = null, supplier = null, notes = null } = cmd
      if (Rec.has(injections, injectionId)) {
        return InjectionAlreadyExists.make({ injectionId })
      }
      if (scheduleId !== null && !Rec.has(schedules, scheduleId)) {
        return ScheduleNotFound.make({ scheduleId, injectionId })
      }
      const entry: InjectionEntry = {
        id: injectionId,
        ...Struct.pick(cmd, ['administeredAt', 'compound', 'doseMg']),
        scheduleId,
        site,
        supplier,
        notes,
        ...stamp(now),
      }
      return [InjectionLogged.make({ entry, ...summarizeInjections(Rec.set(injections, entry.id, entry)) })]
    },
    CorrectInjection: ({ injections, schedules }, cmd, { now }) => {
      const { injectionId } = cmd
      const previous = Rec.get(injections, injectionId)
      if (Option.isNone(previous)) {
        return InjectionNotFound.make({ injectionId })
      }
      const entry = { ...previous.value, ...Struct.omit(cmd, ['_tag', 'injectionId']), updatedAt: now }
      if (entry.scheduleId !== null && !Rec.has(schedules, entry.scheduleId)) {
        return ScheduleNotFound.make({ scheduleId: entry.scheduleId, injectionId })
      }
      return [InjectionCorrected.make({ entry, ...summarizeInjections(Rec.set(injections, entry.id, entry)) })]
    },
    RemoveInjection: ({ injections }, { injectionId }) =>
      Rec.has(injections, injectionId)
        ? [InjectionRemoved.make({ injectionId, ...summarizeInjections(Rec.remove(injections, injectionId)) })]
        : InjectionNotFound.make({ injectionId }),
    AssignInjectionsToSchedule: ({ injections, schedules }, { injectionIds, scheduleId }, { now }) => {
      if (scheduleId !== null && !Rec.has(schedules, scheduleId)) {
        return ScheduleNotFound.make({ scheduleId })
      }
      const entries: Array<InjectionEntry> = []
      for (const injectionId of Arr.dedupe(injectionIds)) {
        const entry = Rec.get(injections, injectionId)
        if (Option.isNone(entry)) {
          return InjectionNotFound.make({ injectionId })
        }
        entries.push({ ...entry.value, scheduleId, updatedAt: now })
      }
      return [
        InjectionsAssignedToSchedule.make({
          entries,
          ...summarizeInjections(putEntries({ entries: injections, updates: entries })),
        }),
      ]
    },
    CreateSchedule: ({ schedules }, cmd, { now }) => {
      const { scheduleId, phases, supplier = null, notes = null } = cmd
      if (Rec.has(schedules, scheduleId)) {
        return ScheduleAlreadyExists.make({ scheduleId })
      }
      const existing = Rec.values(schedules)
      const rejection = validatePhases({
        id: scheduleId,
        phases,
        seen: phaseIdsOutside({ schedules: existing, id: scheduleId }),
      })
      if (Option.isSome(rejection)) {
        return rejection.value
      }
      const schedule: Schedule = {
        id: scheduleId,
        ...Struct.pick(cmd, ['name', 'compound', 'frequency', 'startDate']),
        supplier,
        notes,
        phases: Arr.map(phases, (phase) => ({ ...phase, ...stamp(now) })),
        isActive: true,
        ...stamp(now),
      }
      return [ScheduleCreated.make({ schedule, deactivated: priorActive(existing, schedule, now) })]
    },
    ReviseSchedule: ({ schedules }, cmd, { now }) => {
      const { scheduleId, phases } = cmd
      const previous = Rec.get(schedules, scheduleId)
      if (Option.isNone(previous)) {
        return ScheduleNotFound.make({ scheduleId })
      }
      if (phases !== undefined) {
        const rejection = validatePhases({
          id: scheduleId,
          phases,
          seen: phaseIdsOutside({ schedules: Rec.values(schedules), id: scheduleId }),
        })
        if (Option.isSome(rejection)) {
          return rejection.value
        }
      }
      const schedule: Schedule = {
        ...previous.value,
        ...Struct.omit(cmd, ['_tag', 'scheduleId', 'phases']),
        phases:
          phases === undefined
            ? previous.value.phases
            : Arr.map(phases, (phase) => ({
                ...phase,
                createdAt:
                  Option.getOrUndefined(Arr.findFirst(previous.value.phases, ({ id }) => id === phase.id))?.createdAt ??
                  now,
                updatedAt: now,
              })),
        updatedAt: now,
      }
      return [ScheduleRevised.make({ schedule })]
    },
    ActivateSchedule: ({ schedules }, { scheduleId }, { now }) => {
      const previous = Rec.get(schedules, scheduleId)
      if (Option.isNone(previous)) {
        return ScheduleNotFound.make({ scheduleId })
      }
      const schedule = { ...previous.value, isActive: true, updatedAt: now }
      return [ScheduleActivated.make({ schedule, deactivated: priorActive(Rec.values(schedules), schedule, now) })]
    },
    DeactivateSchedule: ({ schedules }, { scheduleId }, { now }) => {
      const previous = Rec.get(schedules, scheduleId)
      return Option.isNone(previous)
        ? ScheduleNotFound.make({ scheduleId })
        : [ScheduleDeactivated.make({ schedule: { ...previous.value, isActive: false, updatedAt: now } })]
    },
    RemoveSchedule: ({ schedules, injections }, { scheduleId }, { now }) => {
      if (!Rec.has(schedules, scheduleId)) {
        return ScheduleNotFound.make({ scheduleId })
      }
      const unassignedInjectionIds = Arr.map(
        Arr.filter(Rec.values(injections), (entry) => entry.scheduleId === scheduleId),
        (entry) => entry.id
      )
      const outcome = { scheduleId, unassignedInjectionIds, updatedAt: now }
      return [
        ScheduleRemoved.make({ ...outcome, ...summarizeInjections(applyScheduleRemoval({ injections, ...outcome })) }),
      ]
    },
    SetGoal: ({ preferences, weights, goals }, cmd, { now }) => {
      const { goalId, startingDate, targetDate = null, notes = null } = cmd
      if (Rec.has(goals, goalId)) {
        return GoalAlreadyExists.make({ goalId })
      }
      const { timezone } = preferences
      if (timezone === undefined) {
        return TimezoneNotConfigured.make({ goalId })
      }
      const startingOn = startingDate ?? projectInstantToCalendarDate(now, timezone)
      const nearest =
        startingDate === undefined
          ? Option.fromNullOr(summarizeWeights(weights).latestWeight)
          : Arr.reduce(Rec.values(weights), Option.none<{ entry: WeightEntry; distance: number }>(), (best, entry) => {
              const distance = Math.abs(
                calendarDaysBetween(startingDate, projectInstantToCalendarDate(entry.recordedAt, timezone))
              )
              if (Option.isNone(best) || distance < best.value.distance) {
                return Option.some({ entry, distance })
              }
              const earlier = DateTime.Order(entry.recordedAt, best.value.entry.recordedAt) < 0
              return distance === best.value.distance && earlier ? Option.some({ entry, distance }) : best
            }).pipe(Option.map(({ entry }) => entry))
      if (Option.isNone(nearest)) {
        return NoWeightData.make({ goalId })
      }
      const goal: Goal = {
        id: goalId,
        goalWeightLbs: cmd.goalWeightLbs,
        targetDate,
        notes,
        startingDate: startingOn,
        startingWeightLbs: nearest.value.weightLbs,
        isActive: true,
        completedAt: null,
        ...stamp(now),
      }
      return [GoalSet.make({ goal, deactivated: priorActive(Rec.values(goals), goal, now) })]
    },
    ReviseGoal: ({ goals }, cmd, { now }) => {
      const previous = Rec.get(goals, cmd.goalId)
      return Option.isNone(previous)
        ? GoalNotFound.make({ goalId: cmd.goalId })
        : [GoalRevised.make({ goal: { ...previous.value, ...Struct.omit(cmd, ['_tag', 'goalId']), updatedAt: now } })]
    },
    CompleteGoal: ({ goals }, { goalId }, { now }) => {
      const previous = Rec.get(goals, goalId)
      if (Option.isNone(previous)) {
        return GoalNotFound.make({ goalId })
      }
      if (previous.value.completedAt !== null) {
        return GoalAlreadyCompleted.make({ goalId })
      }
      return [GoalCompleted.make({ goal: { ...previous.value, isActive: false, completedAt: now, updatedAt: now } })]
    },
    RemoveGoal: ({ goals }, { goalId }) =>
      Rec.has(goals, goalId) ? [GoalRemoved.make({ goalId })] : GoalNotFound.make({ goalId }),
    ImportJournal: (_, { snapshot }) =>
      prepareImport(snapshot).pipe(
        Result.match({
          onFailure: (rejection) => rejection,
          onSuccess: (journal) => [JournalImported.make({ journal })],
        })
      ),
  },
  evolve: {
    PreferencesUpdated: (state, { preferences }) => ({ ...state, preferences }),
    WeightRecorded: (state, { entry }) => ({ ...state, weights: Rec.set(state.weights, entry.id, entry) }),
    WeightCorrected: (state, { entry }) => ({ ...state, weights: Rec.set(state.weights, entry.id, entry) }),
    WeightRemoved: (state, { weightId }) => ({ ...state, weights: Rec.remove(state.weights, weightId) }),
    InjectionLogged: (state, { entry }) => ({ ...state, injections: Rec.set(state.injections, entry.id, entry) }),
    InjectionCorrected: (state, { entry }) => ({ ...state, injections: Rec.set(state.injections, entry.id, entry) }),
    InjectionRemoved: (state, { injectionId }) => ({ ...state, injections: Rec.remove(state.injections, injectionId) }),
    InjectionsAssignedToSchedule: (state, { entries }) => ({
      ...state,
      injections: putEntries({ entries: state.injections, updates: entries }),
    }),
    ScheduleCreated: (state, { schedule, deactivated }) => ({
      ...state,
      schedules: putEntries({
        entries: state.schedules,
        updates: deactivated === null ? [schedule] : [deactivated, schedule],
      }),
    }),
    ScheduleRevised: (state, { schedule }) => ({
      ...state,
      schedules: Rec.set(state.schedules, schedule.id, schedule),
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
      schedules: Rec.set(state.schedules, schedule.id, schedule),
    }),
    ScheduleRemoved: (state, event) => ({
      ...state,
      schedules: Rec.remove(state.schedules, event.scheduleId),
      injections: applyScheduleRemoval({
        injections: state.injections,
        ...Struct.pick(event, ['unassignedInjectionIds', 'updatedAt']),
      }),
    }),
    GoalSet: (state, { goal, deactivated }) => ({
      ...state,
      goals: putEntries({ entries: state.goals, updates: deactivated === null ? [goal] : [deactivated, goal] }),
    }),
    GoalRevised: (state, { goal }) => ({ ...state, goals: Rec.set(state.goals, goal.id, goal) }),
    GoalCompleted: (state, { goal }) => ({ ...state, goals: Rec.set(state.goals, goal.id, goal) }),
    GoalRemoved: (state, { goalId }) => ({ ...state, goals: Rec.remove(state.goals, goalId) }),
    JournalImported: (_, { journal }) => journal,
  },
}) {}
