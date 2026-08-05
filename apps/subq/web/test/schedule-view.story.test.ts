// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as AsyncData from 'foldkit/asyncData'
import * as Story from 'foldkit/story'

import {
  CalendarDate,
  DoseMg,
  MedicationCompound,
  InjectionScheduleId,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseId,
  ScheduleView,
} from '#shared'

import {
  FailedFetchScheduleView,
  SucceededFetchScheduleView,
  fetchScheduleView,
  initialScheduleViewModel,
  updateScheduleView,
} from '../src/page/schedule-view.js'
import type { ScheduleViewModel } from '../src/page/schedule-view.js'

const { Command } = Story

const sampleView = new ScheduleView({
  createdAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
  drug: MedicationCompound.make('Semaglutide'),
  endDate: null,
  frequency: 'weekly',
  id: InjectionScheduleId.make('schedule-1'),
  isActive: true,
  name: ScheduleName.make('Titration'),
  notes: Notes.make('taper slowly'),
  phases: [
    {
      completedInjections: 2,
      doseMg: DoseMg.make(0.25),
      durationDays: PhaseDurationDays.make(28),
      endDate: CalendarDate.make('2026-01-29'),
      expectedInjections: 4,
      id: SchedulePhaseId.make('phase-1'),
      injections: [],
      order: PhaseOrder.make(1),
      startDate: CalendarDate.make('2026-01-01'),
      status: 'current',
    },
  ],
  supplier: null,
  startDate: CalendarDate.make('2026-01-01'),
  totalCompletedInjections: 2,
  totalExpectedInjections: null,
  updatedAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
})

describe('schedule-view page', () => {
  it('fetchScheduleView loads when the schedule id changes and marks the view as loading', () => {
    const [loading, commands] = fetchScheduleView(initialScheduleViewModel, 'schedule-1')
    expect(loading.scheduleId).toBe('schedule-1')
    expect(AsyncData.isLoading(loading.view)).toBe(true)
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('FetchScheduleView')
    expect(commands[0]?.args).toEqual({ scheduleId: 'schedule-1' })
  })

  it('fetchScheduleView is a no-op for the same id once loaded', () => {
    const loaded: ScheduleViewModel = {
      scheduleId: 'schedule-1',
      view: AsyncData.succeed(Option.some(sampleView)),
    }
    const [same, commands] = fetchScheduleView(loaded, 'schedule-1')
    expect(same).toBe(loaded)
    expect(commands).toHaveLength(0)
  })

  it('fetchScheduleView refetches when switching to a different schedule id', () => {
    const loaded: ScheduleViewModel = {
      scheduleId: 'schedule-1',
      view: AsyncData.succeed(Option.some(sampleView)),
    }
    const [switched, commands] = fetchScheduleView(loaded, 'schedule-2')
    expect(switched.scheduleId).toBe('schedule-2')
    expect(AsyncData.isLoading(switched.view)).toBe(true)
    expect(commands).toHaveLength(1)
    expect(commands[0]?.args).toEqual({ scheduleId: 'schedule-2' })
  })

  it('a successful fetch resolves to the found schedule view', () => {
    const [loading] = fetchScheduleView(initialScheduleViewModel, 'schedule-1')
    Story.story(
      updateScheduleView,
      Story.given(loading),
      Story.message(SucceededFetchScheduleView({ view: sampleView })),
      Story.model((model: ScheduleViewModel) => {
        expect(model.view._tag).toBe('Success')
        expect(AsyncData.getOrElse(model.view, () => Option.none())).toEqual(Option.some(sampleView))
      })
    )
  })

  it('a successful fetch for a schedule that no longer exists resolves to None', () => {
    const [loading] = fetchScheduleView(initialScheduleViewModel, 'missing-schedule')
    Story.story(
      updateScheduleView,
      Story.given(loading),
      Story.message(SucceededFetchScheduleView({ view: null })),
      Story.model((model: ScheduleViewModel) => {
        expect(model.view._tag).toBe('Success')
        expect(AsyncData.getOrElse(model.view, () => Option.some(sampleView))).toEqual(Option.none())
      })
    )
  })

  it('a failed fetch surfaces the error message', () => {
    const [loading] = fetchScheduleView(initialScheduleViewModel, 'schedule-1')
    Story.story(
      updateScheduleView,
      Story.given(loading),
      Story.message(FailedFetchScheduleView({ message: 'Failed to load schedule' })),
      Story.model((model: ScheduleViewModel) => {
        expect(model.view).toEqual(AsyncData.Failure({ error: 'Failed to load schedule' }))
      })
    )
  })

  it('no commands are left pending once the fetch resolves', () => {
    Story.story(
      updateScheduleView,
      Story.given(initialScheduleViewModel),
      Story.message(SucceededFetchScheduleView({ view: sampleView })),
      Command.expectNone()
    )
  })
})
