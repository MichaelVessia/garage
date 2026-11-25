import { expect, it } from '@effect/vitest'
import { scaleLinear, scaleUtc } from 'd3'
import * as DateTime from 'effect/DateTime'

import { linearScale, utcScale } from '../src/chart/scale.ts'

it('keeps UTC tick dates and positions across a daylight saving transition', () => {
  const start = DateTime.toDate(DateTime.makeUnsafe('2026-10-30T05:00:00Z'))
  const end = DateTime.toDate(DateTime.makeUnsafe('2026-11-03T05:00:00Z'))
  const width = 840
  const scale = utcScale({ start, end, width })
  const reference = scaleUtc().domain([start, end]).range([0, width])

  expect(scale.ticks(5)).toEqual(reference.ticks(5))
  for (const tick of scale.ticks(5)) {
    expect(scale.position(tick)).toBeCloseTo(reference(tick))
  }

  expect(utcScale({ start, end: start, width }).position(start)).toBe(width / 2)
})

it('keeps linear tick values and positions for the weight and dose axes', () => {
  const scale = linearScale({ min: 178, max: 192, height: 220 })
  const reference = scaleLinear().domain([178, 192]).range([220, 0])

  expect(scale.ticks(5)).toEqual(reference.ticks(5))
  for (const tick of scale.ticks(5)) {
    expect(scale.position(tick)).toBeCloseTo(reference(tick))
  }
})
