// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import { AsyncData, Story } from 'foldkit'

import { DeleteInjection, FetchInjectionLogs } from '../src/page/injections/command.js'
import {
  CancelledDeleteInjection,
  ClickedInjectionPage,
  ClickedInjectionSort,
  ConfirmedDeleteInjection,
  FailedDeleteInjection,
  FailedFetchInjectionSites,
  RequestedDeleteInjection,
  SucceededDeleteInjection,
  SucceededFetchInjectionLogs,
  SucceededFetchInjectionSchedules,
  initialInjectionsModel,
} from '../src/page/injections/model.js'
import type { InjectionsMessage, InjectionsModel } from '../src/page/injections/model.js'
import { fetchInjectionsIfIdle, updateInjections } from '../src/page/injections/update.js'
import { injectionForm, sampleLog, sampleSchedule, timezone } from './injections-fixtures.js'

const { Command } = Story

const update = (model: InjectionsModel, message: InjectionsMessage) => updateInjections(model, message, timezone)

describe('injections list update', () => {
  it('the delete flow requires confirmation, closes the form, then refetches', () => {
    const withForm: InjectionsModel = {
      ...initialInjectionsModel,
      form: injectionForm(),
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
        [DeleteInjection, SucceededDeleteInjection()],
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
      Command.resolveAll([DeleteInjection, FailedDeleteInjection({ message: 'Failed to delete injection log' })]),
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

  it('site and schedule lookups populate on success and record failures', () => {
    const { model: withSites } = updateInjections(
      initialInjectionsModel,
      FailedFetchInjectionSites({ message: 'Failed to load site suggestions' }),
      timezone
    )

    expect(withSites.sites).toEqual(AsyncData.Failure({ error: 'Failed to load site suggestions' }))

    const { model: withSchedules } = update(
      initialInjectionsModel,
      SucceededFetchInjectionSchedules({ schedules: [sampleSchedule] })
    )

    expect(AsyncData.getOrElse(withSchedules.schedules, () => [])).toEqual([sampleSchedule])
  })

  it('fetchInjectionsIfIdle dispatches all three fetches when idle, and is a no-op once loaded', () => {
    const { model: loading, commands = [] } = fetchInjectionsIfIdle(initialInjectionsModel)
    expect(
      Arr.sort(
        Arr.map(commands, (command) => command.name),
        Order.String
      )
    ).toEqual(['FetchInjectionLogs', 'FetchInjectionSchedules', 'FetchInjectionSites'])
    expect(AsyncData.isLoading(loading.logs)).toBe(true)
    expect(AsyncData.isLoading(loading.sites)).toBe(true)
    expect(AsyncData.isLoading(loading.schedules)).toBe(true)

    const loaded: InjectionsModel = {
      ...initialInjectionsModel,
      logs: AsyncData.succeed([]),
      schedules: AsyncData.succeed([]),
      sites: AsyncData.succeed([]),
    }

    const { model: same, commands: noCommands = [] } = fetchInjectionsIfIdle(loaded)
    expect(same).toBe(loaded)
    expect(noCommands).toHaveLength(0)
  })
})
