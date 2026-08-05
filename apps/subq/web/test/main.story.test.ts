// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as AsyncData from 'foldkit/asyncData'
import * as Scene from 'foldkit/scene'
import * as Url from 'foldkit/url'

import {
  DataImportResult,
  IanaTimezone,
  SettingsDatabaseError,
  SettingsTemporalMigrationError,
  UserSettings,
} from '#shared'

import { SucceededFetchSession } from '../src/auth.js'
import {
  FailedFetchSettings as FailedFetchSettingsMessage,
  SucceededFetchSettings as SucceededFetchSettingsMessage,
  settingsLoadErrorMessage,
} from '../src/data/settings.js'
import { ChangedUrl, ClickedRetrySettings, init, update, view } from '../src/main.js'
import { CompletedOpenInjectionForm } from '../src/page/injections.js'
import { SucceededFetchNextDose } from '../src/page/schedule.js'
import { SucceededImportData, SucceededUpdateSettingsPreference } from '../src/page/settings.js'
import { RejectedFetchStats, rangeKey } from '../src/page/stats.js'
import { CompletedOpenWeightForm } from '../src/page/weight.js'

const detectedTimezone = IanaTimezone.make('America/New_York')
const persistedTimezone = IanaTimezone.make('Pacific/Auckland')
const user = { email: 'person@example.com', id: 'user-1', name: 'Person' }
const settings = new UserSettings({
  createdAt: DateTime.toDate(DateTime.makeUnsafe('2026-07-01T00:00:00Z')),
  id: 'settings-1',
  timezone: persistedTimezone,
  updatedAt: DateTime.toDate(DateTime.makeUnsafe('2026-07-01T00:00:00Z')),
  weightUnit: 'lbs',
})

const settingsAt = (timezone: IanaTimezone) =>
  new UserSettings({
    createdAt: settings.createdAt,
    id: settings.id,
    timezone,
    updatedAt: settings.updatedAt,
    weightUnit: settings.weightUnit,
  })

const parseUrl = (value: string): Url.Url => Option.getOrThrow(Url.fromString(value))

const commandArgs = (commands: ReturnType<typeof update>[1], name: string) =>
  commands.find((command) => command.name === name)?.args

const SucceededFetchSettings = (args: { readonly requestGeneration?: number; readonly settings: UserSettings }) =>
  SucceededFetchSettingsMessage({
    requestGeneration: args.requestGeneration ?? 1,
    settings: args.settings,
  })

const FailedFetchSettings = (args: { readonly message: string; readonly requestGeneration?: number }) =>
  FailedFetchSettingsMessage({ message: args.message, requestGeneration: args.requestGeneration ?? 1 })

