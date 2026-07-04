// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as AsyncData from 'foldkit/asyncData'
import * as Story from 'foldkit/story'

import {
  Dosage,
  DrugName,
  InjectionSchedule,
  InjectionScheduleId,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseId,
} from '#shared'

import { utcToLocalDateString } from '../src/lib/datetime.js'
import {
  AddedSchedulePhase,
  CancelledDeleteSchedule,
  ChangedScheduleDrug,
  ChangedScheduleFrequency,
  ChangedScheduleName,
  ChangedScheduleNotes,
  ChangedSchedulePhaseDosage,
  ChangedSchedulePhaseDuration,
  ChangedScheduleStartDate,
  ClickedActivateSchedule,
  ClickedAddSchedule,
  ClickedCancelScheduleForm,
  ClickedEditSchedule,
  ConfirmedDeleteSchedule,
  FailedActivateSchedule,
  FailedDeleteSchedule,
  FailedFetchNextDose,
  FailedFetchScheduleDrugs,
  FailedFetchSchedules,
  FailedSaveSchedule,
  FetchNextDose,
  FetchSchedules,
  OpenedScheduleForm,
  RemovedSchedulePhase,
  RequestedDeleteSchedule,
  SubmittedScheduleForm,
  SucceededActivateSchedule,
  SucceededDeleteSchedule,
  SucceededFetchNextDose,
  SucceededFetchScheduleDrugs,
  SucceededFetchSchedules,
  SucceededSaveSchedule,
  ToggledSchedulePhaseIndefinite,
  fetchScheduleIfIdle,
  initialScheduleModel,
  updateSchedule,
} from '../src/page/schedule.js'
import type { ScheduleModel, ScheduleMessage } from '../src/page/schedule.js'

const { Command } = Story

const update = (model: ScheduleModel, message: ScheduleMessage) => updateSchedule(model, message)

const sampleSchedule = new InjectionSchedule({
  createdAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
  drug: DrugName.make('Semaglutide'),
  frequency: 'weekly',
  id: InjectionScheduleId.make('schedule-1'),
  isActive: false,
  name: ScheduleName.make('Titration'),
  notes: Notes.make('taper slowly'),
  phases: [
    {
      createdAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
      dosage: Dosage.make('0.25mg'),
      durationDays: PhaseDurationDays.make(28),
      id: SchedulePhaseId.make('phase-1'),
      order: PhaseOrder.make(1),
      scheduleId: InjectionScheduleId.make('schedule-1'),
      updatedAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
    },
    {
      createdAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
      dosage: Dosage.make('0.5mg'),
      durationDays: null,
      id: SchedulePhaseId.make('phase-2'),
      order: PhaseOrder.make(2),
      scheduleId: InjectionScheduleId.make('schedule-1'),
      updatedAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
    },
  ],
  source: null,
  startDate: DateTime.makeUnsafe('2026-01-15T00:00:00Z'),
  updatedAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
})

const validForm: ScheduleModel['form'] = {
  drug: 'Semaglutide',
  editingId: null,
  error: null,
  frequency: 'weekly',
  name: 'Titration',
  notes: '',
  phases: [{ dosage: '0.25mg', durationDays: '28', isIndefinite: false, order: 1 }],
  startDate: '2026-01-01',
  submitting: false,
}

