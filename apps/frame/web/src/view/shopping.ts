import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import type { Html } from 'foldkit/html'

import type { ShoppingItem } from '#shared'

import { icon } from '../icons.js'
import type { Model } from '../main.js'
import { Message } from '../message.js'
import type { H } from './shared.js'
import { viewNotice } from './shared.js'

export const viewShoppingSummary: {
  (model: Model): (h: H) => Html
  (h: H, model: Model): Html
} = Function.dual(2, (h: H, model: Model): Html => {
  const open = Option.map(model.shopping.data, (items) => Arr.filter(items, (item) => item.status === 'needs_action'))

  return h.button(
    [h.Class('card t-shopping'), h.OnClick(Message.ClickedScreen({ screen: 'shopping' }))],
    [
      h.span(
        [h.Class('t-shopping-head')],
        [
          h.span([h.Class('card-title')], ['Shopping']),
          h.span(
            [h.Class('count num')],
            [Option.match(open, { onNone: () => '–', onSome: (items) => String(items.length) })]
          ),
        ]
      ),
      h.span(
        [h.Class('t-shopping-preview')],
        [
          Option.match(open, {
            onNone: () => (model.shopping.failed ? 'Shopping list unavailable' : 'Loading shopping list…'),
            onSome: (items) =>
              Arr.isReadonlyArrayNonEmpty(items)
                ? Arr.join(
                    Arr.map(Arr.take(items, 3), (item) => item.summary),
                    ', '
                  ) + (items.length > 3 ? ` and ${items.length - 3} more` : '')
                : 'Nothing to buy',
          }),
        ]
      ),
    ]
  )
})

const viewShoppingItem = (h: H, item: ShoppingItem) => {
  const done = item.status === 'completed'

  return h.li(
    [h.Key(item.uid)],
    [
      h.button(
        [
          h.Type('button'),
          h.Class(done ? 'shop-item is-done' : 'shop-item'),
          h.AriaPressed(done ? 'true' : 'false'),
          h.OnClick(Message.ClickedShoppingItem({ uid: item.uid, status: done ? 'needs_action' : 'completed' })),
        ],
        [
          h.span([h.Class('check')], done ? [icon(h, 'check', 'check-icon')] : []),
          h.span([h.Class('shop-name')], [item.summary]),
        ]
      ),
    ]
  )
}

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

const viewShoppingList = (h: H, items: ReadonlyArray<ShoppingItem>) => {
  const open = Arr.filter(items, (item) => item.status === 'needs_action')

  const done = Arr.take(
    Arr.filter(items, (item) => item.status === 'completed'),
    12
  )

  if (!Arr.isReadonlyArrayNonEmpty(items)) {
    return [viewNotice(h, 'The list is empty. Add an item above or from Home Assistant.')]
  }

  return [
    ...(Arr.isReadonlyArrayNonEmpty(open)
      ? [
          h.ul(
            [h.Class('shop-grid')],
            Arr.map(open, (item) => viewShoppingItem(h, item))
          ),
        ]
      : [viewNotice(h, 'Everything is checked off')]),
    ...(Arr.isReadonlyArrayNonEmpty(done)
      ? [
          h.h2([h.Class('group-title')], [`Done · ${done.length}`]),
          h.ul(
            [h.Class('shop-grid')],
            Arr.map(done, (item) => viewShoppingItem(h, item))
          ),
        ]
      : []),
  ]
}

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
          onSome: (items) => viewShoppingList(h, items),
        })
      ),
    ]
  )
})
