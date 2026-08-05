import type { HtmlBuilder } from 'foldkit/html'

// Shared Foldkit view fragments used across page views.

export const headerButton = <Message>(h: HtmlBuilder<Message>, label: string, message: Message) =>
  h.button(
    [h.Class('flex items-center gap-1 text-left font-medium hover:text-foreground'), h.OnClick(message)],
    [label]
  )

export const viewDatalist = <Message>(h: HtmlBuilder<Message>, id: string, values: ReadonlyArray<string>) =>
  h.datalist(
    [h.Id(id)],
    values.map((value) => h.keyed('option')(value, [h.Value(value)], []))
  )
