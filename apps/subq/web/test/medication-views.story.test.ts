// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as P from 'effect/Predicate'
import * as AsyncData from 'foldkit/asyncData'

import {
  CalendarDate,
  DoseMg,
  InjectionLog,
  InjectionLogId,
  InjectionSchedule,
  InjectionScheduleId,
  IanaTimezone,
  MedicationCompound,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseId,
  Supplier,
} from '#shared'

import { initialInjectionsModel, viewInjections } from '../src/page/injections.js'
import type { InjectionsModel } from '../src/page/injections.js'
import { initialScheduleModel, viewSchedule } from '../src/page/schedule.js'
import type { ScheduleModel } from '../src/page/schedule.js'

interface ViewNode {
  readonly sel: string | undefined
  readonly data:
    | {
        readonly props?: Readonly<Record<string, unknown>>
      }
    | undefined
  readonly children: ReadonlyArray<ViewNode | string> | undefined
  readonly text: string | undefined
}

const findById = (node: ViewNode | null, id: string): ViewNode | null => {
  if (node === null) {
    return null
  }
  if (node.data?.props?.id === id) {
    return node
  }
  for (const child of node.children ?? []) {
    if (!P.isString(child)) {
      const found = findById(child, id)
      if (found !== null) {
        return found
      }
    }
  }
  return null
}

const textContent = (node: ViewNode | null): string =>
  node === null
    ? ''
    : `${node.text ?? ''}${(node.children ?? [])
        .map((child) => (P.isString(child) ? child : textContent(child)))
        .join('')}`

const timestamp = DateTime.makeUnsafe('2026-01-01T00:00:00Z')
const scheduleId = InjectionScheduleId.make('schedule-1')

const schedule = new InjectionSchedule({
  createdAt: timestamp,
  drug: MedicationCompound.make('Semaglutide'),
  frequency: 'weekly',
  id: scheduleId,
  isActive: true,
  name: ScheduleName.make('Titration'),
  notes: null,
  phases: [
    {
      createdAt: timestamp,
      doseMg: DoseMg.make(0.25),
      durationDays: PhaseDurationDays.make(28),
      id: SchedulePhaseId.make('phase-1'),
      order: PhaseOrder.make(1),
      scheduleId,
      updatedAt: timestamp,
    },
  ],
  startDate: CalendarDate.make('2026-01-01'),
  supplier: Supplier.make('Clinic'),
  updatedAt: timestamp,
})

const injection = new InjectionLog({
  createdAt: timestamp,
  datetime: DateTime.makeUnsafe('2026-01-08T12:00:00Z'),
  doseMg: DoseMg.make(0.25),
  drug: MedicationCompound.make('Semaglutide'),
  id: InjectionLogId.make('injection-1'),
  injectionSite: null,
  notes: null,
  scheduleId,
  supplier: Supplier.make('Pharmacy'),
  updatedAt: timestamp,
})

describe('canonical medication views', () => {
  it('renders a closed compound select, numeric dose control, supplier, and canonical injection values', () => {
    const model: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: false,
        datetime: '2026-01-08T12:00',
        doseMg: '0.25',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        injectionSite: '',
        maxDatetime: '2026-01-09T12:00',
        notes: '',
        originalDatetime: null,
        scheduleId,
        submitting: false,
        supplier: 'Pharmacy',
      },
      logs: AsyncData.succeed([injection]),
      schedules: AsyncData.succeed([schedule]),
      sites: AsyncData.succeed([]),
    }

    const view = viewInjections(model, IanaTimezone.make('UTC'))
    const medication = findById(view, 'injection-drug')
    const dose = findById(view, 'injection-dose-mg')
    const supplier = findById(view, 'injection-supplier')

    expect(medication?.sel).toBe('select')
    expect(textContent(medication ?? view)).toContain('Dulaglutide')
    expect(textContent(medication ?? view)).not.toContain('Ozempic')
    expect(dose?.data?.props?.type).toBe('number')
    expect(supplier?.data?.props?.value).toBe('Pharmacy')
    expect(textContent(view)).toContain('0.25 mg')
    expect(textContent(view)).toContain('Pharmacy')
  })

  it('renders the same closed compound, numeric dose, and supplier controls for schedules', () => {
    const model: ScheduleModel = {
      ...initialScheduleModel,
      form: {
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        frequency: 'weekly',
        name: 'Titration',
        notes: '',
        phases: [{ doseMg: '0.25', durationDays: '28', isIndefinite: false, order: 1 }],
        startDate: '2026-01-01',
        submitting: false,
        supplier: 'Clinic',
      },
      schedules: AsyncData.succeed([schedule]),
    }

    const view = viewSchedule(model)
    const medication = findById(view, 'schedule-drug')
    const supplier = findById(view, 'schedule-supplier')

    expect(medication?.sel).toBe('select')
    expect(textContent(medication ?? view)).toContain('Retatrutide')
    expect(textContent(medication ?? view)).not.toContain('Compounded')
    expect(supplier?.data?.props?.value).toBe('Clinic')
    expect(textContent(view)).toContain('0.25 mg')
    expect(textContent(view)).toContain('Supplier: Clinic')
  })
})
