// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { AsyncData, Story } from 'foldkit'

import { IanaTimezone } from '#shared'

import { ActivateSchedule, DeleteSchedule, FetchNextDose, FetchSchedules } from '../src/page/schedule/command.js'
import {
  CancelledDeleteSchedule,
  ClickedActivateSchedule,
  ConfirmedDeleteSchedule,
  FailedActivateSchedule,
  FailedDeleteSchedule,
  FailedFetchNextDose,
  FailedFetchSchedules,
  RequestedDeleteSchedule,
  SucceededActivateSchedule,
  SucceededDeleteSchedule,
  SucceededFetchNextDose,
  SucceededFetchSchedules,
  initialScheduleModel,
} from '../src/page/schedule/model.js'
import type { ScheduleModel } from '../src/page/schedule/model.js'
import { fetchScheduleIfIdle } from '../src/page/schedule/update.js'
import { sampleSchedule, succeededNextDose, timezone, update, validForm } from './schedule-fixtures.js'

const { Command } = Story

describe('schedule page update', () => {
  describe('delete flow', () => {
    it('requesting a delete closes any open form and asks for confirmation', () => {
      const withForm: ScheduleModel = { ...initialScheduleModel, form: validForm }
      Story.story(
        update,
        Story.given(withForm),
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
        Story.given(withPending),
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
        Story.given(initialScheduleModel),
        Story.message(ConfirmedDeleteSchedule()),
        Command.expectNone()
      )
    })

    it('confirming a delete removes the schedule and refetches', () => {
      const withPending: ScheduleModel = { ...initialScheduleModel, pendingDeleteId: sampleSchedule.id }
      Story.story(
        update,
        Story.given(withPending),
        Story.message(ConfirmedDeleteSchedule()),
        Command.resolveAll(
          [DeleteSchedule, SucceededDeleteSchedule()],
          [FetchSchedules, SucceededFetchSchedules({ schedules: [] })],
          [FetchNextDose, succeededNextDose()]
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
        Story.given(withPending),
        Story.message(ConfirmedDeleteSchedule()),
        Command.resolveAll([DeleteSchedule, FailedDeleteSchedule({ message: 'Failed to delete schedule' })]),
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
        Story.given(initialScheduleModel),
        Story.message(ClickedActivateSchedule({ schedule: sampleSchedule })),
        Command.resolveAll(
          [ActivateSchedule, SucceededActivateSchedule()],
          [FetchSchedules, SucceededFetchSchedules({ schedules: [sampleSchedule] })],
          [FetchNextDose, succeededNextDose()]
        ),
        Story.model((model: ScheduleModel) => {
          expect(model.schedules._tag).toBe('Success')
        })
      )
    })

    it('a failed activation leaves the model untouched', () => {
      Story.story(
        update,
        Story.given(initialScheduleModel),
        Story.message(ClickedActivateSchedule({ schedule: sampleSchedule })),
        Command.resolveAll([ActivateSchedule, FailedActivateSchedule({ message: 'Failed to activate schedule' })]),
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
        Story.given(initialScheduleModel),
        Story.message(FailedFetchSchedules({ message: 'Failed to load schedules' })),
        Command.expectNone(),
        Story.message(
          FailedFetchNextDose({
            message: 'Failed to load next dose',
            requestKey: 0,
            requestedTimezone: timezone,
          })
        ),
        Command.expectNone(),
        Story.model((model: ScheduleModel) => {
          expect(model.schedules).toEqual(AsyncData.Failure({ error: 'Failed to load schedules' }))
          expect(model.nextDose).toEqual(AsyncData.Failure({ error: 'Failed to load next dose' }))
        })
      )
    })
  })

  describe('fetchScheduleIfIdle', () => {
    it('dispatches both fetches when everything is idle', () => {
      const { model: loading, commands = [] } = fetchScheduleIfIdle(initialScheduleModel, timezone)
      expect(AsyncData.isLoading(loading.schedules)).toBe(true)
      expect(AsyncData.isLoading(loading.nextDose)).toBe(true)
      expect(Arr.map(commands, (command) => command.name)).toEqual(['FetchSchedules', 'FetchNextDose'])
      expect(commands[1]?.args).toEqual({ requestKey: 1, requestedTimezone: timezone })
    })

    it('rejects old-zone success and failure responses after reset and refetches when needed', () => {
      const oldTimezone = IanaTimezone.make('America/New_York')
      const { model: oldLoading } = fetchScheduleIfIdle(initialScheduleModel, oldTimezone)
      const reset = { ...oldLoading, nextDose: AsyncData.Idle() }
      const { model: currentLoading } = fetchScheduleIfIdle(reset, timezone)

      const { model: afterOldSuccess, commands: successCommands = [] } = update(
        currentLoading,
        SucceededFetchNextDose({
          nextDose: null,
          requestKey: 1,
          requestedTimezone: oldTimezone,
          timezone: oldTimezone,
        })
      )

      expect(AsyncData.isLoading(afterOldSuccess.nextDose)).toBe(true)
      expect(successCommands).toHaveLength(0)

      const { model: afterOldFailure, commands: failureCommands = [] } = update(
        reset,
        FailedFetchNextDose({
          message: 'old request failed',
          requestKey: 1,
          requestedTimezone: oldTimezone,
        })
      )

      expect(AsyncData.isLoading(afterOldFailure.nextDose)).toBe(true)
      expect(failureCommands[0]?.args).toEqual({ requestKey: 2, requestedTimezone: timezone })
    })

    it('skips slices that are already loaded', () => {
      const alreadyLoaded: ScheduleModel = {
        ...initialScheduleModel,
        nextDose: AsyncData.succeed(Option.none()),
        schedules: AsyncData.succeed([sampleSchedule]),
      }

      const { model: same, commands = [] } = fetchScheduleIfIdle(alreadyLoaded, timezone)
      expect(same).toBe(alreadyLoaded)
      expect(commands).toHaveLength(0)
    })
  })
})
