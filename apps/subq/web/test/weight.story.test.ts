// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as P from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as Story from 'foldkit/story'

import { IanaTimezone, Notes, Weight, WeightLog, WeightLogId } from '#shared'

import {
  ChangedWeightDatetime,
  ChangedWeightNotes,
  ChangedWeightValue,
  ClickedAddWeight,
  ClickedEditWeight,
  ClickedWeightPage,
  ClickedWeightSort,
  ConfirmedDeleteWeight,
  DeleteWeight,
  FailedSaveWeight,
  FetchWeightLogs,
  OpenWeightForm,
  CompletedOpenWeightForm,
  RequestedDeleteWeight,
  SaveWeight,
  SubmittedWeightForm,
  SucceededDeleteWeight,
  SucceededFetchWeightLogs,
  SucceededSaveWeight,
  initialWeightModel,
  updateWeight,
} from '../src/page/weight.js'
import type { WeightMessage, WeightModel } from '../src/page/weight.js'

const { Command } = Story
const timezone = IanaTimezone.make('America/New_York')

const sampleLog = new WeightLog({
  createdAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
  datetime: DateTime.makeUnsafe('2026-07-01T08:00:00Z'),
  id: WeightLogId.make('log-1'),
  notes: Notes.make('morning'),
  updatedAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
  weight: Weight.make(185.5),
})

const weightAt = (id: string, datetime: string): WeightLog =>
  new WeightLog({
    createdAt: sampleLog.createdAt,
    datetime: DateTime.makeUnsafe(datetime),
    id: WeightLogId.make(id),
    notes: sampleLog.notes,
    updatedAt: sampleLog.updatedAt,
    weight: sampleLog.weight,
  })

const update = (model: WeightModel, message: WeightMessage) => updateWeight(model, message, timezone)

