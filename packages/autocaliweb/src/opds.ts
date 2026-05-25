import { DOMParser } from '@xmldom/xmldom'
import type { Document, Element } from '@xmldom/xmldom'
import { Effect } from 'effect'

import { decodeError } from './errors.js'
import type { AutocaliwebError } from './errors.js'
import type { BookRecord, CatalogEntry, DownloadLink } from './model.js'

interface AtomLink {
  readonly rel?: string | undefined
  readonly href?: string | undefined
  readonly type?: string | undefined
  readonly title?: string | undefined
  readonly length?: string | undefined
}

export interface OpdsFeed {
  readonly title?: string | undefined
  readonly updated?: string | undefined
  readonly nextHref?: string | undefined
  readonly books: ReadonlyArray<BookRecord>
  readonly navigation: ReadonlyArray<CatalogEntry>
}

const text = (element: Element | null): string | undefined => {
  const value = element?.textContent?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

const firstText = (element: Document | Element, tagName: string): string | undefined =>
  // oxlint-disable-next-line unicorn/prefer-query-selector
  text(element.getElementsByTagName(tagName).item(0))

const elements = (element: Document | Element, tagName: string): ReadonlyArray<Element> =>
  // oxlint-disable-next-line unicorn/prefer-query-selector, unicorn/prefer-spread
  Array.from(element.getElementsByTagName(tagName))

const attr = (element: Element, name: string): string | undefined => {
  const value = element.getAttribute(name)
  return value === null || value.length === 0 ? undefined : value
}

const linkFromElement = (element: Element): AtomLink => ({
  rel: attr(element, 'rel'),
  href: attr(element, 'href'),
  type: attr(element, 'type'),
  title: attr(element, 'title'),
  length: attr(element, 'length'),
})

const links = (entry: Element): ReadonlyArray<AtomLink> => elements(entry, 'link').map(linkFromElement)

const numberFromString = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const extractDownloadId = (href: string): string | undefined => {
  const marker = '/opds/download/'
  const start = href.indexOf(marker)
  if (start === -1) {
    return undefined
  }
  const rest = href.slice(start + marker.length)
  const [id] = rest.split('/')
  return id === undefined || id.length === 0 ? undefined : id
}

const uuidFromUrn = (urn: string | undefined): string | undefined => {
  const prefix = 'urn:uuid:'
  return urn?.startsWith(prefix) === true ? urn.slice(prefix.length) : undefined
}

const hrefWithBase = (baseUrl: string, href: string | undefined): string | undefined => {
  if (href === undefined) {
    return undefined
  }
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href
  }
  const normalizedBase = baseUrl.trim().endsWith('/') ? baseUrl.trim().slice(0, -1) : baseUrl.trim()
  return href.startsWith('/') ? `${normalizedBase}${href}` : `${normalizedBase}/${href}`
}

const downloadFromLink = (baseUrl: string, link: AtomLink): DownloadLink | undefined => {
  if (link.rel !== 'http://opds-spec.org/acquisition') {
    return undefined
  }
  const href = hrefWithBase(baseUrl, link.href)
  if (href === undefined) {
    return undefined
  }
  return { href, format: link.title, mediaType: link.type, size: numberFromString(link.length) }
}

const compact = <A>(records: ReadonlyArray<A | undefined>): ReadonlyArray<A> =>
  records.filter((record): record is A => record !== undefined)

const authors = (entry: Element): ReadonlyArray<string> =>
  compact(elements(entry, 'author').map((author) => firstText(author, 'name')))

const categories = (entry: Element): ReadonlyArray<string> =>
  compact(elements(entry, 'category').map((category) => attr(category, 'term') ?? attr(category, 'label')))

const languages = (entry: Element): ReadonlyArray<string> => compact(elements(entry, 'dcterms:language').map(text))

const entryLinks = (baseUrl: string, entry: Element): ReadonlyArray<AtomLink> =>
  links(entry).map((link) => ({ ...link, href: hrefWithBase(baseUrl, link.href) }))

const isBookEntry = (entry: Element): boolean => firstText(entry, 'id')?.startsWith('urn:uuid:') === true

const bookFromEntry = (baseUrl: string, entry: Element): BookRecord => {
  const atomLinks = entryLinks(baseUrl, entry)
  const downloads = compact(atomLinks.map((link) => downloadFromLink(baseUrl, link)))
  const urn = firstText(entry, 'id')
  const id = downloads.map((download) => extractDownloadId(download.href)).find((value) => value !== undefined)
  const coverHref = atomLinks.find((link) => link.rel === 'http://opds-spec.org/image')?.href
  return {
    id,
    uuid: uuidFromUrn(urn),
    urn,
    title: firstText(entry, 'title'),
    authors: authors(entry),
    published: firstText(entry, 'published'),
    updated: firstText(entry, 'updated'),
    languages: languages(entry),
    categories: categories(entry),
    summary: firstText(entry, 'content'),
    coverHref,
    downloads,
  }
}

const navigationFromEntry = (baseUrl: string, entry: Element): CatalogEntry => {
  const atomLinks = entryLinks(baseUrl, entry)
  const href = atomLinks.find((link) => link.href !== undefined)?.href
  return { title: firstText(entry, 'title'), id: firstText(entry, 'id'), href, content: firstText(entry, 'content') }
}

const parseDocument = (xml: string): Document => new DOMParser().parseFromString(xml, 'application/xml')

const messageFromUnknown = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export const parseOpdsFeed = (baseUrl: string, xml: string): Effect.Effect<OpdsFeed, AutocaliwebError> =>
  Effect.try({ try: () => parseDocument(xml), catch: (error) => decodeError(messageFromUnknown(error), error) }).pipe(
    Effect.map((document) => {
      const atomEntries = elements(document, 'entry')
      const bookEntries = atomEntries.filter(isBookEntry)
      const navigationEntries = atomEntries.filter((entry) => !isBookEntry(entry))
      return {
        title: firstText(document, 'title'),
        updated: firstText(document, 'updated'),
        nextHref:
          document.documentElement === null
            ? undefined
            : links(document.documentElement).find((link) => link.rel === 'next')?.href,
        books: bookEntries.map((entry) => bookFromEntry(baseUrl, entry)),
        navigation: navigationEntries.map((entry) => navigationFromEntry(baseUrl, entry)),
      }
    })
  )
