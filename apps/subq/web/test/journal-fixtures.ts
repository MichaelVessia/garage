import { CalendarDate, IanaTimezone } from '@garage/subq-domain/Calendar'
import { GoalId, InjectionId, ScheduleId, SchedulePhaseId, WeightId } from '@garage/subq-domain/Journal/Journal.id'
import { Goal, InjectionEntry, Schedule, WeightEntry } from '@garage/subq-domain/Journal/JournalRecords'
import {
  DoseMg,
  InjectionSite,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  Supplier,
  WeightLbs,
} from '@garage/subq-domain/Values'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import { Scene } from 'foldkit'
import { fromString } from 'foldkit/url'

import { init, update } from '../src/main.ts'
import { Shell } from '../src/model.ts'
import type { Model } from '../src/model.ts'
import { view } from '../src/view.ts'

export const app = { update, view }
export const today = CalendarDate.make('2026-11-25')
export const timezone = IanaTimezone.make('America/New_York')
export const session = 'test-session'
export const url = (path: string) => Option.getOrThrow(fromString(`https://subq.example${path}`))
export const initial = (path = '/') => init({ session, today, timezone }, url(path)).model
export const route = (path: string) => Scene.Subscription.emit(Shell.ChangedUrl({ url: url(path) }))
export const receipt = { stream: 'Journal/personal', version: 4 }

const recordedAt = DateTime.makeUnsafe('2026-11-01T05:30:45.123Z')
const audit = { createdAt: recordedAt, updatedAt: recordedAt }

export const weight = WeightEntry.make({
  ...audit,
  id: WeightId.make('weight-1'),
  recordedAt,
  weightLbs: WeightLbs.make(190),
  notes: null,
})
export const schedule = Schedule.make({
  ...audit,
  id: ScheduleId.make('schedule-1'),
  name: ScheduleName.make('Titration'),
  compound: 'Semaglutide',
  supplier: Supplier.make('Example supplier'),
  frequency: 'weekly',
  startDate: CalendarDate.make('2026-11-01'),
  notes: null,
  isActive: true,
  phases: [
    {
      ...audit,
      id: SchedulePhaseId.make('phase-1'),
      order: PhaseOrder.make(1),
      doseMg: DoseMg.make(0.25),
      durationDays: PhaseDurationDays.make(14),
    },
    {
      ...audit,
      id: SchedulePhaseId.make('phase-2'),
      order: PhaseOrder.make(2),
      doseMg: DoseMg.make(0.5),
      durationDays: null,
    },
  ],
})
export const injection = InjectionEntry.make({
  ...audit,
  id: InjectionId.make('injection-1'),
  administeredAt: recordedAt,
  compound: schedule.compound,
  doseMg: DoseMg.make(0.25),
  supplier: schedule.supplier,
  site: InjectionSite.make('Left thigh'),
  notes: Notes.make('First dose'),
  scheduleId: schedule.id,
})
export const goal = Goal.make({
  ...audit,
  id: GoalId.make('goal-1'),
  goalWeightLbs: WeightLbs.make(175),
  startingWeightLbs: WeightLbs.make(200),
  startingDate: CalendarDate.make('2026-11-01'),
  targetDate: null,
  notes: null,
  isActive: true,
  completedAt: null,
})
export const profile: NonNullable<Model['profile']> = {
  preferences: { timezone },
  schedules: { [schedule.id]: schedule },
  goals: { [goal.id]: goal },
  latestWeight: weight,
  lastInjection: injection,
  knownSites: [InjectionSite.make('Left thigh')],
}
export const loaded = (path = '/'): Model => ({
  ...initial(path),
  profile,
  weights: { [weight.id]: weight },
  injectionHistory: { [injection.id]: injection },
})

export const press = (name: string) => Scene.click(Scene.role('button', { name }))
export const shows = (content: string) => Scene.expect(Scene.text(content)).toExist()
