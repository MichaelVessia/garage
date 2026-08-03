import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'

import {
  DoseMg,
  MedicationCompound,
  Supplier,
  InjectionLog,
  InjectionLogId,
  InjectionSchedule,
  InjectionScheduleId,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
  currentPhase,
  nextDose,
  scheduleView,
} from '#shared'

const timestamp = DateTime.makeUnsafe('2024-01-01T00:00:00Z')

const makeSchedule = (
  phases: ReadonlyArray<{ readonly order: number; readonly durationDays: number | null; readonly doseMg: number }>,
  startDate = DateTime.makeUnsafe('2024-01-01T00:00:00Z')
) => {
  const scheduleId = InjectionScheduleId.make('schedule-1')

  return new InjectionSchedule({
    id: scheduleId,
    name: ScheduleName.make('Test schedule'),
    drug: MedicationCompound.make('Semaglutide'),
    supplier: Supplier.make('Compounded'),
    frequency: 'weekly',
    startDate,
    isActive: true,
    notes: null,
    phases: phases.map(
      (phase) =>
        new SchedulePhase({
          id: SchedulePhaseId.make(`phase-${phase.order}`),
          scheduleId,
          order: PhaseOrder.make(phase.order),
          durationDays: phase.durationDays === null ? null : PhaseDurationDays.make(phase.durationDays),
          doseMg: DoseMg.make(phase.doseMg),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

const makeInjection = (id: string, datetime: string, doseMg: number, scheduleId: InjectionScheduleId) =>
  new InjectionLog({
    id: InjectionLogId.make(id),
    datetime: DateTime.makeUnsafe(datetime),
    drug: MedicationCompound.make('Semaglutide'),
    supplier: Supplier.make('Compounded'),
    doseMg: DoseMg.make(doseMg),
    injectionSite: null,
    notes: null,
    scheduleId,
    createdAt: timestamp,
    updatedAt: timestamp,
  })

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }
  return value
}

describe('ScheduleEngine', () => {
  it('keeps the current phase before an indefinite maintenance phase is reached', () => {
    const schedule = makeSchedule([
      { order: 1, durationDays: 28, doseMg: 2.5 },
      { order: 2, durationDays: null, doseMg: 5 },
    ])

    const active = Option.getOrThrow(currentPhase(schedule, DateTime.makeUnsafe('2024-01-20T00:00:00Z')))

    expect(active.phase.order).toBe(1)
    expect(active.phase.doseMg).toBe(2.5)
  })

  it('calculates the next scheduled dose from the active phase and last injection', () => {
    const schedule = makeSchedule([
      { order: 1, durationDays: 28, doseMg: 2.5 },
      { order: 2, durationDays: 28, doseMg: 5 },
      { order: 3, durationDays: null, doseMg: 7.5 },
    ])

    const dose = Option.getOrThrow(
      nextDose(
        schedule,
        Option.some(DateTime.makeUnsafe('2024-03-08T12:00:00Z')),
        DateTime.makeUnsafe('2024-03-15T12:00:00Z')
      )
    )

    expect(dose.currentPhase).toBe(3)
    expect(dose.doseMg).toBe(7.5)
    expect(DateTime.formatIso(dose.suggestedDate)).toBe('2024-03-15T12:00:00.000Z')
    expect(dose.daysUntilDue).toBe(0)
    expect(dose.isOverdue).toBe(false)
  })

  it('builds a schedule view with phase status, expected counts, and assigned injections', () => {
    const schedule = makeSchedule([
      { order: 1, durationDays: 28, doseMg: 2.5 },
      { order: 2, durationDays: null, doseMg: 5 },
    ])
    const injections = [
      makeInjection('injection-1', '2024-01-01T00:00:00Z', 2.5, schedule.id),
      makeInjection('injection-2', '2024-01-08T00:00:00Z', 2.5, schedule.id),
      makeInjection('injection-3', '2024-01-29T00:00:00Z', 5, schedule.id),
    ]

    const view = scheduleView(schedule, injections, DateTime.makeUnsafe('2024-02-05T00:00:00Z'))
    const firstPhase = requireValue(view.phases[0])
    const secondPhase = requireValue(view.phases[1])

    expect(view.endDate).toBeNull()
    expect(view.totalExpectedInjections).toBeNull()
    expect(view.totalCompletedInjections).toBe(3)
    expect(firstPhase.status).toBe('completed')
    expect(firstPhase.expectedInjections).toBe(4)
    expect(firstPhase.completedInjections).toBe(2)
    expect(secondPhase.status).toBe('current')
    expect(secondPhase.expectedInjections).toBeNull()
    expect(secondPhase.completedInjections).toBe(1)
  })
})
