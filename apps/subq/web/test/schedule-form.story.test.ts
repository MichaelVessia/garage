// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import { Story } from 'foldkit'

import { CalendarDate, IanaTimezone } from '#shared'

import { FetchNextDose, FetchSchedules, OpenScheduleForm, SaveSchedule } from '../src/page/schedule/command.js'
import {
  AddedSchedulePhase,
  ChangedScheduleDrug,
  ChangedScheduleFrequency,
  ChangedScheduleName,
  ChangedScheduleNotes,
  ChangedSchedulePhaseDoseMg,
  ChangedSchedulePhaseDuration,
  ChangedScheduleStartDate,
  ChangedScheduleSupplier,
  ClickedAddSchedule,
  ClickedCancelScheduleForm,
  ClickedEditSchedule,
  CompletedOpenScheduleForm,
  FailedSaveSchedule,
  RemovedSchedulePhase,
  SubmittedScheduleForm,
  SucceededFetchSchedules,
  SucceededSaveSchedule,
  ToggledSchedulePhaseIndefinite,
  initialScheduleModel,
} from '../src/page/schedule/model.js'
import type { ScheduleModel, ScheduleMessage } from '../src/page/schedule/model.js'
import { updateSchedule } from '../src/page/schedule/update.js'
import { sampleSchedule, succeededNextDose, update, validForm } from './schedule-fixtures.js'

const { Command } = Story

