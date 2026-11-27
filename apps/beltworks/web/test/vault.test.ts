import { assert, it } from '@effect/vitest'
import { initial, sideContract } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'

import { vaultRows } from '../src/vault.ts'

it('shows all ten landmarks before the first delivery', () => {
  const rows = vaultRows(initial)
  assert.deepEqual(
    Arr.map(rows, (r) => r.value),
    [1, 3, 7, 12, 24, 37, 48, 72, 96, 128]
  )
  assert.deepEqual(rows[0], { value: 1, stock: 0, rate: 0, tags: ['Milestone'] })
})

it('shows stock, delivery rate and current uses, including non-landmark contracts', () => {
  const p = { ...initial, milestoneIndex: 3, vault: { 1: 9, 6: 2 }, rateByValue: { 1: 4 } }
  const rows = vaultRows(p)
  assert.includeDeepMembers(rows, [
    { value: 1, stock: 9, rate: 4, tags: ['Upgrade'] },
    { value: sideContract(0, 0).value, stock: 2, rate: 0, tags: ['Contract'] },
  ])
})
