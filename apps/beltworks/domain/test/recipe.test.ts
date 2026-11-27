import { assert, it } from '@effect/vitest'

import { suggestRecipe } from '../src/recipe.ts'

it('finds a short recipe using the supplied veins and operations', () => {
  assert.deepEqual(suggestRecipe(37, [2, 5, 7], ['add', 'mul']), ['37 = 2 + (5 × 7)'])
  assert.deepEqual(suggestRecipe(7, [2], ['mul']), [])
  assert.deepEqual(suggestRecipe(7, [7], []), ['Extract 7 directly'])
  assert.deepEqual(suggestRecipe(83, [2, 5, 7, 9], ['add', 'mul']), ['83 = 2 + (9 × 9)'])
})

it('can build the first prime target before multiplication unlocks', () => {
  const [hint] = suggestRecipe(11, [1, 2, 3, 4], ['add'])
  assert.equal(hint, '11 = 3 + (4 + 4)')
})

it('shows exact quotients and keeps subtraction operands in order', () => {
  assert.deepEqual(suggestRecipe(3, [7, 2], ['div']), [])
  assert.deepEqual(suggestRecipe(5, [2, 7], ['sub']), ['5 = 7 − 2'])
})
