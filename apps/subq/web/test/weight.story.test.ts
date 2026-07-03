// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import { DateTime } from 'effect'
import * as Story from 'foldkit/story'

import { Notes, Weight, WeightLog, WeightLogId } from '#shared'

import {
  ChangedWeightValue,
  ClickedAddWeight,
  ClickedWeightPage,
  ClickedWeightSort,
  ConfirmedDeleteWeight,
  DeleteWeight,
  FailedSaveWeight,
  FetchWeightLogs,
  OpenWeightForm,
  OpenedWeightForm,
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

const sampleLog = new WeightLog({
  createdAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
  datetime: DateTime.makeUnsafe('2026-07-01T08:00:00Z'),
  id: WeightLogId.make('log-1'),
  notes: Notes.make('morning'),
  updatedAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
  weight: Weight.make(185.5),
})

const update = (model: WeightModel, message: WeightMessage) => updateWeight(model, message)

describe('weight page update', () => {
  it('opens the add form via a command that supplies "now"', () => {
    Story.story(
      update,
      Story.with(initialWeightModel),
      Story.message(ClickedAddWeight()),
      Command.resolveAll([OpenWeightForm, OpenedWeightForm({ log: null, nowLocal: '2026-07-03T10:00' })]),
      Story.model((model: WeightModel) => {
        expect(model.form).not.toBeNull()
        expect(model.form?.datetime).toBe('2026-07-03T10:00')
        expect(model.form?.editingId).toBeNull()
      })
    )
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
        submitting: false,
        weight: 'not-a-number',
      },
    }
    Story.story(
      update,
      Story.with(withForm),
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
        submitting: false,
        weight: '185.5',
      },
    }
    Story.story(
      update,
      Story.with(withForm),
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
        submitting: false,
        weight: '185.5',
      },
    }
    Story.story(
      update,
      Story.with(withForm),
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
      Story.with(initialWeightModel),
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
      Story.with(paged),
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
      Story.with(initialWeightModel),
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
        submitting: false,
        weight: '84.0',
      },
    }
    Story.story(
      update,
      Story.with(withForm),
      Story.message(SubmittedWeightForm({ unit: 'kg' })),
      (simulation: Story.StorySimulation<WeightModel, WeightMessage>) => {
        const [command] = simulation.commands
        expect(command).toBeDefined()
        const weightLbs = command?.args?.weightLbs
        expect(typeof weightLbs).toBe('number')
        if (typeof weightLbs === 'number') {
          expect(weightLbs).toBeCloseTo(185.19, 1)
        }
        return simulation
      },
      Command.resolveAll([SaveWeight, SucceededSaveWeight()], [FetchWeightLogs, SucceededFetchWeightLogs({ logs: [] })])
    )
  })
})
