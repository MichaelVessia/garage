import type { html } from 'foldkit/html'

// Shared foldkit view fragments used across page views. Each takes the page's
// own `html<Message>()` instance so the returned nodes carry that page's
// message type.

export const headerButton = <Message>(h: ReturnType<typeof html<Message>>, label: string, message: Message) =>
  h.button(
    [h.Class('flex items-center gap-1 text-left font-medium hover:text-foreground'), h.OnClick(message)],
    [label]
  )

export const viewDatalist = <Message>(h: ReturnType<typeof html<Message>>, id: string, values: ReadonlyArray<string>) =>
  h.datalist(
    [h.Id(id)],
    values.map((value) => h.keyed('option')(value, [h.Value(value)], []))
  )
