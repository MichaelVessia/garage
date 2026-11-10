import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as HashSet from 'effect/HashSet'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as R from 'effect/Record'
import * as Str from 'effect/String'

import type { ShoppingItem } from '#shared'

// Matching ignores case and surrounding or repeated spaces, so "milk " and "Milk" are one item.
const normalized = (summary: string): string => Str.toLowerCase(Str.replaceAll(/\s+/gu, ' ')(Str.trim(summary)))

/** An item bought before: the completed entry to reopen and how often it appears on the list. */
export interface PastItem {
  readonly item: ShoppingItem
  readonly times: number
}

// Rank by how often an item was bought; ties keep the list's order.
const byTimes = Order.mapInput(Order.flip(Order.Number), (past: PastItem) => past.times)

/**
 * Completed items not already on the list, most often bought first. The Home Assistant list keeps
 * checked-off items, so they are the household's buying history.
 */
const pastItems = (items: ReadonlyArray<ShoppingItem>): ReadonlyArray<PastItem> => {
  const open = HashSet.fromIterable(
    Arr.map(
      Arr.filter(items, (item) => item.status === 'needs_action'),
      (item) => normalized(item.summary)
    )
  )

  const groups = Arr.groupBy(
    Arr.filter(items, (item) => item.status === 'completed' && !HashSet.has(open, normalized(item.summary))),
    (item) => normalized(item.summary)
  )

  return Arr.sort(
    Arr.map(R.values(groups), (group): PastItem => ({ item: Arr.headNonEmpty(group), times: group.length })),
    byTimes
  )
}

/** Past items whose name contains the draft, those that start with it first. */
export const pastItemsMatching: {
  (draft: string): (items: ReadonlyArray<ShoppingItem>) => ReadonlyArray<PastItem>
  (items: ReadonlyArray<ShoppingItem>, draft: string): ReadonlyArray<PastItem>
} = Function.dual(2, (items: ReadonlyArray<ShoppingItem>, draft: string): ReadonlyArray<PastItem> => {
  const query = normalized(draft)
  const all = pastItems(items)
  const startsWithQuery = (past: PastItem) => Str.startsWith(query)(normalized(past.item.summary))

  return query === ''
    ? all
    : [
        ...Arr.filter(all, startsWithQuery),
        ...Arr.filter(all, (past) => !startsWithQuery(past) && Str.includes(query)(normalized(past.item.summary))),
      ]
})

/** The item already on the list, or the completed one to reopen, that a typed name refers to. */
export const sameItem: {
  (summary: string): (items: ReadonlyArray<ShoppingItem>) => Option.Option<ShoppingItem>
  (items: ReadonlyArray<ShoppingItem>, summary: string): Option.Option<ShoppingItem>
} = Function.dual(2, (items: ReadonlyArray<ShoppingItem>, summary: string): Option.Option<ShoppingItem> => {
  const name = normalized(summary)
  const matches = Arr.filter(items, (item) => normalized(item.summary) === name)

  return Option.orElse(
    Arr.findFirst(matches, (item) => item.status === 'needs_action'),
    () => Arr.head(matches)
  )
})
