import { DOMParser } from '@xmldom/xmldom'
import type { Document, Element } from '@xmldom/xmldom'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { decodeError } from './errors.js'
import type { AutocaliwebError } from './errors.js'
import type { BookRecord, CatalogEntry, DownloadLink } from './model.js'

interface AtomLink {
  readonly rel: Option.Option<string>
  readonly href: Option.Option<string>
  readonly type: Option.Option<string>
  readonly title: Option.Option<string>
  readonly length: Option.Option<string>
}

export interface OpdsFeed {
  readonly title: Option.Option<string>
  readonly updated: Option.Option<string>
  readonly nextHref: Option.Option<string>
  readonly books: ReadonlyArray<BookRecord>
  readonly navigation: ReadonlyArray<CatalogEntry>
}

const nonEmpty = (value: string): Option.Option<string> =>
  // oxlint-disable-next-line effect/no-length-comparison -- string length check, not an array
  value.length === 0 ? Option.none() : Option.some(value)

const text = (element: Element): Option.Option<string> =>
  Option.fromNullishOr(element.textContent).pipe(
    Option.map((value) => value.trim()),
    Option.flatMap(nonEmpty)
  )

const firstText = (element: Document | Element, tagName: string): Option.Option<string> =>
  // oxlint-disable-next-line unicorn/prefer-query-selector
  Option.fromNullishOr(element.getElementsByTagName(tagName).item(0)).pipe(Option.flatMap(text))

const elements = (element: Document | Element, tagName: string): ReadonlyArray<Element> =>
  // oxlint-disable-next-line unicorn/prefer-query-selector, unicorn/prefer-spread
  Array.from(element.getElementsByTagName(tagName))

const attr = (element: Element, name: string): Option.Option<string> =>
  Option.fromNullishOr(element.getAttribute(name)).pipe(Option.flatMap(nonEmpty))

const linkFromElement = (element: Element): AtomLink => ({
  rel: attr(element, 'rel'),
  href: attr(element, 'href'),
  type: attr(element, 'type'),
  title: attr(element, 'title'),
  length: attr(element, 'length'),
})

const links = (entry: Element): ReadonlyArray<AtomLink> => elements(entry, 'link').map(linkFromElement)

const numberFromString = (value: Option.Option<string>): Option.Option<number> =>
  value.pipe(Option.map(Number), Option.filter(Number.isFinite))

const extractDownloadId = (href: string): Option.Option<string> => {
  const marker = '/opds/download/'
  const start = href.indexOf(marker)
  if (start === -1) {
    return Option.none()
  }
  const rest = href.slice(start + marker.length)
  const [id] = rest.split('/')
  return Option.fromNullishOr(id).pipe(Option.flatMap(nonEmpty))
}

const uuidFromUrn = (urn: Option.Option<string>): Option.Option<string> => {
  const prefix = 'urn:uuid:'
  return urn.pipe(
    Option.flatMap((value) => (value.startsWith(prefix) ? Option.some(value.slice(prefix.length)) : Option.none()))
  )
}

const normalizeBase = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const hrefWithBase = (baseUrl: string, href: Option.Option<string>): Option.Option<string> =>
  href.pipe(
    Option.map((value) => {
      if (value.startsWith('http://') || value.startsWith('https://')) {
        return value
      }
      const normalizedBase = normalizeBase(baseUrl)
      return value.startsWith('/') ? `${normalizedBase}${value}` : `${normalizedBase}/${value}`
    })
  )

const downloadFromLink = (baseUrl: string, link: AtomLink): Option.Option<DownloadLink> => {
  if (!Option.contains(link.rel, 'http://opds-spec.org/acquisition')) {
    return Option.none()
  }
  return hrefWithBase(baseUrl, link.href).pipe(
    Option.map((href) => ({
      href,
      format: Option.getOrUndefined(link.title),
      mediaType: Option.getOrUndefined(link.type),
      size: numberFromString(link.length).pipe(Option.getOrUndefined),
    }))
  )
}

const authors = (entry: Element): ReadonlyArray<string> =>
  Arr.getSomes(elements(entry, 'author').map((author) => firstText(author, 'name')))

