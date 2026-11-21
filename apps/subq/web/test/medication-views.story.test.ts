// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as P from 'effect/Predicate'
import { AsyncData, Scene } from 'foldkit'
import type { Html } from 'foldkit/html'

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
  SchedulePhase,
  SchedulePhaseId,
  Supplier,
} from '#shared'

import { initialInjectionsModel } from '../src/page/injections/model.js'
import type { InjectionsMessage, InjectionsModel } from '../src/page/injections/model.js'
import { updateInjections } from '../src/page/injections/update.js'
import { viewInjections } from '../src/page/injections/view.js'
import { initialScheduleModel } from '../src/page/schedule/model.js'
import type { ScheduleMessage, ScheduleModel } from '../src/page/schedule/model.js'
import { updateSchedule } from '../src/page/schedule/update.js'
import { viewSchedule } from '../src/page/schedule/view.js'

type ViewNode = NonNullable<Html>

const findById = (node: Option.Option<ViewNode>, id: string): Option.Option<ViewNode> => {
  if (Option.isNone(node)) {
    return Option.none()
  }

  if (node.value.data?.props?.id === id) {
    return node
  }

  for (const child of node.value.children ?? []) {
    if (!P.isString(child)) {
      const found = findById(Option.some(child), id)

      if (Option.isSome(found)) {
        return found
      }
    }
  }

  return Option.none()
}

const textContent = (node: Option.Option<ViewNode>): string =>
  Option.match(node, {
    onNone: () => '',
    onSome: (value) =>
      `${value.text ?? ''}${Arr.join(
        Arr.map(value.children ?? [], (child) => (P.isString(child) ? child : textContent(Option.some(child)))),
        ''
      )}`,
  })

const timestamp = DateTime.makeUnsafe('2026-01-01T00:00:00Z')

const scheduleId = InjectionScheduleId.make('schedule-1')

const schedule = InjectionSchedule.make({
  createdAt: timestamp,
  drug: MedicationCompound.make('Semaglutide'),
  frequency: 'weekly',
  id: scheduleId,
  isActive: true,
  name: ScheduleName.make('Titration'),
  notes: null,
  phases: [
    SchedulePhase.make({
      createdAt: timestamp,
      doseMg: DoseMg.make(0.25),
      durationDays: PhaseDurationDays.make(28),
      id: SchedulePhaseId.make('phase-1'),
      order: PhaseOrder.make(1),
      scheduleId,
      updatedAt: timestamp,
    }),
  ],
  startDate: CalendarDate.make('2026-01-01'),
  supplier: Supplier.make('Clinic'),
  updatedAt: timestamp,
})

const injection = InjectionLog.make({
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

    const timezone = IanaTimezone.make('UTC')
    Scene.scene(
      {
        update: (currentModel: InjectionsModel, message: InjectionsMessage) =>
          updateInjections(currentModel, message, timezone),
        view: (currentModel, h) => viewInjections({ h, model: currentModel, timezone }),
      },
      Scene.given(model),
      Scene.tap<InjectionsModel, InjectionsMessage>(({ html: view }) => {
        const viewOption = Option.fromNullishOr(view)
        const medication = findById(viewOption, 'injection-drug')
        const dose = findById(viewOption, 'injection-dose-mg')
        const supplier = findById(viewOption, 'injection-supplier')

        expect(Option.getOrUndefined(medication)?.sel).toBe('select')
        expect(textContent(Option.orElse(medication, () => viewOption))).toContain('Dulaglutide')
        expect(textContent(Option.orElse(medication, () => viewOption))).not.toContain('Ozempic')
        expect(Option.getOrUndefined(dose)?.data?.props?.type).toBe('number')
        expect(Option.getOrUndefined(supplier)?.data?.props?.value).toBe('Pharmacy')
        expect(textContent(viewOption)).toContain('0.25 mg')
        expect(textContent(viewOption)).toContain('Pharmacy')
      })
    )
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

    const timezone = IanaTimezone.make('UTC')
    Scene.scene(
      {
        update: (currentModel: ScheduleModel, message: ScheduleMessage) =>
          updateSchedule(currentModel, message, timezone, 1),
        view: (currentModel, h) => viewSchedule({ h, model: currentModel }),
      },
      Scene.given(model),
      Scene.tap<ScheduleModel, ScheduleMessage>(({ html: view }) => {
        const viewOption = Option.fromNullishOr(view)
        const medication = findById(viewOption, 'schedule-drug')
        const supplier = findById(viewOption, 'schedule-supplier')

        expect(Option.getOrUndefined(medication)?.sel).toBe('select')
        expect(textContent(Option.orElse(medication, () => viewOption))).toContain('Retatrutide')
        expect(textContent(Option.orElse(medication, () => viewOption))).not.toContain('Compounded')
        expect(Option.getOrUndefined(supplier)?.data?.props?.value).toBe('Clinic')
        expect(textContent(viewOption)).toContain('0.25 mg')
        expect(textContent(viewOption)).toContain('Supplier: Clinic')
      })
    )
  })
})
