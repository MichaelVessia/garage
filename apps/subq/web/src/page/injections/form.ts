import type { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import { DoseMg, MedicationCompound } from '@garage/subq-domain/Values'
import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import type { InjectionForm } from './model.ts'

// Form validation and schedule-dose matching shared by update and view.

const parseDoseMg = (value: string): Option.Option<DoseMg> => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? Option.some(DoseMg.make(parsed)) : Option.none()
}

export const validateForm = (form: InjectionForm): Option.Option<string> => {
  if (form.datetime === '') {
    return Option.some('Date & time is required')
  }

  if (!Schema.is(MedicationCompound)(form.compound)) {
    return Option.some('Select a supported medication')
  }

  if (Option.isNone(parseDoseMg(form.doseMg))) {
    return Option.some('Enter a positive dose in milligrams')
  }

  return Option.none()
}

export const scheduleById: {
  (scheduleId: string): (schedules: ReadonlyArray<Schedule>) => Option.Option<Schedule>
  (schedules: ReadonlyArray<Schedule>, scheduleId: string): Option.Option<Schedule>
} = Function.dual(2, (schedules: ReadonlyArray<Schedule>, scheduleId: string): Option.Option<Schedule> =>
  Arr.findFirst(schedules, (schedule) => schedule.id === scheduleId)
)

export const scheduleDoseMgs = (schedule: Option.Option<Schedule>): ReadonlyArray<DoseMg> =>
  Option.match(schedule, {
    onNone: () => [],
    onSome: (found) => Arr.dedupe(Arr.map(found.phases, (phase) => phase.doseMg)),
  })

export const isOffScheduleDose: {
  (schedules: ReadonlyArray<Schedule>): (form: InjectionForm) => boolean
  (form: InjectionForm, schedules: ReadonlyArray<Schedule>): boolean
} = Function.dual(2, (form: InjectionForm, schedules: ReadonlyArray<Schedule>): boolean => {
  if (form.scheduleId === '') {
    return false
  }

  const doseMg = parseDoseMg(form.doseMg)
  const doseMgs = scheduleDoseMgs(scheduleById(schedules, form.scheduleId))

  return Option.isSome(doseMg) && Arr.isReadonlyArrayNonEmpty(doseMgs) && !Arr.contains(doseMgs, doseMg.value)
})