describe('application timezone', () => {
  it('stores the detected timezone separately during initialization', () => {
    const [model] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/stats'))

    expect(model.detectedTimezone).toBe(detectedTimezone)
  })

  it('initializes settings before fetching stats and then uses the persisted timezone', () => {
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/stats'))
    const [authenticated, initializationCommands] = update(initial, SucceededFetchSession({ user }))

    expect(initializationCommands.map(({ name }) => name)).toEqual(['FetchSettings'])
    expect(commandArgs(initializationCommands, 'FetchSettings')).toEqual({
      detectedTimezone,
      requestGeneration: 1,
    })

    const [ready, statsCommands] = update(authenticated, SucceededFetchSettings({ settings }))
    expect(commandArgs(statsCommands, 'FetchStats')).toEqual({
      end: null,
      requestGeneration: 1,
      start: null,
      timezone: persistedTimezone,
    })

    const [, rangeCommands] = update(
      ready,
      ChangedUrl({ url: parseUrl('https://subq.example/stats?start=2026-06-03&end=2026-07-03') })
    )

    expect(commandArgs(rangeCommands, 'FetchStats')).toEqual({
      end: '2026-07-03',
      requestGeneration: 2,
      start: '2026-06-03',
      timezone: persistedTimezone,
    })
  })

  it('accepts only the latest settings response across preference and reconciliation refreshes', () => {
    const staleTimezone = IanaTimezone.make('America/Los_Angeles')
    const latestTimezone = IanaTimezone.make('Europe/Berlin')
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/stats'))
    const [authenticated] = update(initial, SucceededFetchSession({ user }))
    const [ready] = update(authenticated, SucceededFetchSettings({ requestGeneration: 1, settings }))

    const [preferenceRefresh, preferenceCommands] = update(ready, SucceededUpdateSettingsPreference())
    const [reconciliationRefresh, reconciliationCommands] = update(
      preferenceRefresh,
      RejectedFetchStats({
        key: rangeKey({ end: Option.none(), start: Option.none() }),
        requestedTimezone: persistedTimezone,
        requestGeneration: 1,
        timezones: [latestTimezone],
      })
    )

    expect(commandArgs(preferenceCommands, 'FetchSettings')).toEqual({
      detectedTimezone: persistedTimezone,
      requestGeneration: 2,
    })
    expect(commandArgs(reconciliationCommands, 'FetchSettings')).toEqual({
      detectedTimezone: persistedTimezone,
      requestGeneration: 3,
    })
    expect(reconciliationRefresh.settingsRequestGeneration).toBe(3)

    const [afterStaleSuccess, staleSuccessCommands] = update(
      reconciliationRefresh,
      SucceededFetchSettings({ requestGeneration: 2, settings: settingsAt(staleTimezone) })
    )
    expect(afterStaleSuccess).toBe(reconciliationRefresh)
    expect(staleSuccessCommands).toHaveLength(0)

    const [afterStaleFailure, staleFailureCommands] = update(
      reconciliationRefresh,
      FailedFetchSettings({ message: 'older refresh failed', requestGeneration: 2 })
    )
    expect(afterStaleFailure).toBe(reconciliationRefresh)
    expect(staleFailureCommands).toHaveLength(0)

    const [accepted, acceptedCommands] = update(
      reconciliationRefresh,
      SucceededFetchSettings({ requestGeneration: 3, settings: settingsAt(latestTimezone) })
    )
    expect(Option.getOrThrow(AsyncData.getData(accepted.settings)).timezone).toBe(latestTimezone)
    expect(commandArgs(acceptedCommands, 'FetchStats')).toEqual({
      end: null,
      requestGeneration: 2,
      start: null,
      timezone: latestTimezone,
    })
  })

  it('preserves legacy migration record, field, and offending value details', () => {
    const error = SettingsTemporalMigrationError.make({
      entity: 'user_goal',
      field: 'target_date',
      recordId: 'goal-17',
      value: 'not-a-date',
    })

    expect(settingsLoadErrorMessage(error)).toBe(
      "Timezone migration could not convert user_goal record 'goal-17', field 'target_date', value 'not-a-date'. Correct the stored value and retry."
    )
  })

  it('preserves useful database operation and cause details', () => {
    const error = SettingsDatabaseError.make({
      cause: new Error('database is locked'),
      operation: 'update',
    })

    expect(settingsLoadErrorMessage(error)).toContain('update')
    expect(settingsLoadErrorMessage(error)).toContain('database is locked')
  })

  it('renders actionable legacy migration details instead of leaving the route loading', () => {
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/stats'))
    const [authenticated] = update(initial, SucceededFetchSession({ user }))
    const details =
      "Cannot migrate user_goal 'goal-17' field 'target_date' with value 'not-a-date'. Correct the stored value and retry."

    const [failed] = update(authenticated, FailedFetchSettings({ message: details }))
    Scene.scene(
      { update, view },
      Scene.given(failed),
      Scene.tap(({ html }) => {
        const rendered = JSON.stringify(html)
        expect(rendered).toContain('goal-17')
        expect(rendered).toContain('target_date')
        expect(rendered).toContain('not-a-date')
        expect(rendered).toContain('Retry')
        expect(rendered).not.toContain('No planned dates were changed')
        expect(rendered).toContain('may already have been converted')
        expect(rendered).toContain('idempotent')
      })
    )

    const [retrying, commands] = update(failed, ClickedRetrySettings())
    expect(retrying.settings._tag).toBe('Loading')
    expect(commandArgs(commands, 'FetchSettings')).toEqual({ detectedTimezone, requestGeneration: 2 })
  })

  it('reconciles authoritative stats timezone mismatches and rejects repeated stale responses', () => {
    const staleSettings = new UserSettings({
      createdAt: settings.createdAt,
      id: settings.id,
      timezone: detectedTimezone,
      updatedAt: settings.updatedAt,
      weightUnit: settings.weightUnit,
    })
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/stats'))
    const [authenticated] = update(initial, SucceededFetchSession({ user }))
    const [staleReady] = update(authenticated, SucceededFetchSettings({ settings: staleSettings }))
    const key = rangeKey({ end: Option.none(), start: Option.none() })

    const [reconciling, reconciliationCommands] = update(
      staleReady,
      RejectedFetchStats({
        key,
        requestedTimezone: detectedTimezone,
        requestGeneration: 1,
        timezones: [persistedTimezone],
      })
    )
    expect(commandArgs(reconciliationCommands, 'FetchSettings')).toEqual({
      detectedTimezone,
      requestGeneration: 2,
    })

    const [converged, refetchCommands] = update(reconciling, SucceededFetchSettings({ requestGeneration: 2, settings }))
    expect(commandArgs(refetchCommands, 'FetchStats')).toEqual({
      end: null,
      requestGeneration: 2,
      start: null,
      timezone: persistedTimezone,
    })

    const [, repeatedCommands] = update(
      converged,
      RejectedFetchStats({
        key,
        requestedTimezone: detectedTimezone,
        requestGeneration: 1,
        timezones: [persistedTimezone],
      })
    )
    expect(repeatedCommands).toHaveLength(0)
  })

  it('restarts stats when A→B→A reconciliation returns the same persisted timezone', () => {
    const staleSettings = new UserSettings({
      createdAt: settings.createdAt,
      id: settings.id,
      timezone: detectedTimezone,
      updatedAt: settings.updatedAt,
      weightUnit: settings.weightUnit,
    })
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/stats'))
    const [authenticated] = update(initial, SucceededFetchSession({ user }))
    const [ready] = update(authenticated, SucceededFetchSettings({ settings: staleSettings }))
    const key = rangeKey({ end: Option.none(), start: Option.none() })

    const [reconciling] = update(
      ready,
      RejectedFetchStats({
        key,
        requestedTimezone: detectedTimezone,
        requestGeneration: 1,
        timezones: [persistedTimezone],
      })
    )
    expect(AsyncData.isIdle(reconciling.stats.data)).toBe(true)

    const [refetching, commands] = update(
      reconciling,
      SucceededFetchSettings({ requestGeneration: 2, settings: staleSettings })
    )
    expect(AsyncData.isLoading(refetching.stats.data)).toBe(true)
    expect(commandArgs(commands, 'FetchStats')).toEqual({
      end: null,
      requestGeneration: 2,
      start: null,
      timezone: detectedTimezone,
    })
  })

  it('reconciles authoritative next-dose timezone mismatches before refetching', () => {
    const staleSettings = new UserSettings({
      createdAt: settings.createdAt,
      id: settings.id,
      timezone: detectedTimezone,
      updatedAt: settings.updatedAt,
      weightUnit: settings.weightUnit,
    })
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/schedule'))
    const [authenticated] = update(initial, SucceededFetchSession({ user }))
    const [staleReady] = update(authenticated, SucceededFetchSettings({ settings: staleSettings }))

    const [reconciling, reconciliationCommands] = update(
      staleReady,
      SucceededFetchNextDose({
        nextDose: null,
        requestKey: 1,
        requestedTimezone: detectedTimezone,
        timezone: persistedTimezone,
      })
    )
    expect(commandArgs(reconciliationCommands, 'FetchSettings')).toEqual({
      detectedTimezone,
      requestGeneration: 2,
    })

    const [converged, refetchCommands] = update(reconciling, SucceededFetchSettings({ requestGeneration: 2, settings }))
    expect(commandArgs(refetchCommands, 'FetchNextDose')).toEqual({
      requestKey: 2,
      requestedTimezone: persistedTimezone,
    })

    const [, repeatedCommands] = update(
      converged,
      SucceededFetchNextDose({
        nextDose: null,
        requestKey: 1,
        requestedTimezone: detectedTimezone,
        timezone: persistedTimezone,
      })
    )
    expect(repeatedCommands).toHaveLength(0)
  })

  it('restarts next dose when A→B→A reconciliation returns the same persisted timezone', () => {
    const staleSettings = new UserSettings({
      createdAt: settings.createdAt,
      id: settings.id,
      timezone: detectedTimezone,
      updatedAt: settings.updatedAt,
      weightUnit: settings.weightUnit,
    })
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/schedule'))
    const [authenticated] = update(initial, SucceededFetchSession({ user }))
    const [ready] = update(authenticated, SucceededFetchSettings({ settings: staleSettings }))

    const [reconciling] = update(
      ready,
      SucceededFetchNextDose({
        nextDose: null,
        requestKey: 1,
        requestedTimezone: detectedTimezone,
        timezone: persistedTimezone,
      })
    )
    expect(AsyncData.isIdle(reconciling.schedule.nextDose)).toBe(true)

    const [refetching, commands] = update(
      reconciling,
      SucceededFetchSettings({ requestGeneration: 2, settings: staleSettings })
    )
    expect(AsyncData.isLoading(refetching.schedule.nextDose)).toBe(true)
    expect(commandArgs(commands, 'FetchNextDose')).toEqual({
      requestKey: 2,
      requestedTimezone: detectedTimezone,
    })
  })

  it('resets stats after every successful import even when timezone and range are unchanged', () => {
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/stats'))
    const [authenticated] = update(initial, SucceededFetchSession({ user }))
    const [ready] = update(authenticated, SucceededFetchSettings({ settings }))
    const result = new DataImportResult({
      goals: 1,
      injectionLogs: 1,
      schedules: 1,
      settingsUpdated: true,
      weightLogs: 1,
    })

    const [imported, settingsCommands] = update(ready, SucceededImportData({ result }))
    expect(AsyncData.isIdle(imported.stats.data)).toBe(true)
    expect(imported.stats.requestGeneration).toBe(1)
    expect(commandArgs(settingsCommands, 'FetchSettings')).toEqual({
      detectedTimezone: persistedTimezone,
      requestGeneration: 2,
    })

    const [refetched, statsCommands] = update(imported, SucceededFetchSettings({ requestGeneration: 2, settings }))
    expect(AsyncData.isLoading(refetched.stats.data)).toBe(true)
    expect(commandArgs(statsCommands, 'FetchStats')).toEqual({
      end: null,
      requestGeneration: 2,
      start: null,
      timezone: persistedTimezone,
    })
  })

  it('uses current browser detection to initialize after importing settings:null', () => {
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/stats'))
    const [authenticated] = update(initial, SucceededFetchSession({ user }))
    const [ready] = update(authenticated, SucceededFetchSettings({ settings }))
    const result = new DataImportResult({
      goals: 0,
      injectionLogs: 0,
      schedules: 0,
      settingsUpdated: false,
      weightLogs: 0,
    })

    const [, commands] = update(ready, SucceededImportData({ result }))

    expect(commandArgs(commands, 'FetchSettings')).toEqual({ detectedTimezone, requestGeneration: 2 })
  })

  it('clears retained wall-time forms before applying a changed persisted timezone', () => {
    const [initial] = init({ timezone: detectedTimezone }, parseUrl('https://subq.example/stats'))
    const [authenticated] = update(initial, SucceededFetchSession({ user }))
    const [ready] = update(authenticated, SucceededFetchSettings({ settings }))
    const [withWeightForm] = update(ready, CompletedOpenWeightForm({ log: null, nowLocal: '2026-07-01T09:30' }))
    const [withBothForms] = update(
      withWeightForm,
      CompletedOpenInjectionForm({ log: null, nowLocal: '2026-07-01T09:30' })
    )
    const changed = new UserSettings({
      createdAt: settings.createdAt,
      id: settings.id,
      timezone: IanaTimezone.make('America/Los_Angeles'),
      updatedAt: settings.updatedAt,
      weightUnit: settings.weightUnit,
    })

    const [rebased, commands] = update(withBothForms, SucceededFetchSettings({ settings: changed }))

    expect(withBothForms.weight.form).not.toBeNull()
    expect(withBothForms.injections.form).not.toBeNull()
    expect(rebased.weight.form).toBeNull()
    expect(rebased.injections.form).toBeNull()
    expect(commandArgs(commands, 'FetchStats')).toEqual({
      end: null,
      requestGeneration: 2,
      start: null,
      timezone: changed.timezone,
    })
  })
})
