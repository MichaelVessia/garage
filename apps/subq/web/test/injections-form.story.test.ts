// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { AsyncData, Story } from 'foldkit'

import { utcToLocalDatetimeString } from '../src/lib/datetime.js'
import {
  FetchInjectionLogs,
  FetchInjectionSites,
  OpenInjectionForm,
  SaveInjection,
} from '../src/page/injections/command.js'
import {
  ChangedInjectionDoseMg,
  ChangedInjectionDrug,
  ChangedInjectionNotes,
  ChangedInjectionSchedule,
  ChangedInjectionSupplier,
  ClickedAddInjection,
  ClickedEditInjection,
  CompletedOpenInjectionForm,
  ConfirmedInjectionOffSchedule,
  FailedSaveInjection,
  SubmittedInjectionForm,
  SucceededFetchInjectionLogs,
  SucceededFetchInjectionSites,
  SucceededSaveInjection,
  initialInjectionsModel,
} from '../src/page/injections/model.js'
import type { InjectionsMessage, InjectionsModel } from '../src/page/injections/model.js'
import { updateInjections } from '../src/page/injections/update.js'
import { bareLog, injectionAt, injectionForm, sampleLog, sampleSchedule, timezone } from './injections-fixtures.js'

const { Command } = Story

const update = (model: InjectionsModel, message: InjectionsMessage) => updateInjections(model, message, timezone)

const savedDatetimeIso = (commands: NonNullable<ReturnType<typeof update>['commands']>): Option.Option<string> =>
  Arr.findFirst(commands, (command) => command.name === 'SaveInjection').pipe(
    Option.flatMap((command) => Option.fromNullishOr(command.args?.datetime)),
    Option.filter(Schema.is(Schema.DateTimeUtc)),
    Option.map(DateTime.formatIso)
  )

describe('injections form update', () => {
  it('opens the add form via a command that supplies "now"', () => {
    Story.story(
      update,
      Story.given(initialInjectionsModel),
      Story.message(ClickedAddInjection()),
      Command.resolveAll([OpenInjectionForm, CompletedOpenInjectionForm({ log: null, nowLocal: '2026-07-04T09:00' })]),
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
        OpenInjectionForm,
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
        OpenInjectionForm,
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
    const preciseLog = injectionAt({ datetime: '2026-07-01T08:00:45.123Z', id: 'inj-precise' })

    const { model: opened } = update(
      initialInjectionsModel,
      CompletedOpenInjectionForm({ log: preciseLog, nowLocal: '2026-07-04T09:00' })
    )

    const { model: noted } = update(opened, ChangedInjectionNotes({ value: 'updated note' }))
    const { commands = [] } = update(noted, SubmittedInjectionForm())

    expect(savedDatetimeIso(commands)).toEqual(Option.some('2026-07-01T08:00:45.123Z'))
  })

  it('preserves the exact identity of both DST-overlap instants on note-only edits', () => {
    const overlapInstants = ['2026-11-01T05:30:17.123Z', '2026-11-01T06:30:48.456Z'] as const
    expect(
      Arr.map(overlapInstants, (instant) => utcToLocalDatetimeString(DateTime.makeUnsafe(instant), timezone))
    ).toEqual(['2026-11-01T01:30', '2026-11-01T01:30'])

    for (const [index, instant] of overlapInstants.entries()) {
      const log = injectionAt({ datetime: instant, id: `inj-overlap-${index}` })

      const { model: opened } = update(
        initialInjectionsModel,
        CompletedOpenInjectionForm({ log, nowLocal: '2026-11-02T09:00' })
      )

      const { model: noted } = update(opened, ChangedInjectionNotes({ value: `overlap ${index}` }))
      const { commands = [] } = update(noted, SubmittedInjectionForm())

      expect(savedDatetimeIso(commands)).toEqual(Option.some(instant))
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
      form: injectionForm({ datetime: '' }),
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
      form: injectionForm({ drug: 'A' }),
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
      form: injectionForm({ doseMg: 'lots' }),
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
      form: injectionForm({ doseMg: '5', scheduleId: 'sched-1' }),
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
      form: injectionForm({ doseMg: '5', scheduleId: 'sched-1' }),
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
        [SaveInjection, SucceededSaveInjection()],
        [FetchInjectionLogs, SucceededFetchInjectionLogs({ logs: [] })],
        [FetchInjectionSites, SucceededFetchInjectionSites({ sites: [] })]
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
      form: injectionForm(),
    }

    Story.story(
      update,
      Story.given(withForm),
      Story.message(SubmittedInjectionForm()),
      Command.resolveAll([SaveInjection, FailedSaveInjection({ message: 'Failed to save injection log' })]),
      Story.model((model: InjectionsModel) => {
        expect(model.form).not.toBeNull()
        expect(model.form?.error).toBe('Failed to save injection log')
        expect(model.form?.submitting).toBe(false)
      })
    )
  })

  it('changing the optional supplier updates the form', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: injectionForm(),
    }

    const { model: updated } = updateInjections(withForm, ChangedInjectionSupplier({ value: 'Clinic' }), timezone)

    expect(updated.form?.supplier).toBe('Clinic')
  })

  it('changing the drug clears the schedule selection and any off-schedule confirmation', () => {
    const confirmed: InjectionsModel = {
      ...initialInjectionsModel,
      form: injectionForm({ confirmedOffSchedule: true, doseMg: '5', scheduleId: 'sched-1' }),
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
      form: injectionForm({ confirmedOffSchedule: true, doseMg: '5', scheduleId: 'sched-1' }),
    }

    const { model: afterDoseMg } = updateInjections(confirmed, ChangedInjectionDoseMg({ value: '10' }), timezone)
    expect(afterDoseMg.form?.confirmedOffSchedule).toBe(false)
    expect(afterDoseMg.form?.doseMg).toBe('10')

    const { model: afterSchedule } = update(confirmed, ChangedInjectionSchedule({ value: 'sched-2' }))
    expect(afterSchedule.form?.confirmedOffSchedule).toBe(false)
    expect(afterSchedule.form?.scheduleId).toBe('sched-2')
  })
})