describe('weight page update', () => {
  it('opens the add form via a command that supplies "now"', () => {
    Story.story(
      update,
      Story.given(initialWeightModel),
      Story.message(ClickedAddWeight()),
      Command.resolveAll([OpenWeightForm, CompletedOpenWeightForm({ log: null, nowLocal: '2026-07-03T10:00' })]),
      Story.model((model: WeightModel) => {
        expect(model.form).not.toBeNull()
        expect(model.form?.datetime).toBe('2026-07-03T10:00')
        expect(model.form?.editingId).toBeNull()
      })
    )
  })

  it('preserves sub-minute UTC precision for a note-only edit', () => {
    const preciseLog = weightAt('log-precise', '2026-07-01T08:00:45.123Z')
    const [opening] = update(initialWeightModel, ClickedEditWeight({ log: preciseLog }))
    const [opened] = update(opening, CompletedOpenWeightForm({ log: preciseLog, nowLocal: '2026-07-03T10:00' }))
    const [noted] = update(opened, ChangedWeightNotes({ value: 'updated note' }))
    const [, commands] = update(noted, SubmittedWeightForm({ unit: 'lbs' }))
    const datetime = commands.find((command) => command.name === SaveWeight.name)?.args?.datetime

    expect(Schema.is(Schema.DateTimeUtc)(datetime)).toBe(true)
    if (Schema.is(Schema.DateTimeUtc)(datetime)) {
      expect(DateTime.formatIso(datetime)).toBe('2026-07-01T08:00:45.123Z')
    }
  })

  it('preserves both DST-overlap UTC identities for note-only edits', () => {
    const overlapInstants = ['2026-11-01T05:30:17.123Z', '2026-11-01T06:30:48.456Z'] as const

    for (const [index, instant] of overlapInstants.entries()) {
      const log = weightAt(`log-overlap-${index}`, instant)
      const [opened] = update(initialWeightModel, CompletedOpenWeightForm({ log, nowLocal: '2026-11-02T09:00' }))
      const [noted] = update(opened, ChangedWeightNotes({ value: `overlap ${index}` }))
      const [, commands] = update(noted, SubmittedWeightForm({ unit: 'lbs' }))
      const datetime = commands.find((command) => command.name === SaveWeight.name)?.args?.datetime

      expect(Schema.is(Schema.DateTimeUtc)(datetime)).toBe(true)
      if (Schema.is(Schema.DateTimeUtc)(datetime)) {
        expect(DateTime.formatIso(datetime)).toBe(instant)
      }
    }
  })

  it('reinterprets an edited wall-time field in the persisted timezone', () => {
    const [opening] = update(initialWeightModel, ClickedEditWeight({ log: sampleLog }))
    const [opened] = update(opening, CompletedOpenWeightForm({ log: sampleLog, nowLocal: '2026-07-03T10:00' }))
    const [changed] = update(opened, ChangedWeightDatetime({ value: '2026-07-01T05:15' }))
    const [, commands] = update(changed, SubmittedWeightForm({ unit: 'lbs' }))
    const datetime = commands.find((command) => command.name === SaveWeight.name)?.args?.datetime

    expect(Schema.is(Schema.DateTimeUtc)(datetime)).toBe(true)
    if (Schema.is(Schema.DateTimeUtc)(datetime)) {
      expect(DateTime.formatIso(datetime)).toBe('2026-07-01T09:15:00.000Z')
    }
  })

  it('submit validates weight before dispatching SaveWeight', () => {
    const withForm: WeightModel = {
      ...initialWeightModel,
      form: {
        datetime: '2026-07-03T10:00',
        editingId: null,
        error: null,
        maxDatetime: '2026-07-03T10:00',
        notes: '',
        originalDatetime: null,
        submitting: false,
        weight: 'not-a-number',
      },
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(SubmittedWeightForm({ unit: 'lbs' })),
      Command.expectNone(),
      Story.model((model: WeightModel) => {
        expect(model.form?.error).toBe('Enter a valid weight')
      })
    )
  })

  it('successful save closes the form and refetches', () => {
    const withForm: WeightModel = {
      ...initialWeightModel,
      form: {
        datetime: '2026-07-03T10:00',
        editingId: null,
        error: null,
        maxDatetime: '2026-07-03T10:00',
        notes: 'note',
        originalDatetime: null,
        submitting: false,
        weight: '185.5',
      },
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(ChangedWeightValue({ value: '184.0' })),
      Story.message(SubmittedWeightForm({ unit: 'lbs' })),
      Story.model((model: WeightModel) => {
        expect(model.form?.submitting).toBe(true)
      }),
      Command.resolveAll(
        [SaveWeight, SucceededSaveWeight()],
        [FetchWeightLogs, SucceededFetchWeightLogs({ logs: [sampleLog] })]
      ),
      Story.model((model: WeightModel) => {
        expect(model.form).toBeNull()
        expect(model.logs._tag).toBe('Success')
      })
    )
  })

  it('failed save keeps the form open with the error', () => {
    const withForm: WeightModel = {
      ...initialWeightModel,
      form: {
        datetime: '2026-07-03T10:00',
        editingId: null,
        error: null,
        maxDatetime: '2026-07-03T10:00',
        notes: '',
        originalDatetime: null,
        submitting: false,
        weight: '185.5',
      },
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(SubmittedWeightForm({ unit: 'kg' })),
      Command.resolveAll([SaveWeight, FailedSaveWeight({ message: 'Failed to save entry' })]),
      Story.model((model: WeightModel) => {
        expect(model.form).not.toBeNull()
        expect(model.form?.error).toBe('Failed to save entry')
        expect(model.form?.submitting).toBe(false)
      })
    )
  })

  it('delete flow requires confirmation, then refetches', () => {
    Story.story(
      update,
      Story.given(initialWeightModel),
      Story.message(RequestedDeleteWeight({ id: sampleLog.id })),
      Command.expectNone(),
      Story.model((model: WeightModel) => {
        expect(model.pendingDeleteId).toBe(sampleLog.id)
      }),
      Story.message(ConfirmedDeleteWeight()),
      Command.resolveAll(
        [DeleteWeight, SucceededDeleteWeight()],
        [FetchWeightLogs, SucceededFetchWeightLogs({ logs: [] })]
      ),
      Story.model((model: WeightModel) => {
        expect(model.pendingDeleteId).toBeNull()
      })
    )
  })

  it('sorting toggles direction on repeated clicks and resets the page', () => {
    const paged: WeightModel = { ...initialWeightModel, page: 3 }
    Story.story(
      update,
      Story.given(paged),
      Story.message(ClickedWeightSort({ column: 'weight' })),
      Story.model((model: WeightModel) => {
        expect(model.sortColumn).toBe('weight')
        expect(model.sortDesc).toBe(true)
        expect(model.page).toBe(0)
      }),
      Story.message(ClickedWeightSort({ column: 'weight' })),
      Story.model((model: WeightModel) => {
        expect(model.sortDesc).toBe(false)
      })
    )
  })

  it('pagination moves by delta', () => {
    Story.story(
      update,
      Story.given(initialWeightModel),
      Story.message(ClickedWeightPage({ delta: 1 })),
      Story.message(ClickedWeightPage({ delta: 1 })),
      Story.message(ClickedWeightPage({ delta: -1 })),
      Story.model((model: WeightModel) => {
        expect(model.page).toBe(1)
      })
    )
  })

  it('kg submissions convert to storage lbs', () => {
    const withForm: WeightModel = {
      ...initialWeightModel,
      form: {
        datetime: '2026-07-03T10:00',
        editingId: null,
        error: null,
        maxDatetime: '2026-07-03T10:00',
        notes: '',
        originalDatetime: null,
        submitting: false,
        weight: '84.0',
      },
    }
    Story.story(
      update,
      Story.given(withForm),
      Story.message(SubmittedWeightForm({ unit: 'kg' })),
      (simulation: Story.StorySimulation<WeightModel, WeightMessage>) => {
        const [command] = simulation.commands
        expect(command).toBeDefined()
        const weightLbs = command?.args?.weightLbs
        expect(P.isNumber(weightLbs)).toBe(true)
        if (P.isNumber(weightLbs)) {
          expect(weightLbs).toBeCloseTo(185.19, 1)
        }
        return simulation
      },
      Command.resolveAll([SaveWeight, SucceededSaveWeight()], [FetchWeightLogs, SucceededFetchWeightLogs({ logs: [] })])
    )
  })
})
