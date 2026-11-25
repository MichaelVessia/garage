import { it } from '@effect/vitest'
import { PERSONAL_JOURNAL_ID as target } from '@garage/subq-domain/Journal/Journal.id'
import { ScheduleName } from '@garage/subq-domain/Values'
import * as Arr from 'effect/Array'
import { Scene } from 'foldkit'

import { client } from '../src/client.ts'
import { OpenScheduleForm } from '../src/page/schedule/command.ts'
import { CompletedOpenScheduleForm } from '../src/page/schedule/model.ts'
import { app, loaded, press, receipt, schedule, today } from './journal-fixtures.ts'

it('keeps phase IDs when updating the schedule name', () => {
  const name = ScheduleName.make('New name')
  const request = client.ReviseSchedule({
    target,
    commandId: 'test-session:0',
    input: {
      scheduleId: schedule.id,
      name,
      compound: schedule.compound,
      notes: null,
      supplier: schedule.supplier,
      frequency: schedule.frequency,
      startDate: schedule.startDate,
      phases: Arr.map(schedule.phases, ({ id, doseMg, durationDays, order }) => ({ id, doseMg, durationDays, order })),
    },
  })
  Scene.scene(
    app,
    Scene.given(loaded('/schedule')),
    press('Edit'),
    Scene.Command.resolve(OpenScheduleForm, CompletedOpenScheduleForm({ schedule, todayLocal: today })),
    Scene.type(Scene.label('Schedule Name *'), name),
    Scene.submit('form'),
    Scene.Command.expectExact(request),
    Scene.Command.resolve(
      request,
      client.Message.SucceededReviseSchedule({ commandId: 'test-session:0', receipt, reply: undefined })
    )
  )
})