describe('schedule page form update', () => {
  describe('opening the form', () => {
    it('adding a schedule opens a blank form seeded with a single default phase', () => {
      Story.story(
        update,
        Story.given(initialScheduleModel),
        Story.message(ClickedAddSchedule()),
        Command.resolveAll([OpenScheduleForm, CompletedOpenScheduleForm({ schedule: null, todayLocal: '2026-07-03' })]),
        Story.model((model: ScheduleModel) => {
          expect(model.form).not.toBeNull()
          expect(model.form?.editingId).toBeNull()
          expect(model.form?.frequency).toBe('weekly')
          expect(model.form?.startDate).toBe('2026-07-03')
          expect(model.form?.phases).toEqual([{ doseMg: '', durationDays: '28', isIndefinite: false, order: 1 }])
        })
      )
    })

    it('editing a schedule seeds the form from the existing schedule, mapping indefinite phases', () => {
      Story.story(
        update,
        Story.given(initialScheduleModel),
        Story.message(ClickedEditSchedule({ schedule: sampleSchedule })),
        Command.resolveAll([
          OpenScheduleForm,
          CompletedOpenScheduleForm({ schedule: sampleSchedule, todayLocal: '2026-07-03' }),
        ]),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.editingId).toBe(sampleSchedule.id)
          expect(model.form?.drug).toBe('Semaglutide')
          expect(model.form?.supplier).toBe('Pharmacy')
          expect(model.form?.name).toBe('Titration')
          expect(model.form?.notes).toBe('taper slowly')
          expect(model.form?.startDate).toBe('2026-01-15')
          expect(model.form?.phases).toEqual([
            { doseMg: '0.25', durationDays: '28', isIndefinite: false, order: 1 },
            { doseMg: '0.5', durationDays: '', isIndefinite: true, order: 2 },
          ])
        })
      )
    })

    it('keeps a planned date stable for clients in different timezones', () => {
      const opened = CompletedOpenScheduleForm({
        schedule: sampleSchedule,
        todayLocal: CalendarDate.make('2026-07-03'),
      })

      const { model: newYork } = updateSchedule(initialScheduleModel, opened, IanaTimezone.make('America/New_York'), 1)
      const { model: auckland } = updateSchedule(initialScheduleModel, opened, IanaTimezone.make('Pacific/Auckland'), 1)

      expect(newYork.form?.startDate).toBe('2026-01-15')
      expect(auckland.form?.startDate).toBe('2026-01-15')
    })

    it('cancelling the form closes it without side effects', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.given(withForm),
        Story.message(ClickedCancelScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form).toBeNull()
        })
      )
    })
  })

  describe('phase editing', () => {
    it('adding a phase appends a fresh default phase and un-indefinites the previous last phase', () => {
      const withIndefiniteLastPhase: ScheduleModel = {
        ...initialScheduleModel,
        form: {
          ...validForm,
          phases: [{ doseMg: '0.25', durationDays: '', isIndefinite: true, order: 1 }],
        },
      }

      Story.story(
        update,
        Story.given(withIndefiniteLastPhase),
        Story.message(AddedSchedulePhase()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases).toEqual([
            { doseMg: '0.25', durationDays: '28', isIndefinite: false, order: 1 },
            { doseMg: '', durationDays: '28', isIndefinite: false, order: 2 },
          ])
        })
      )
    })

    it('removing a phase reorders the remaining phases', () => {
      const withTwoPhases: ScheduleModel = {
        ...initialScheduleModel,
        form: {
          ...validForm,
          phases: [
            { doseMg: '0.25', durationDays: '28', isIndefinite: false, order: 1 },
            { doseMg: '0.5', durationDays: '28', isIndefinite: false, order: 2 },
          ],
        },
      }

      Story.story(
        update,
        Story.given(withTwoPhases),
        Story.message(RemovedSchedulePhase({ index: 0 })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases).toEqual([{ doseMg: '0.5', durationDays: '28', isIndefinite: false, order: 1 }])
        })
      )
    })

    it('removing the last remaining phase is a no-op: at least one phase is required', () => {
      const withOnePhase: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.given(withOnePhase),
        Story.message(RemovedSchedulePhase({ index: 0 })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases).toEqual(validForm.phases)
        })
      )
    })

    it('changing a phase doseMg or duration updates only that phase', () => {
      const withTwoPhases: ScheduleModel = {
        ...initialScheduleModel,
        form: {
          ...validForm,
          phases: [
            { doseMg: '0.25', durationDays: '28', isIndefinite: false, order: 1 },
            { doseMg: '0.5', durationDays: '28', isIndefinite: false, order: 2 },
          ],
        },
      }

      Story.story(
        update,
        Story.given(withTwoPhases),
        Story.message(ChangedSchedulePhaseDoseMg({ index: 1, value: '1' })),
        Command.expectNone(),
        Story.message(ChangedSchedulePhaseDuration({ index: 1, value: '56' })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases).toEqual([
            { doseMg: '0.25', durationDays: '28', isIndefinite: false, order: 1 },
            { doseMg: '1', durationDays: '56', isIndefinite: false, order: 2 },
          ])
        })
      )
    })

    it('toggling indefinite clears duration when checked and restores a default when unchecked', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.given(withForm),
        Story.message(ToggledSchedulePhaseIndefinite({ checked: true, index: 0 })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases[0]).toEqual({ doseMg: '0.25', durationDays: '', isIndefinite: true, order: 1 })
        }),
        Story.message(ToggledSchedulePhaseIndefinite({ checked: false, index: 0 })),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases[0]).toEqual({ doseMg: '0.25', durationDays: '28', isIndefinite: false, order: 1 })
        })
      )
    })
  })

  describe('form field changes', () => {
    it('name, drug, supplier, notes, start date, and frequency changes update the form', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.given(withForm),
        Story.message(ChangedScheduleName({ value: 'New Name' })),
        Story.message(ChangedScheduleDrug({ value: 'Tirzepatide' })),
        Story.message(ChangedScheduleSupplier({ value: 'Clinic' })),
        Story.message(ChangedScheduleNotes({ value: 'be careful' })),
        Story.message(ChangedScheduleStartDate({ value: '2026-02-01' })),
        Story.message(ChangedScheduleFrequency({ value: 'monthly' })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.name).toBe('New Name')
          expect(model.form?.drug).toBe('Tirzepatide')
          expect(model.form?.supplier).toBe('Clinic')
          expect(model.form?.notes).toBe('be careful')
          expect(model.form?.startDate).toBe('2026-02-01')
          expect(model.form?.frequency).toBe('monthly')
        })
      )
    })
  })

  describe('submit validation', () => {
    it('does nothing when there is no open form', () => {
      Story.story(
        update,
        Story.given(initialScheduleModel),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form).toBeNull()
        })
      )
    })

    it('requires a schedule name', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: { ...validForm, name: '  ' } }
      Story.story(
        update,
        Story.given(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('Schedule name is required')
        })
      )
    })

    it('requires a medication', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: { ...validForm, drug: '' } }
      Story.story(
        update,
        Story.given(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('Select a supported medication')
        })
      )
    })

    it('requires a start date', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: { ...validForm, startDate: '' } }
      Story.story(
        update,
        Story.given(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('Start date is required')
        })
      )
    })

    it('requires at least one phase', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: { ...validForm, phases: [] } }
      Story.story(
        update,
        Story.given(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('At least one phase is required')
        })
      )
    })

    it('rejects non-milligram and non-positive phase doses', () => {
      const withForm: ScheduleModel = {
        ...initialScheduleModel,
        form: { ...validForm, phases: [{ doseMg: '0.5ml', durationDays: '28', isIndefinite: false, order: 1 }] },
      }

      Story.story(
        update,
        Story.given(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('Phase 1: enter a positive dose in milligrams')
        })
      )
    })

    it('requires a duration for phases that are not indefinite', () => {
      const withForm: ScheduleModel = {
        ...initialScheduleModel,
        form: { ...validForm, phases: [{ doseMg: '0.25', durationDays: '0', isIndefinite: false, order: 1 }] },
      }

      Story.story(
        update,
        Story.given(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('Phase 1: duration is required')
        })
      )
    })

    it('only allows the last phase to be indefinite', () => {
      const withForm: ScheduleModel = {
        ...initialScheduleModel,
        form: {
          ...validForm,
          phases: [
            { doseMg: '0.25', durationDays: '', isIndefinite: true, order: 1 },
            { doseMg: '0.5', durationDays: '28', isIndefinite: false, order: 2 },
          ],
        },
      }

      Story.story(
        update,
        Story.given(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('Only the last phase can be indefinite')
        })
      )
    })

    it('a valid submission saves, closes the form, and refetches schedules and next dose', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.given(withForm),
        Story.message(SubmittedScheduleForm()),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.submitting).toBe(true)
          expect(model.form?.error).toBeNull()
        }),
        (simulation: Story.StorySimulation<ScheduleModel, ScheduleMessage>) => {
          const [command] = simulation.commands
          expect(command?.name).toBe('SaveSchedule')
          expect(command?.args).toEqual({
            drug: 'Semaglutide',
            editingId: null,
            frequency: 'weekly',
            name: 'Titration',
            notes: '',
            phases: validForm.phases,
            startDate: '2026-01-01',
            supplier: 'Pharmacy',
          })

          return simulation
        },
        Command.resolveAll(
          [SaveSchedule, SucceededSaveSchedule()],
          [FetchSchedules, SucceededFetchSchedules({ schedules: [sampleSchedule] })],
          [FetchNextDose, succeededNextDose()]
        ),
        Story.model((model: ScheduleModel) => {
          expect(model.form).toBeNull()
          expect(model.schedules._tag).toBe('Success')
          expect(model.nextDose._tag).toBe('Success')
        })
      )
    })

    it('a failed save keeps the form open with the error and stops submitting', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.given(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.resolveAll([SaveSchedule, FailedSaveSchedule({ message: 'Failed to save schedule' })]),
        Story.model((model: ScheduleModel) => {
          expect(model.form).not.toBeNull()
          expect(model.form?.error).toBe('Failed to save schedule')
          expect(model.form?.submitting).toBe(false)
        })
      )
    })
  })
})
