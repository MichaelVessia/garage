import * as Arr from 'effect/Array'
import * as MutableHashSet from 'effect/MutableHashSet'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Result from 'effect/Result'

import type { JournalSnapshot } from '../ExportFormat.ts'
import { InvalidJournalSnapshot } from './InvalidJournalSnapshot.rejection.ts'
import { InvalidSchedulePhases } from './InvalidSchedulePhases.rejection.ts'
import type { ScheduleId, SchedulePhaseId } from './Journal.id.ts'
import type { PhaseInput, Schedule } from './JournalRecords.ts'
import type { JournalState } from './JournalState.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export const validatePhases = ({
  id,
  phases,
  seen,
}: {
  readonly id: ScheduleId
  readonly phases: ReadonlyArray<typeof PhaseInput.Type>
  readonly seen: MutableHashSet.MutableHashSet<SchedulePhaseId>
}): Option.Option<InvalidSchedulePhases> => {
  if (phases.length === 0) {
    return Option.some(InvalidSchedulePhases.make({ scheduleId: id, reason: 'empty' }))
  }
  for (const [index, phase] of phases.entries()) {
    const evidence = { scheduleId: id, phaseId: phase.id }
    if (phase.order !== index + 1) {
      return Option.some(InvalidSchedulePhases.make({ ...evidence, reason: 'nonconsecutive-order' }))
    }
    if (phase.durationDays === null && index < phases.length - 1) {
      return Option.some(InvalidSchedulePhases.make({ ...evidence, reason: 'indefinite-before-final' }))
    }
    if (MutableHashSet.has(seen, phase.id)) {
      return Option.some(InvalidSchedulePhases.make({ ...evidence, reason: 'duplicate-id' }))
    }
    MutableHashSet.add(seen, phase.id)
  }
  return Option.none()
}

export const phaseIdsOutside = ({
  schedules,
  id,
}: {
  readonly schedules: ReadonlyArray<Schedule>
  readonly id: ScheduleId
}): MutableHashSet.MutableHashSet<SchedulePhaseId> =>
  MutableHashSet.fromIterable(
    Arr.flatMap(schedules, (schedule) => (schedule.id === id ? [] : Arr.map(schedule.phases, (phase) => phase.id)))
  )

type SnapshotRejection = InvalidJournalSnapshot | InvalidSchedulePhases | ScheduleNotFound

export const prepareImport = ({ data }: JournalSnapshot): Result.Result<JournalState, SnapshotRejection> => {
  const { preferences, weights, injections, schedules, goals } = data
  const journal = {
    preferences,
    weights: Record.fromIterableBy(weights, (entry) => entry.id),
    injections: Record.fromIterableBy(injections, (entry) => entry.id),
    schedules: Record.fromIterableBy(schedules, (entry) => entry.id),
    goals: Record.fromIterableBy(goals, (entry) => entry.id),
  }
  const collections = [
    { entries: weights, reason: 'duplicate-weight' },
    { entries: injections, reason: 'duplicate-injection' },
    { entries: schedules, reason: 'duplicate-schedule' },
    { entries: goals, reason: 'duplicate-goal' },
  ] satisfies ReadonlyArray<{
    readonly entries: ReadonlyArray<{ readonly id: string }>
    readonly reason: InvalidJournalSnapshot['reason']
  }>
  for (const { entries, reason } of collections) {
    const seen = MutableHashSet.empty<string>()
    for (const { id } of entries) {
      if (MutableHashSet.has(seen, id)) {
        return Result.fail(InvalidJournalSnapshot.make({ reason, id }))
      }
      MutableHashSet.add(seen, id)
    }
  }

  const activeSchedules = Arr.filter(schedules, (schedule) => schedule.isActive)
  const activeGoals = Arr.filter(goals, (goal) => goal.isActive)
  if (activeSchedules[1] !== undefined) {
    return Result.fail(InvalidJournalSnapshot.make({ reason: 'multiple-active-schedules', id: activeSchedules[1].id }))
  }
  if (activeGoals[1] !== undefined) {
    return Result.fail(InvalidJournalSnapshot.make({ reason: 'multiple-active-goals', id: activeGoals[1].id }))
  }
  const activeCompletedGoal = Option.getOrUndefined(Arr.findFirst(activeGoals, (goal) => goal.completedAt !== null))
  if (activeCompletedGoal !== undefined) {
    return Result.fail(InvalidJournalSnapshot.make({ reason: 'active-completed-goal', id: activeCompletedGoal.id }))
  }

  const seenPhases = MutableHashSet.empty<SchedulePhaseId>()
  for (const { id, phases } of schedules) {
    const rejection = validatePhases({ id, phases, seen: seenPhases })
    if (Option.isSome(rejection)) {
      return Result.fail(rejection.value)
    }
  }
  for (const { id, scheduleId } of injections) {
    if (scheduleId !== null && !Record.has(journal.schedules, scheduleId)) {
      return Result.fail(ScheduleNotFound.make({ scheduleId, injectionId: id }))
    }
  }
  return Result.succeed(journal)
}