const categories = (entry: Element): ReadonlyArray<string> =>
  Arr.getSomes(
    elements(entry, 'category').map((category) =>
      attr(category, 'term').pipe(Option.orElse(() => attr(category, 'label')))
    )
  )

const languages = (entry: Element): ReadonlyArray<string> => Arr.getSomes(elements(entry, 'dcterms:language').map(text))

const entryLinks = (baseUrl: string, entry: Element): ReadonlyArray<AtomLink> =>
  links(entry).map((link) => ({ ...link, href: hrefWithBase(baseUrl, link.href) }))

const isBookEntry = (entry: Element): boolean =>
  Option.contains(firstText(entry, 'id').pipe(Option.map((id) => id.startsWith('urn:uuid:'))), true)

const bookFromEntry = (baseUrl: string, entry: Element): BookRecord => {
  const atomLinks = entryLinks(baseUrl, entry)
  const downloads = Arr.getSomes(atomLinks.map((link) => downloadFromLink(baseUrl, link)))
  const urn = firstText(entry, 'id')
  const id = Arr.head(Arr.getSomes(downloads.map((download) => extractDownloadId(download.href))))
  const coverHref = Arr.findFirst(atomLinks, (link) => Option.contains(link.rel, 'http://opds-spec.org/image')).pipe(
    Option.flatMap((link) => link.href)
  )
  return {
    id: Option.getOrUndefined(id),
    uuid: uuidFromUrn(urn).pipe(Option.getOrUndefined),
    urn: Option.getOrUndefined(urn),
    title: Option.getOrUndefined(firstText(entry, 'title')),
    authors: authors(entry),
    published: Option.getOrUndefined(firstText(entry, 'published')),
    updated: Option.getOrUndefined(firstText(entry, 'updated')),
    languages: languages(entry),
    categories: categories(entry),
    summary: Option.getOrUndefined(firstText(entry, 'content')),
    coverHref: Option.getOrUndefined(coverHref),
    downloads,
  }
}

const navigationFromEntry = (baseUrl: string, entry: Element): CatalogEntry => {
  const atomLinks = entryLinks(baseUrl, entry)
  const href = Arr.findFirst(atomLinks, (link) => Option.isSome(link.href)).pipe(Option.flatMap((link) => link.href))
  return {
    title: Option.getOrUndefined(firstText(entry, 'title')),
    id: Option.getOrUndefined(firstText(entry, 'id')),
    href: Option.getOrUndefined(href),
    content: Option.getOrUndefined(firstText(entry, 'content')),
  }
}

const parseDocument = (xml: string): Document => new DOMParser().parseFromString(xml, 'application/xml')

const messageFromUnknown = (error: unknown): string =>
  // oxlint-disable-next-line effect/avoid-untagged-errors -- diagnostic message extraction from an unknown thrown DOM parser defect
  error instanceof Error ? error.message : String(error)

const feedNextHref = (document: Document): Option.Option<string> =>
  Option.fromNullishOr(document.documentElement).pipe(
    Option.flatMap((root) =>
      Arr.findFirst(links(root), (link) => Option.contains(link.rel, 'next')).pipe(Option.flatMap((link) => link.href))
    )
  )

export const parseOpdsFeed = (baseUrl: string, xml: string): Effect.Effect<OpdsFeed, AutocaliwebError> =>
  Effect.try({ try: () => parseDocument(xml), catch: (error) => decodeError(messageFromUnknown(error), error) }).pipe(
    Effect.map((document) => {
      const atomEntries = elements(document, 'entry')
      const bookEntries = atomEntries.filter(isBookEntry)
      const navigationEntries = atomEntries.filter((entry) => !isBookEntry(entry))
      return {
        title: firstText(document, 'title'),
        updated: firstText(document, 'updated'),
        nextHref: feedNextHref(document),
        books: bookEntries.map((entry) => bookFromEntry(baseUrl, entry)),
        navigation: navigationEntries.map((entry) => navigationFromEntry(baseUrl, entry)),
      }
    })
  )
