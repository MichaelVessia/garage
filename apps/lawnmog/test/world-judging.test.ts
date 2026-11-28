import * as Option from 'effect/Option'
import { expect, it } from 'vitest'

import { createBlock, judgingIntervalMs, viewBlock } from '../src/block.ts'
import { awardPosition, ceremonyRoute } from '../src/world-judging.ts'

it('visits the resident during judging, brings the award to the sidewalk, and walks home', () => {
  const view = viewBlock({ block: createBlock(1000), credential: Option.none() })
  const lot = view.lots[0]!
  const finish = view.nextJudgingAt
  const inspect = ceremonyRoute({ ...view, lots: [{ ...lot, bot: false }] })
  const home = inspect(finish - 90_000)
  const sidewalk = awardPosition(0)
  expect(inspect(finish - 50_000)).toMatchObject({
    x: sidewalk.x,
    z: expect.closeTo(sidewalk.z + 0.85),
    walking: false,
    caption: 'JUDGING YOUR LAWN',
  })
  const award = ceremonyRoute({ ...view, lots: [lot], yardWinner: lot.id, nextJudgingAt: finish + judgingIntervalMs })
  expect(award(finish + 4500)).toMatchObject({ walking: true, planted: false })
  expect(award(finish + 12_000)).toMatchObject({
    x: sidewalk.x,
    z: expect.closeTo(sidewalk.z + 0.85),
    planted: true,
    walking: false,
  })
  expect(award(finish + 18_000)).toMatchObject({ planted: true, walking: true })
  expect(award(finish + 24_000)).toEqual(home)
})
