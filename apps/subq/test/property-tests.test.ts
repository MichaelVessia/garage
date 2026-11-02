/**
 * Property-based tests for branded type validation.
 * Tests that branded types properly enforce their constraints.
 */
import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import {
  Count,
  DayOfWeek,
  DaysBetween,
  DoseMg,
  Frequency,
  frequencyToDays,
  InjectionsPerWeek,
  Limit,
  MedicationCompound,
  Offset,
  PhaseDurationDays,
  PhaseOrder,
  Weight,
} from '#shared'

describe('Branded Type Property Tests', () => {
  // ============================================
  // Canonical medication primitives
  // ============================================
  describe('MedicationCompound', () => {
    it.effect('accepts exactly the five supported GLP compounds', () =>
      Effect.sync(() => {
        const accepted = ['Semaglutide', 'Tirzepatide', 'Retatrutide', 'Liraglutide', 'Dulaglutide']

        for (const compound of accepted) {
          assert.isTrue(Exit.isSuccess(Schema.decodeUnknownExit(MedicationCompound)(compound)))
        }

        assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(MedicationCompound)('Ozempic')))
        assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(MedicationCompound)('semaglutide')))
        assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(MedicationCompound)('Testosterone')))
      })
    )
  })

  describe('DoseMg', () => {
    it.effect('accepts positive finite decimal milligrams', () =>
      Effect.sync(() => {
        assert.strictEqual(DoseMg.make(0.25), 0.25)
        assert.strictEqual(DoseMg.make(15), 15)
      })
    )

    it.effect('rejects strings, non-positive values, and non-finite values', () =>
      Effect.sync(() => {
        for (const invalid of ['2.5mg', 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
          assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(DoseMg)(invalid)))
        }
      })
    )
  })

  // ============================================
  // Weight - positive number
  // ============================================
  describe('Weight', () => {
    it.prop('accepts any positive number (property test)', [Weight], ([value]) => value > 0)

    it.effect('rejects zero', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(Weight)(0)
        assert.isTrue(Exit.isFailure(result))
      })
    )

    it.effect('rejects negative numbers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(Weight)(-1)
        assert.isTrue(Exit.isFailure(result))
      })
    )
  })

  // ============================================
  // Limit - positive integer
  // ============================================
  describe('Limit', () => {
    it.prop('accepts any positive integer (property test)', [Limit], ([value]) => value > 0 && Number.isInteger(value))

    it.effect('rejects zero', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(Limit)(0)
        assert.isTrue(Exit.isFailure(result))
      })
    )

    it.effect('rejects negative integers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(Limit)(-5)
        assert.isTrue(Exit.isFailure(result))
      })
    )

    it.effect('rejects non-integers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(Limit)(1.5)
        assert.isTrue(Exit.isFailure(result))
      })
    )
  })

  // ============================================
  // Offset - non-negative integer
  // ============================================
  describe('Offset', () => {
    it.prop(
      'accepts any non-negative integer (property test)',
      [Offset],
      ([value]) => value >= 0 && Number.isInteger(value)
    )

    it.effect('accepts zero', () =>
      Effect.sync(() => {
        const result = Offset.make(0)
        assert.strictEqual(result, 0)
      })
    )

    it.effect('rejects negative integers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(Offset)(-1)
        assert.isTrue(Exit.isFailure(result))
      })
    )

    it.effect('rejects non-integers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(Offset)(0.5)
        assert.isTrue(Exit.isFailure(result))
      })
    )
  })

  // ============================================
  // Count - non-negative integer
  // ============================================
  describe('Count', () => {
    it.prop(
      'accepts any non-negative integer (property test)',
      [Count],
      ([value]) => value >= 0 && Number.isInteger(value)
    )

    it.effect('accepts zero', () =>
      Effect.sync(() => {
        const result = Count.make(0)
        assert.strictEqual(result, 0)
      })
    )

    it.effect('rejects negative integers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(Count)(-1)
        assert.isTrue(Exit.isFailure(result))
      })
    )
  })

  // ============================================
  // DaysBetween - non-negative number
  // ============================================
  describe('DaysBetween', () => {
    it.prop('accepts any non-negative number (property test)', [DaysBetween], ([value]) => value >= 0)

    it.effect('accepts zero', () =>
      Effect.sync(() => {
        const result = DaysBetween.make(0)
        assert.strictEqual(result, 0)
      })
    )

    it.effect('accepts fractional days', () =>
      Effect.sync(() => {
        const result = DaysBetween.make(1.5)
        assert.strictEqual(result, 1.5)
      })
    )

    it.effect('rejects negative numbers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(DaysBetween)(-1)
        assert.isTrue(Exit.isFailure(result))
      })
    )
  })

  // ============================================
  // DayOfWeek - integer 0-6
  // ============================================
  describe('DayOfWeek', () => {
    it.prop(
      'accepts integers 0-6 (property test)',
      [DayOfWeek],
      ([value]) => value >= 0 && value <= 6 && Number.isInteger(value)
    )

    it.effect('rejects 7', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(DayOfWeek)(7)
        assert.isTrue(Exit.isFailure(result))
      })
    )

    it.effect('rejects negative', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(DayOfWeek)(-1)
        assert.isTrue(Exit.isFailure(result))
      })
    )
  })

  // ============================================
  // PhaseOrder - positive integer
  // ============================================
  describe('PhaseOrder', () => {
    it.prop(
      'accepts any positive integer (property test)',
      [PhaseOrder],
      ([value]) => value > 0 && Number.isInteger(value)
    )

    it.effect('rejects zero', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(PhaseOrder)(0)
        assert.isTrue(Exit.isFailure(result))
      })
    )

    it.effect('rejects negative integers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(PhaseOrder)(-1)
        assert.isTrue(Exit.isFailure(result))
      })
    )
  })

  // ============================================
  // PhaseDurationDays - positive integer
  // ============================================
  describe('PhaseDurationDays', () => {
    it.prop(
      'accepts any positive integer (property test)',
      [PhaseDurationDays],
      ([value]) => value > 0 && Number.isInteger(value)
    )

    it.effect('rejects zero', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(PhaseDurationDays)(0)
        assert.isTrue(Exit.isFailure(result))
      })
    )

    it.effect('rejects negative integers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(PhaseDurationDays)(-1)
        assert.isTrue(Exit.isFailure(result))
      })
    )
  })

  // ============================================
  // InjectionsPerWeek - non-negative number
  // ============================================
  describe('InjectionsPerWeek', () => {
    it.prop('accepts any non-negative number (property test)', [InjectionsPerWeek], ([value]) => value >= 0)

    it.effect('accepts zero', () =>
      Effect.sync(() => {
        const result = InjectionsPerWeek.make(0)
        assert.strictEqual(result, 0)
      })
    )

    it.effect('accepts fractional values', () =>
      Effect.sync(() => {
        const result = InjectionsPerWeek.make(0.5)
        assert.strictEqual(result, 0.5)
      })
    )

    it.effect('rejects negative numbers', () =>
      Effect.sync(() => {
        const result = Schema.decodeExit(InjectionsPerWeek)(-1)
        assert.isTrue(Exit.isFailure(result))
      })
    )
  })
})