describe('schedule page update', () => {
  describe('opening the form', () => {
    it('adding a schedule opens a blank form seeded with a single default phase', () => {
      Story.story(
        update,
        Story.with(initialScheduleModel),
        Story.message(ClickedAddSchedule()),
        Command.resolveAll([
          { name: 'OpenScheduleForm' },
          OpenedScheduleForm({ schedule: null, todayLocal: '2026-07-03' }),
        ]),
        Story.model((model: ScheduleModel) => {
          expect(model.form).not.toBeNull()
          expect(model.form?.editingId).toBeNull()
          expect(model.form?.frequency).toBe('weekly')
          expect(model.form?.startDate).toBe('2026-07-03')
          expect(model.form?.phases).toEqual([{ dosage: '', durationDays: '28', isIndefinite: false, order: 1 }])
        })
      )
    })

    it('editing a schedule seeds the form from the existing schedule, mapping indefinite phases', () => {
      Story.story(
        update,
        Story.with(initialScheduleModel),
        Story.message(ClickedEditSchedule({ schedule: sampleSchedule })),
        Command.resolveAll([
          { name: 'OpenScheduleForm' },
          OpenedScheduleForm({ schedule: sampleSchedule, todayLocal: '2026-07-03' }),
        ]),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.editingId).toBe(sampleSchedule.id)
          expect(model.form?.drug).toBe('Semaglutide')
          expect(model.form?.name).toBe('Titration')
          expect(model.form?.notes).toBe('taper slowly')
          expect(model.form?.startDate).toBe(utcToLocalDateString(sampleSchedule.startDate))
          expect(model.form?.phases).toEqual([
            { dosage: '0.25mg', durationDays: '28', isIndefinite: false, order: 1 },
            { dosage: '0.5mg', durationDays: '', isIndefinite: true, order: 2 },
          ])
        })
      )
    })

    it('cancelling the form closes it without side effects', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.with(withForm),
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
          phases: [{ dosage: '0.25mg', durationDays: '', isIndefinite: true, order: 1 }],
        },
      }
      Story.story(
        update,
        Story.with(withIndefiniteLastPhase),
        Story.message(AddedSchedulePhase()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases).toEqual([
            { dosage: '0.25mg', durationDays: '28', isIndefinite: false, order: 1 },
            { dosage: '', durationDays: '28', isIndefinite: false, order: 2 },
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
            { dosage: '0.25mg', durationDays: '28', isIndefinite: false, order: 1 },
            { dosage: '0.5mg', durationDays: '28', isIndefinite: false, order: 2 },
          ],
        },
      }
      Story.story(
        update,
        Story.with(withTwoPhases),
        Story.message(RemovedSchedulePhase({ index: 0 })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases).toEqual([{ dosage: '0.5mg', durationDays: '28', isIndefinite: false, order: 1 }])
        })
      )
    })

    it('removing the last remaining phase is a no-op: at least one phase is required', () => {
      const withOnePhase: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.with(withOnePhase),
        Story.message(RemovedSchedulePhase({ index: 0 })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases).toEqual(validForm.phases)
        })
      )
    })

    it('changing a phase dosage or duration updates only that phase', () => {
      const withTwoPhases: ScheduleModel = {
        ...initialScheduleModel,
        form: {
          ...validForm,
          phases: [
            { dosage: '0.25mg', durationDays: '28', isIndefinite: false, order: 1 },
            { dosage: '0.5mg', durationDays: '28', isIndefinite: false, order: 2 },
          ],
        },
      }
      Story.story(
        update,
        Story.with(withTwoPhases),
        Story.message(ChangedSchedulePhaseDosage({ index: 1, value: '1mg' })),
        Command.expectNone(),
        Story.message(ChangedSchedulePhaseDuration({ index: 1, value: '56' })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases).toEqual([
            { dosage: '0.25mg', durationDays: '28', isIndefinite: false, order: 1 },
            { dosage: '1mg', durationDays: '56', isIndefinite: false, order: 2 },
          ])
        })
      )
    })

    it('toggling indefinite clears duration when checked and restores a default when unchecked', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.with(withForm),
        Story.message(ToggledSchedulePhaseIndefinite({ checked: true, index: 0 })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases[0]).toEqual({ dosage: '0.25mg', durationDays: '', isIndefinite: true, order: 1 })
        }),
        Story.message(ToggledSchedulePhaseIndefinite({ checked: false, index: 0 })),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.phases[0]).toEqual({ dosage: '0.25mg', durationDays: '28', isIndefinite: false, order: 1 })
        })
      )
    })
  })

  describe('form field changes', () => {
    it('name, drug, notes, start date, and frequency changes update the form', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.with(withForm),
        Story.message(ChangedScheduleName({ value: 'New Name' })),
        Story.message(ChangedScheduleDrug({ value: 'Tirzepatide' })),
        Story.message(ChangedScheduleNotes({ value: 'be careful' })),
        Story.message(ChangedScheduleStartDate({ value: '2026-02-01' })),
        Story.message(ChangedScheduleFrequency({ value: 'monthly' })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.name).toBe('New Name')
          expect(model.form?.drug).toBe('Tirzepatide')
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
        Story.with(initialScheduleModel),
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
        Story.with(withForm),
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
        Story.with(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('Medication is required')
        })
      )
    })

    it('requires a start date', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: { ...validForm, startDate: '' } }
      Story.story(
        update,
        Story.with(withForm),
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
        Story.with(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('At least one phase is required')
        })
      )
    })

    it('requires each phase dosage to include a recognized unit', () => {
      const withForm: ScheduleModel = {
        ...initialScheduleModel,
        form: { ...validForm, phases: [{ dosage: '25', durationDays: '28', isIndefinite: false, order: 1 }] },
      }
      Story.story(
        update,
        Story.with(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.form?.error).toBe('Phase 1: enter dosage with unit')
        })
      )
    })

    it('requires a duration for phases that are not indefinite', () => {
      const withForm: ScheduleModel = {
        ...initialScheduleModel,
        form: { ...validForm, phases: [{ dosage: '0.25mg', durationDays: '0', isIndefinite: false, order: 1 }] },
      }
      Story.story(
        update,
        Story.with(withForm),
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
            { dosage: '0.25mg', durationDays: '', isIndefinite: true, order: 1 },
            { dosage: '0.5mg', durationDays: '28', isIndefinite: false, order: 2 },
          ],
        },
      }
      Story.story(
        update,
        Story.with(withForm),
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
        Story.with(withForm),
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
          })
          return simulation
        },
        Command.resolveAll(
          [{ name: 'SaveSchedule' }, SucceededSaveSchedule()],
          [FetchSchedules, SucceededFetchSchedules({ schedules: [sampleSchedule] })],
          [FetchNextDose, SucceededFetchNextDose({ nextDose: null })]
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
        Story.with(withForm),
        Story.message(SubmittedScheduleForm()),
        Command.resolveAll([{ name: 'SaveSchedule' }, FailedSaveSchedule({ message: 'Failed to save schedule' })]),
        Story.model((model: ScheduleModel) => {
          expect(model.form).not.toBeNull()
          expect(model.form?.error).toBe('Failed to save schedule')
          expect(model.form?.submitting).toBe(false)
        })
      )
    })
  })

  describe('delete flow', () => {
    it('requesting a delete closes any open form and asks for confirmation', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.with(withForm),
        Story.message(RequestedDeleteSchedule({ id: sampleSchedule.id })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.pendingDeleteId).toBe(sampleSchedule.id)
          expect(model.form).toBeNull()
        })
      )
    })

    it('cancelling a delete clears the pending id', () => {
      const withPending: ScheduleModel = { ...initialScheduleModel, pendingDeleteId: sampleSchedule.id }
      Story.story(
        update,
        Story.with(withPending),
        Story.message(CancelledDeleteSchedule()),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.pendingDeleteId).toBeNull()
        })
      )
    })

    it('confirming with no pending id does nothing', () => {
      Story.story(
        update,
        Story.with(initialScheduleModel),
        Story.message(ConfirmedDeleteSchedule()),
        Command.expectNone()
      )
    })

    it('confirming a delete removes the schedule and refetches', () => {
      const withPending: ScheduleModel = { ...initialScheduleModel, pendingDeleteId: sampleSchedule.id }
      Story.story(
        update,
        Story.with(withPending),
        Story.message(ConfirmedDeleteSchedule()),
        Command.resolveAll(
          [{ name: 'DeleteSchedule' }, SucceededDeleteSchedule()],
          [FetchSchedules, SucceededFetchSchedules({ schedules: [] })],
          [FetchNextDose, SucceededFetchNextDose({ nextDose: null })]
        ),
        Story.model((model: ScheduleModel) => {
          expect(model.pendingDeleteId).toBeNull()
          expect(model.schedules._tag).toBe('Success')
        })
      )
    })

    it('a failed delete clears the pending id without refetching', () => {
      const withPending: ScheduleModel = { ...initialScheduleModel, pendingDeleteId: sampleSchedule.id }
      Story.story(
        update,
        Story.with(withPending),
        Story.message(ConfirmedDeleteSchedule()),
        Command.resolveAll([
          { name: 'DeleteSchedule' },
          FailedDeleteSchedule({ message: 'Failed to delete schedule' }),
        ]),
        Story.model((model: ScheduleModel) => {
          expect(model.pendingDeleteId).toBeNull()
        })
      )
    })
  })

  describe('activation', () => {
    it('activating a schedule refetches schedules and next dose on success', () => {
      Story.story(
        update,
        Story.with(initialScheduleModel),
        Story.message(ClickedActivateSchedule({ schedule: sampleSchedule })),
        Command.resolveAll(
          [{ name: 'ActivateSchedule' }, SucceededActivateSchedule()],
          [FetchSchedules, SucceededFetchSchedules({ schedules: [sampleSchedule] })],
          [FetchNextDose, SucceededFetchNextDose({ nextDose: null })]
        ),
        Story.model((model: ScheduleModel) => {
          expect(model.schedules._tag).toBe('Success')
        })
      )
    })

    it('a failed activation leaves the model untouched', () => {
      Story.story(
        update,
        Story.with(initialScheduleModel),
        Story.message(ClickedActivateSchedule({ schedule: sampleSchedule })),
        Command.resolveAll([
          { name: 'ActivateSchedule' },
          FailedActivateSchedule({ message: 'Failed to activate schedule' }),
        ]),
        Story.model((model: ScheduleModel) => {
          expect(model).toEqual(initialScheduleModel)
        })
      )
    })
  })

  describe('fetch results', () => {
    it('failed fetches mark each data slice as a Failure', () => {
      Story.story(
        update,
        Story.with(initialScheduleModel),
        Story.message(FailedFetchSchedules({ message: 'Failed to load schedules' })),
        Command.expectNone(),
        Story.message(FailedFetchNextDose({ message: 'Failed to load next dose' })),
        Command.expectNone(),
        Story.message(FailedFetchScheduleDrugs({ message: 'Failed to load medication suggestions' })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.schedules).toEqual(AsyncData.Failure({ error: 'Failed to load schedules' }))
          expect(model.nextDose).toEqual(AsyncData.Failure({ error: 'Failed to load next dose' }))
          expect(model.drugs).toEqual(AsyncData.Failure({ error: 'Failed to load medication suggestions' }))
        })
      )
    })

    it('a successful drug fetch stores the suggestion list', () => {
      Story.story(
        update,
        Story.with(initialScheduleModel),
        Story.message(SucceededFetchScheduleDrugs({ drugs: ['Semaglutide', 'Tirzepatide'] })),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(AsyncData.getOrElse(model.drugs, () => [])).toEqual(['Semaglutide', 'Tirzepatide'])
        })
      )
    })
  })

  describe('fetchScheduleIfIdle', () => {
    it('dispatches all three fetches when everything is idle', () => {
      const [loading, commands] = fetchScheduleIfIdle(initialScheduleModel)
      expect(AsyncData.isLoading(loading.schedules)).toBe(true)
      expect(AsyncData.isLoading(loading.nextDose)).toBe(true)
      expect(AsyncData.isLoading(loading.drugs)).toBe(true)
      expect(commands.map((command) => command.name)).toEqual(['FetchSchedules', 'FetchNextDose', 'FetchScheduleDrugs'])
    })

    it('skips slices that are already loaded', () => {
      const alreadyLoaded: ScheduleModel = {
        ...initialScheduleModel,
        drugs: AsyncData.succeed(['Semaglutide']),
        nextDose: AsyncData.succeed(Option.none()),
        schedules: AsyncData.succeed([sampleSchedule]),
      }
      const [same, commands] = fetchScheduleIfIdle(alreadyLoaded)
      expect(same).toBe(alreadyLoaded)
      expect(commands).toHaveLength(0)
    })
  })
})
