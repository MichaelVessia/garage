import * as Arr from 'effect/Array'
import type { Html, HtmlBuilder } from 'foldkit/html'

// Shared Foldkit view fragments used across page views.

export const headerButton = <Message>({
  h,
  label,
  message,
}: {
  readonly h: HtmlBuilder<Message>
  readonly label: string
  readonly message: Message
}): Html =>
  h.button(
    [h.Class('flex items-center gap-1 text-left font-medium hover:text-foreground'), h.OnClick(message)],
    [label]
  )

export const viewDatalist = <Message>({
  h,
  id,
  values,
}: {
  readonly h: HtmlBuilder<Message>
  readonly id: string
  readonly values: ReadonlyArray<string>
}): Html =>
  h.datalist(
    [h.Id(id)],
    Arr.map(values, (value) => h.keyed('option')(value, [h.Value(value)], []))
  )