// ============================================
// frequencyToDays Property Tests
// ============================================
describe('frequencyToDays Property Tests', () => {
  /**
   * Expected mappings for all frequency variants.
   */
  const expectedDays = {
    daily: 1,
    every_3_days: 3,
    weekly: 7,
    every_2_weeks: 14,
    monthly: 30,
  } satisfies Record<Frequency, number>

  it.prop(
    'returns positive integers for all frequency variants (property test)',
    [Frequency],
    ([frequency]) => frequencyToDays(frequency) > 0 && Number.isInteger(frequencyToDays(frequency))
  )

  it.effect('daily returns 1', () =>
    Effect.sync(() => {
      assert.strictEqual(frequencyToDays('daily'), 1)
    })
  )

  it.effect('every_3_days returns 3', () =>
    Effect.sync(() => {
      assert.strictEqual(frequencyToDays('every_3_days'), 3)
    })
  )

  it.effect('weekly returns 7', () =>
    Effect.sync(() => {
      assert.strictEqual(frequencyToDays('weekly'), 7)
    })
  )

  it.effect('every_2_weeks returns 14', () =>
    Effect.sync(() => {
      assert.strictEqual(frequencyToDays('every_2_weeks'), 14)
    })
  )

  it.effect('monthly returns 30', () =>
    Effect.sync(() => {
      assert.strictEqual(frequencyToDays('monthly'), 30)
    })
  )

  it.prop(
    'all variants map to correct day counts (property test)',
    [Frequency],
    ([frequency]) => frequencyToDays(frequency) === expectedDays[frequency]
  )

  it.effect('unknown frequency defaults to 7', () =>
    Effect.sync(() => {
      assert.strictEqual(frequencyToDays('unknown'), 7)
      assert.strictEqual(frequencyToDays(''), 7)
      assert.strictEqual(frequencyToDays('biweekly'), 7)
    })
  )
})
