import type { Html } from '@effect/ui/html'

import type { Message } from './Model.ts'

export const webLink = (h: Html.H<Message>) => (label: string, url?: string) => {
  if (url === undefined || !URL.canParse(url)) {
    return undefined
  }
  const target = new URL(url)
  return target.protocol === 'https:' || target.protocol === 'http:'
    ? h.a.attr('href', target.href).class('font-medium text-teal-800 underline underline-offset-2').children(label)
    : undefined
}
