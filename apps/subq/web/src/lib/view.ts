import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as Arr from 'effect/Array'

export const headerButton = <Message>({
  h,
  label,
  message,
}: {
  readonly h: Html.H<Message>
  readonly label: string
  readonly message: Message
}): View.Content<Message> =>
  h.button
    .class('flex items-center gap-1 text-left font-medium hover:text-foreground')
    .on('click', message)
    .children(label)

export const viewDatalist = <Message>({
  h,
  id,
  values,
}: {
  readonly h: Html.H<Message>
  readonly id: string
  readonly values: ReadonlyArray<string>
}): View.Content<Message> =>
  h.datalist.attr('id', id).children(Arr.map(values, (value) => h.option.key(value).attr('value', value)))
