import type { Html, HtmlBuilder } from 'foldkit/html'

import type { Message } from './Model.ts'

export const webLink =
  (h: HtmlBuilder<Message>) =>
  (label: string, url?: string): Html => {
    if (url === undefined || !URL.canParse(url)) {
      return null
    }
    const target = new URL(url)
    return target.protocol === 'https:' || target.protocol === 'http:'
      ? h.a([h.Href(target.href), h.Class('font-medium text-teal-800 underline underline-offset-2')], [label])
      : null
  }
