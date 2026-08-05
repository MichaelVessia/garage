// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'
import * as AsyncData from 'foldkit/asyncData'
import * as Story from 'foldkit/story'

import {
  CalendarDate,
  DoseMg,
  MedicationCompound,
  Supplier,
  InjectionLog,
  InjectionLogId,
  InjectionSchedule,
  InjectionScheduleId,
  InjectionSite,
  IanaTimezone,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseId,
} from '#shared'

import { utcToLocalDatetimeString } from '../src/lib/datetime.js'
import {
  CancelledDeleteInjection,
  ChangedInjectionDoseMg,
  ChangedInjectionDrug,
  ChangedInjectionNotes,
  ChangedInjectionSchedule,
  ChangedInjectionSupplier,
  ClickedAddInjection,
  ClickedEditInjection,
  ClickedInjectionPage,
  ClickedInjectionSort,
  ConfirmedDeleteInjection,
  ConfirmedInjectionOffSchedule,
  FailedDeleteInjection,
  FailedFetchInjectionSites,
  FailedSaveInjection,
  FetchInjectionLogs,
  CompletedOpenInjectionForm,
  RequestedDeleteInjection,
  SubmittedInjectionForm,
  SucceededDeleteInjection,
  SucceededFetchInjectionLogs,
  SucceededFetchInjectionSchedules,
  SucceededFetchInjectionSites,
  SucceededSaveInjection,
  fetchInjectionsIfIdle,
  initialInjectionsModel,
  updateInjections,
} from '../src/page/injections.js'
import type { InjectionsMessage, InjectionsModel } from '../src/page/injections.js'

const { Command } = Story
const timezone = IanaTimezone.make('America/New_York')

const sampleLog = new InjectionLog({
  createdAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
  datetime: DateTime.makeUnsafe('2026-07-01T08:00:00Z'),
  doseMg: DoseMg.make(2.5),
  drug: MedicationCompound.make('Semaglutide'),
  id: InjectionLogId.make('inj-1'),
  injectionSite: InjectionSite.make('Abdomen'),
  notes: Notes.make('no issues'),
  scheduleId: InjectionScheduleId.make('sched-1'),
  supplier: Supplier.make('Pharmacy'),
  updatedAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
})

const bareLog = new InjectionLog({
  createdAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
  datetime: DateTime.makeUnsafe('2026-07-01T08:00:00Z'),
  doseMg: DoseMg.make(5),
  drug: MedicationCompound.make('Tirzepatide'),
  id: InjectionLogId.make('inj-2'),
  injectionSite: null,
  notes: null,
  scheduleId: null,
  supplier: null,
  updatedAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
})

const sampleSchedule = new InjectionSchedule({
  createdAt: DateTime.makeUnsafe('2026-06-01T00:00:00Z'),
  drug: MedicationCompound.make('Semaglutide'),
  frequency: 'weekly',
  id: InjectionScheduleId.make('sched-1'),
  isActive: true,
  name: ScheduleName.make('Titration'),
  notes: null,
  phases: [
    {
      createdAt: DateTime.makeUnsafe('2026-06-01T00:00:00Z'),
      doseMg: DoseMg.make(2.5),
      durationDays: PhaseDurationDays.make(28),
      id: SchedulePhaseId.make('phase-1'),
      order: PhaseOrder.make(1),
      scheduleId: InjectionScheduleId.make('sched-1'),
      updatedAt: DateTime.makeUnsafe('2026-06-01T00:00:00Z'),
    },
  ],
  supplier: null,
  startDate: CalendarDate.make('2026-06-01'),
  updatedAt: DateTime.makeUnsafe('2026-06-01T00:00:00Z'),
})

const injectionAt = (id: string, datetime: string): InjectionLog =>
  new InjectionLog({
    createdAt: sampleLog.createdAt,
    datetime: DateTime.makeUnsafe(datetime),
    doseMg: sampleLog.doseMg,
    drug: sampleLog.drug,
    id: InjectionLogId.make(id),
    injectionSite: sampleLog.injectionSite,
    notes: sampleLog.notes,
    scheduleId: sampleLog.scheduleId,
    supplier: sampleLog.supplier,
    updatedAt: sampleLog.updatedAt,
  })

