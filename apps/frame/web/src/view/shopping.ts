import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'
import type { Html } from 'foldkit/html'

import type { ShoppingItem } from '#shared'

import { icon } from '../icons.js'
import type { Model } from '../main.js'
import { Message } from '../message.js'
import { pastItemsMatching } from '../shopping.js'
import type { PastItem } from '../shopping.js'
import type { H } from './shared.js'
import { viewNotice } from './shared.js'

// Checking off an open item moves it to "Buy again"; tapping it there puts it back.
const viewShoppingItem = (h: H, item: ShoppingItem) =>
  h.li(
    [h.Key(item.uid)],
    [
      h.button(
        [
          h.Type('button'),
          h.Class('shop-item'),
          h.AriaLabel(`Check off ${item.summary}`),
          h.OnClick(Message.ClickedShoppingItem({ uid: item.uid, status: 'completed' })),
        ],
        [h.span([h.Class('check')], []), h.span([h.Class('shop-name')], [item.summary])]
      ),
    ]
  )

const viewShoppingAdd = (h: H, model: Model) =>
  h.form(
    [h.Class('shop-add'), h.OnSubmit(Message.SubmittedShoppingItem())],
    [
      h.input([
        h.Class('field'),
        h.Type('text'),
        h.AriaLabel('New item'),
        h.Placeholder('Add an item'),
        h.Value(model.shoppingDraft),
        h.OnInput((value) => Message.ChangedShoppingDraft({ value })),
      ]),
      h.button([h.Class('btn btn-primary'), h.Type('submit')], [icon(h, 'plus'), 'Add']),
    ]
  )

// Past items shown while the field is empty, and matches shown while typing.
const PAST_SHOWN = 24
const MATCHES_SHOWN = 10

const viewPastItem = (h: H, past: PastItem) =>
  h.li(
    [h.Key(past.item.uid)],
    [
      h.button(
        [
          h.Type('button'),
          h.Class('again'),
          h.AriaLabel(`Add ${past.item.summary} again`),
          h.OnClick(Message.ClickedShoppingItem({ uid: past.item.uid, status: 'needs_action' })),
        ],
        [icon(h, 'plus', 'again-icon'), h.span([h.Class('again-name')], [past.item.summary])]
      ),
    ]
  )

const viewBuyAgain = (h: H, items: ReadonlyArray<ShoppingItem>, draft: string) => {
  const isTyping = Str.trim(draft) !== ''
  const past = Arr.take(pastItemsMatching(items, draft), isTyping ? MATCHES_SHOWN : PAST_SHOWN)

  return Arr.isReadonlyArrayNonEmpty(past)
    ? [
        h.section(
          [h.Class('again-group')],
          [
            h.h2([h.Class('group-title')], [isTyping ? 'Bought before' : 'Buy again']),
            h.ul(
              [h.Class('again-list')],
              Arr.map(past, (item) => viewPastItem(h, item))
            ),
          ]
        ),
      ]
    : []
}

const viewOpenItems = (h: H, items: ReadonlyArray<ShoppingItem>) => {
  const open = Arr.filter(items, (item) => item.status === 'needs_action')

  if (Arr.isReadonlyArrayNonEmpty(open)) {
    return [
      h.ul(
        [h.Class('shop-grid')],
        Arr.map(open, (item) => viewShoppingItem(h, item))
      ),
    ]
  }

  return [
    viewNotice(
      h,
      Arr.isReadonlyArrayNonEmpty(items)
        ? 'Everything is checked off'
        : 'The list is empty. Add an item above or from Home Assistant.'
    ),
  ]
}

// While typing, matches from past items come first so the on-screen keyboard does not cover them.
const viewShoppingList = (h: H, items: ReadonlyArray<ShoppingItem>, draft: string) =>
  Str.trim(draft) === ''
    ? [...viewOpenItems(h, items), ...viewBuyAgain(h, items, draft)]
    : [...viewBuyAgain(h, items, draft), ...viewOpenItems(h, items)]

export const viewShopping: {
  (model: Model): (h: H) => Html
  (h: H, model: Model): Html
} = Function.dual(2, (h: H, model: Model): Html => {
  const openCount = Option.map(
    model.shopping.data,
    (items) => Arr.filter(items, (item) => item.status === 'needs_action').length
  )

  return h.div(
    [h.Class('screen shop')],
    [
      h.header(
        [h.Class('toolbar')],
        [
          h.h1(
            [h.Class('screen-title')],
            [
              'Shopping list',
              ...Arr.map(Arr.fromOption(openCount), (count) => h.span([h.Class('count num')], [String(count)])),
            ]
          ),
          viewShoppingAdd(h, model),
        ]
      ),
      h.div(
        [h.Class('card shop-body')],
        Option.match(model.shopping.data, {
          onNone: () => [viewNotice(h, model.shopping.failed ? 'Shopping list unavailable' : 'Loading shopping list…')],
          onSome: (items) => viewShoppingList(h, items, model.shoppingDraft),
        })
      ),
    ]
  )
})
