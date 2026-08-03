import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'vitest'

import { IanaTimezone, inferScheduleDraftFromInjectionLogs, InjectionLog } from '#shared'

const decodeInjection = Schema.decodeUnknownSync(InjectionLog)

const injection = (id: string, datetime: string, doseMg: number) =>
  decodeInjection({
    createdAt: DateTime.makeUnsafe('2026-03-01T00:00:00.000Z'),
    datetime: DateTime.makeUnsafe(datetime),
    doseMg,
    drug: 'Semaglutide',
    id,
    injectionSite: null,
    notes: null,
    scheduleId: null,
    supplier: null,
    updatedAt: DateTime.makeUnsafe('2026-03-01T00:00:00.000Z'),
  })

describe('schedule inference', () => {
  it('projects event instants into persisted local calendar dates', () => {
    const draft = inferScheduleDraftFromInjectionLogs(
      [
        injection('injection-1', '2026-03-08T04:30:00.000Z', 1),
        injection('injection-2', '2026-03-09T03:30:00.000Z', 2),
      ],
      IanaTimezone.make('America/New_York')
    )

    expect(Option.isSome(draft)).toBe(true)
    if (Option.isNone(draft)) {
      return
    }
    expect(draft.value.startDate).toBe('2026-03-07')
    expect(Option.getOrUndefined(draft.value.phases[0]?.durationDays ?? Option.none())).toBe(1)
  })
})