const update = (model: InjectionsModel, message: InjectionsMessage) => updateInjections(model, message, timezone)

describe('injections page update', () => {
  it('opens the add form via a command that supplies "now"', () => {
    Story.story(
      update,
      Story.given(initialInjectionsModel),
      Story.message(ClickedAddInjection()),
      Command.resolveAll([
        { name: 'OpenInjectionForm' },
        CompletedOpenInjectionForm({ log: null, nowLocal: '2026-07-04T09:00' }),
      ]),
      Story.model((model: InjectionsModel) => {
        expect(model.form).not.toBeNull()
        expect(model.form?.datetime).toBe('2026-07-04T09:00')
        expect(model.form?.maxDatetime).toBe('2026-07-04T09:00')
        expect(model.form?.editingId).toBeNull()
        expect(model.form?.confirmedOffSchedule).toBe(false)
      })
    )
  })

  it('opens the edit form pre-filled from an existing log', () => {
    Story.story(
      update,
      Story.given(initialInjectionsModel),
      Story.message(ClickedEditInjection({ log: sampleLog })),
      Command.resolveAll([
        { name: 'OpenInjectionForm' },
        CompletedOpenInjectionForm({ log: sampleLog, nowLocal: '2026-07-04T09:00' }),
      ]),
      Story.model((model: InjectionsModel) => {
        expect(model.form?.editingId).toBe(sampleLog.id)
        expect(model.form?.datetime).toBe(utcToLocalDatetimeString(sampleLog.datetime, timezone))
        expect(model.form?.maxDatetime).toBe('2026-07-04T09:00')
        expect(model.form?.drug).toBe(sampleLog.drug)
        expect(model.form?.doseMg).toBe(String(sampleLog.doseMg))
        expect(model.form?.injectionSite).toBe('Abdomen')
        expect(model.form?.notes).toBe('no issues')
        expect(model.form?.scheduleId).toBe('sched-1')
        expect(model.form?.supplier).toBe('Pharmacy')
      })
    )
  })

  it('edit form falls back to empty strings for null optional fields', () => {
    Story.story(
      update,
      Story.given(initialInjectionsModel),
      Story.message(ClickedEditInjection({ log: bareLog })),
      Command.resolveAll([
        { name: 'OpenInjectionForm' },
        CompletedOpenInjectionForm({ log: bareLog, nowLocal: '2026-07-04T09:00' }),
      ]),
      Story.model((model: InjectionsModel) => {
        expect(model.form?.injectionSite).toBe('')
        expect(model.form?.notes).toBe('')
        expect(model.form?.scheduleId).toBe('')
        expect(model.form?.supplier).toBe('')
      })
    )
  })

  it('preserves sub-minute UTC precision for a note-only edit', () => {
    const preciseLog = injectionAt('inj-precise', '2026-07-01T08:00:45.123Z')
    const [opened] = update(
      initialInjectionsModel,
      CompletedOpenInjectionForm({ log: preciseLog, nowLocal: '2026-07-04T09:00' })
    )
    const [noted] = update(opened, ChangedInjectionNotes({ value: 'updated note' }))
    const [, commands] = update(noted, SubmittedInjectionForm())
    const datetime = commands.find((command) => command.name === 'SaveInjection')?.args?.datetime

    expect(Schema.is(Schema.DateTimeUtc)(datetime)).toBe(true)
    if (Schema.is(Schema.DateTimeUtc)(datetime)) {
      expect(DateTime.formatIso(datetime)).toBe('2026-07-01T08:00:45.123Z')
    }
  })

  it('preserves the exact identity of both DST-overlap instants on note-only edits', () => {
    const overlapInstants = ['2026-11-01T05:30:17.123Z', '2026-11-01T06:30:48.456Z'] as const
    expect(overlapInstants.map((instant) => utcToLocalDatetimeString(DateTime.makeUnsafe(instant), timezone))).toEqual([
      '2026-11-01T01:30',
      '2026-11-01T01:30',
    ])

    for (const [index, instant] of overlapInstants.entries()) {
      const log = injectionAt(`inj-overlap-${index}`, instant)
      const [opened] = update(initialInjectionsModel, CompletedOpenInjectionForm({ log, nowLocal: '2026-11-02T09:00' }))
      const [noted] = update(opened, ChangedInjectionNotes({ value: `overlap ${index}` }))
      const [, commands] = update(noted, SubmittedInjectionForm())
      const datetime = commands.find((command) => command.name === 'SaveInjection')?.args?.datetime

      expect(Schema.is(Schema.DateTimeUtc)(datetime)).toBe(true)
      if (Schema.is(Schema.DateTimeUtc)(datetime)) {
        expect(DateTime.formatIso(datetime)).toBe(instant)
      }
    }
  })

  it('submitting without an open form is a no-op', () => {
    Story.story(
      update,
      Story.given(initialInjectionsModel),
      Story.message(SubmittedInjectionForm()),
      Command.expectNone()
    )
  })

  it('submit validation requires a date & time', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: false,
        datetime: '',
        doseMg: '2.5',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        originalDatetime: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        scheduleId: '',
        supplier: '',
        submitting: false,
      },
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(SubmittedInjectionForm()),
      Command.expectNone(),
      Story.model((model: InjectionsModel) => {
        expect(model.form?.error).toBe('Date & time is required')
      })
    )
  })

  it('submit validation rejects a medication outside the supported compounds', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: false,
        datetime: '2026-07-04T09:00',
        doseMg: '2.5',
        drug: 'A',
        editingId: null,
        error: null,
        originalDatetime: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        scheduleId: '',
        supplier: '',
        submitting: false,
      },
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(SubmittedInjectionForm()),
      Command.expectNone(),
      Story.model((model: InjectionsModel) => {
        expect(model.form?.error).toBe('Select a supported medication')
      })
    )
  })

  it('submit validation requires a positive numeric milligram dose', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: false,
        datetime: '2026-07-04T09:00',
        doseMg: 'lots',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        originalDatetime: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        scheduleId: '',
        supplier: '',
        submitting: false,
      },
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(SubmittedInjectionForm()),
      Command.expectNone(),
      Story.model((model: InjectionsModel) => {
        expect(model.form?.error).toBe('Enter a positive dose in milligrams')
      })
    )
  })

  it('an off-schedule doseMg requires confirmation before saving', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: false,
        datetime: '2026-07-04T09:00',
        doseMg: '5',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        originalDatetime: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        scheduleId: 'sched-1',
        supplier: '',
        submitting: false,
      },
      schedules: AsyncData.succeed([sampleSchedule]),
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(SubmittedInjectionForm()),
      Command.expectNone(),
      Story.model((model: InjectionsModel) => {
        expect(model.form?.error).toBe('Confirm the off-schedule dose before saving')
        expect(model.form?.submitting).toBe(false)
      })
    )
  })

  it('confirming the off-schedule doseMg allows the submit to proceed and save', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: false,
        datetime: '2026-07-04T09:00',
        doseMg: '5',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        originalDatetime: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        scheduleId: 'sched-1',
        supplier: '',
        submitting: false,
      },
      schedules: AsyncData.succeed([sampleSchedule]),
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(ConfirmedInjectionOffSchedule()),
      Story.model((model: InjectionsModel) => {
        expect(model.form?.confirmedOffSchedule).toBe(true)
      }),
      Story.message(SubmittedInjectionForm()),
      (simulation: Story.StorySimulation<InjectionsModel, InjectionsMessage>) => {
        const [command] = simulation.commands
        expect(command?.name).toBe('SaveInjection')
        expect(command?.args).toEqual({
          datetime: DateTime.makeUnsafe('2026-07-04T13:00:00Z'),
          doseMg: '5',
          drug: 'Semaglutide',
          editingId: null,
          injectionSite: '',
          notes: '',
          scheduleId: 'sched-1',
          supplier: '',
        })
        return simulation
      },
      Command.resolveAll(
        [{ name: 'SaveInjection' }, SucceededSaveInjection()],
        [FetchInjectionLogs, SucceededFetchInjectionLogs({ logs: [] })],
        [{ name: 'FetchInjectionSites' }, SucceededFetchInjectionSites({ sites: [] })]
      ),
      Story.model((model: InjectionsModel) => {
        expect(model.form).toBeNull()
        expect(model.logs._tag).toBe('Success')
      })
    )
  })

  it('a failed save keeps the form open with the error', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: false,
        datetime: '2026-07-04T09:00',
        doseMg: '2.5',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        originalDatetime: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        scheduleId: '',
        supplier: '',
        submitting: false,
      },
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(SubmittedInjectionForm()),
      Command.resolveAll([{ name: 'SaveInjection' }, FailedSaveInjection({ message: 'Failed to save injection log' })]),
      Story.model((model: InjectionsModel) => {
        expect(model.form).not.toBeNull()
        expect(model.form?.error).toBe('Failed to save injection log')
        expect(model.form?.submitting).toBe(false)
      })
    )
  })

  it('the delete flow requires confirmation, closes the form, then refetches', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: false,
        datetime: '2026-07-04T09:00',
        doseMg: '2.5',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        originalDatetime: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        scheduleId: '',
        supplier: '',
        submitting: false,
      },
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(RequestedDeleteInjection({ id: sampleLog.id })),
      Command.expectNone(),
      Story.model((model: InjectionsModel) => {
        expect(model.form).toBeNull()
        expect(model.pendingDeleteId).toBe(sampleLog.id)
      }),
      Story.message(ConfirmedDeleteInjection()),
      Command.resolveAll(
        [{ name: 'DeleteInjection' }, SucceededDeleteInjection()],
        [FetchInjectionLogs, SucceededFetchInjectionLogs({ logs: [sampleLog] })]
      ),
      Story.model((model: InjectionsModel) => {
        expect(model.pendingDeleteId).toBeNull()
        expect(model.logs._tag).toBe('Success')
      })
    )
  })

  it('cancelling a pending delete clears it', () => {
    const withPending: InjectionsModel = { ...initialInjectionsModel, pendingDeleteId: sampleLog.id }
    Story.story(
      update,
      Story.given(withPending),
      Story.message(CancelledDeleteInjection()),
      Command.expectNone(),
      Story.model((model: InjectionsModel) => {
        expect(model.pendingDeleteId).toBeNull()
      })
    )
  })

  it('a failed delete clears the pending id', () => {
    const withPending: InjectionsModel = { ...initialInjectionsModel, pendingDeleteId: sampleLog.id }
    Story.story(
      update,
      Story.given(withPending),
      Story.message(ConfirmedDeleteInjection()),
      Command.resolveAll([
        { name: 'DeleteInjection' },
        FailedDeleteInjection({ message: 'Failed to delete injection log' }),
      ]),
      Story.model((model: InjectionsModel) => {
        expect(model.pendingDeleteId).toBeNull()
      })
    )
  })

  it('confirming a delete with nothing pending is a no-op', () => {
    Story.story(
      update,
      Story.given(initialInjectionsModel),
      Story.message(ConfirmedDeleteInjection()),
      Command.expectNone()
    )
  })

  it('sorting toggles direction on repeated clicks and resets the page', () => {
    const paged: InjectionsModel = { ...initialInjectionsModel, page: 2 }
    Story.story(
      update,
      Story.given(paged),
      Story.message(ClickedInjectionSort({ column: 'drug' })),
      Story.model((model: InjectionsModel) => {
        expect(model.sortColumn).toBe('drug')
        expect(model.sortDesc).toBe(true)
        expect(model.page).toBe(0)
      }),
      Story.message(ClickedInjectionSort({ column: 'drug' })),
      Story.model((model: InjectionsModel) => {
        expect(model.sortDesc).toBe(false)
      })
    )
  })

  it('pagination moves by delta', () => {
    Story.story(
      update,
      Story.given(initialInjectionsModel),
      Story.message(ClickedInjectionPage({ delta: 1 })),
      Story.message(ClickedInjectionPage({ delta: 1 })),
      Story.message(ClickedInjectionPage({ delta: -1 })),
      Story.model((model: InjectionsModel) => {
        expect(model.page).toBe(1)
      })
    )
  })

  it('changing the optional supplier updates the form', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: false,
        datetime: '2026-07-04T09:00',
        doseMg: '2.5',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        originalDatetime: null,
        scheduleId: '',
        supplier: '',
        submitting: false,
      },
    }

    const [updated] = updateInjections(withForm, ChangedInjectionSupplier({ value: 'Clinic' }), timezone)

    expect(updated.form?.supplier).toBe('Clinic')
  })

  it('changing the drug clears the schedule selection and any off-schedule confirmation', () => {
    const confirmed: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: true,
        datetime: '2026-07-04T09:00',
        doseMg: '5',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        originalDatetime: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        scheduleId: 'sched-1',
        supplier: '',
        submitting: false,
      },
    }
    Story.story(
      update,
      Story.given(confirmed),
      Story.message(ChangedInjectionDrug({ value: 'Tirzepatide' })),
      Command.expectNone(),
      Story.model((model: InjectionsModel) => {
        expect(model.form?.drug).toBe('Tirzepatide')
        expect(model.form?.scheduleId).toBe('')
        expect(model.form?.confirmedOffSchedule).toBe(false)
      })
    )
  })

  it('changing the doseMg or the schedule clears any off-schedule confirmation', () => {
    const confirmed: InjectionsModel = {
      ...initialInjectionsModel,
      form: {
        confirmedOffSchedule: true,
        datetime: '2026-07-04T09:00',
        doseMg: '5',
        drug: 'Semaglutide',
        editingId: null,
        error: null,
        originalDatetime: null,
        injectionSite: '',
        maxDatetime: '2026-07-04T09:00',
        notes: '',
        scheduleId: 'sched-1',
        supplier: '',
        submitting: false,
      },
    }
    const [afterDoseMg] = updateInjections(confirmed, ChangedInjectionDoseMg({ value: '10' }), timezone)
    expect(afterDoseMg.form?.confirmedOffSchedule).toBe(false)
    expect(afterDoseMg.form?.doseMg).toBe('10')

    const [afterSchedule] = update(confirmed, ChangedInjectionSchedule({ value: 'sched-2' }))
    expect(afterSchedule.form?.confirmedOffSchedule).toBe(false)
    expect(afterSchedule.form?.scheduleId).toBe('sched-2')
  })

  it('site and schedule lookups populate on success and record failures', () => {
    const [withSites] = updateInjections(
      initialInjectionsModel,
      FailedFetchInjectionSites({ message: 'Failed to load site suggestions' }),
      timezone
    )
    expect(withSites.sites).toEqual(AsyncData.Failure({ error: 'Failed to load site suggestions' }))

    const [withSchedules] = update(
      initialInjectionsModel,
      SucceededFetchInjectionSchedules({ schedules: [sampleSchedule] })
    )
    expect(AsyncData.getOrElse(withSchedules.schedules, () => [])).toEqual([sampleSchedule])
  })

  it('fetchInjectionsIfIdle dispatches all three fetches when idle, and is a no-op once loaded', () => {
    const [loading, commands] = fetchInjectionsIfIdle(initialInjectionsModel)
    expect(commands.map((command) => command.name).toSorted()).toEqual(
      ['FetchInjectionLogs', 'FetchInjectionSchedules', 'FetchInjectionSites'].toSorted()
    )
    expect(AsyncData.isLoading(loading.logs)).toBe(true)
    expect(AsyncData.isLoading(loading.sites)).toBe(true)
    expect(AsyncData.isLoading(loading.schedules)).toBe(true)

    const loaded: InjectionsModel = {
      ...initialInjectionsModel,
      logs: AsyncData.succeed([]),
      schedules: AsyncData.succeed([]),
      sites: AsyncData.succeed([]),
    }
    const [same, noCommands] = fetchInjectionsIfIdle(loaded)
    expect(same).toBe(loaded)
    expect(noCommands).toHaveLength(0)
  })
})
