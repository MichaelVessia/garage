import {
  AutocaliwebApi,
  BookInfoRecord,
  BookRecord,
  CatalogEntry,
  ListResult,
  SearchResult,
  StatsResult,
  StatusResult,
  bookInfo,
  books,
  catalog,
  defaultLimit,
  recent,
  search,
  shelves,
  stats,
  status,
  version,
} from '@garage/autocaliweb'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as Tool from 'effect/unstable/ai/Tool'
import * as Toolkit from 'effect/unstable/ai/Toolkit'

import { GarageMcpToolError, autocaliwebToolError } from '../errors.js'

const ListLimit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })).annotate({
  description: 'Maximum number of records to return, from 1 through 100',
})

const LimitParameters = Schema.Struct({
  limit: ListLimit.pipe(Schema.withDecodingDefaultKey(Effect.succeed(defaultLimit))),
})

const SearchParameters = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)).annotate({
    description: 'Book title or author search text',
  }),
  limit: ListLimit.pipe(Schema.withDecodingDefaultKey(Effect.succeed(defaultLimit))),
})

const BookInfoParameters = Schema.Struct({
  uuid: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)).annotate({
    description: 'AutoCaliWeb book UUID',
  }),
})

const readToolAnnotations = <
  Name extends string,
  Config extends {
    readonly parameters: Schema.Constraint
    readonly success: Schema.Constraint
    readonly failure: Schema.Constraint
    readonly failureMode: Tool.FailureMode
  },
  Requirements,
>(
  tool: Tool.Tool<Name, Config, Requirements>,
  title: string
): Tool.Tool<Name, Config, Requirements> =>
  tool
    .annotate(Tool.Title, title)
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false)

/** Return the AutoCaliWeb catalog status and aggregate statistics. */
export const AutocaliwebStatusTool = readToolAnnotations(
  Tool.make('autocaliweb_status', {
    description: 'Return AutoCaliWeb catalog metadata and aggregate library statistics.',
    success: StatusResult,
    failure: GarageMcpToolError,
    dependencies: [AutocaliwebApi],
  }),
  'AutoCaliWeb Status'
)

/** Return the AutoCaliWeb status representation used as its version response. */
export const AutocaliwebVersionTool = readToolAnnotations(
  Tool.make('autocaliweb_version', {
    description: 'Return the AutoCaliWeb status representation currently used for version discovery.',
    success: StatusResult,
    failure: GarageMcpToolError,
    dependencies: [AutocaliwebApi],
  }),
  'AutoCaliWeb Version'
)

/** Return AutoCaliWeb library statistics. */
export const AutocaliwebStatsTool = readToolAnnotations(
  Tool.make('autocaliweb_stats', {
    description: 'Return AutoCaliWeb book, author, category, and series counts.',
    success: StatsResult,
    failure: GarageMcpToolError,
    dependencies: [AutocaliwebApi],
  }),
  'AutoCaliWeb Statistics'
)

/** Return top-level AutoCaliWeb catalog navigation entries. */
export const AutocaliwebCatalogTool = readToolAnnotations(
  Tool.make('autocaliweb_catalog', {
    description: 'Return top-level AutoCaliWeb OPDS catalog navigation entries.',
    success: ListResult(CatalogEntry),
    failure: GarageMcpToolError,
    dependencies: [AutocaliwebApi],
  }),
  'AutoCaliWeb Catalog'
)

/** Return a bounded list of books from the AutoCaliWeb catalog. */
export const AutocaliwebBooksTool = readToolAnnotations(
  Tool.make('autocaliweb_books', {
    description: 'Return up to 100 books from the AutoCaliWeb OPDS catalog.',
    parameters: LimitParameters,
    success: ListResult(BookRecord),
    failure: GarageMcpToolError,
    dependencies: [AutocaliwebApi],
  }),
  'AutoCaliWeb Books'
)

/** Return a bounded list of recently updated AutoCaliWeb books. */
export const AutocaliwebRecentTool = readToolAnnotations(
  Tool.make('autocaliweb_recent', {
    description: 'Return up to 100 recently updated books from AutoCaliWeb.',
    parameters: LimitParameters,
    success: ListResult(BookRecord),
    failure: GarageMcpToolError,
    dependencies: [AutocaliwebApi],
  }),
  'AutoCaliWeb Recent Books'
)

/** Search the AutoCaliWeb catalog with a bounded result set. */
export const AutocaliwebSearchTool = readToolAnnotations(
  Tool.make('autocaliweb_search', {
    description: 'Search AutoCaliWeb books by title or author and return up to 100 matches.',
    parameters: SearchParameters,
    success: SearchResult,
    failure: GarageMcpToolError,
    dependencies: [AutocaliwebApi],
  }),
  'Search AutoCaliWeb'
)

/** Return detailed metadata for one AutoCaliWeb book UUID. */
export const AutocaliwebBookInfoTool = readToolAnnotations(
  Tool.make('autocaliweb_book_info', {
    description: 'Return detailed AutoCaliWeb metadata for one book UUID.',
    parameters: BookInfoParameters,
    success: BookInfoRecord,
    failure: GarageMcpToolError,
    dependencies: [AutocaliwebApi],
  }),
  'AutoCaliWeb Book Information'
)

/** Return AutoCaliWeb shelf navigation entries. */
export const AutocaliwebShelvesTool = readToolAnnotations(
  Tool.make('autocaliweb_shelves', {
    description: 'Return AutoCaliWeb OPDS shelf navigation entries.',
    success: ListResult(CatalogEntry),
    failure: GarageMcpToolError,
    dependencies: [AutocaliwebApi],
  }),
  'AutoCaliWeb Shelves'
)

/** Typed collection of the AutoCaliWeb MCP tools. */
export const AutocaliwebToolkit = Toolkit.make(
  AutocaliwebStatusTool,
  AutocaliwebVersionTool,
  AutocaliwebStatsTool,
  AutocaliwebCatalogTool,
  AutocaliwebBooksTool,
  AutocaliwebRecentTool,
  AutocaliwebSearchTool,
  AutocaliwebBookInfoTool,
  AutocaliwebShelvesTool
)

/** Handler layer adapting AutoCaliWeb MCP tools to package domain operations. */
export const AutocaliwebToolkitHandlers = AutocaliwebToolkit.toLayer(
  AutocaliwebToolkit.of({
    autocaliweb_status: () => status.pipe(Effect.mapError(autocaliwebToolError)),
    autocaliweb_version: () => version.pipe(Effect.mapError(autocaliwebToolError)),
    autocaliweb_stats: () => stats.pipe(Effect.mapError(autocaliwebToolError)),
    autocaliweb_catalog: () => catalog.pipe(Effect.mapError(autocaliwebToolError)),
    autocaliweb_books: ({ limit }) => books({ limit }).pipe(Effect.mapError(autocaliwebToolError)),
    autocaliweb_recent: ({ limit }) => recent({ limit }).pipe(Effect.mapError(autocaliwebToolError)),
    autocaliweb_search: ({ query, limit }) => search({ query, limit }).pipe(Effect.mapError(autocaliwebToolError)),
    autocaliweb_book_info: ({ uuid }) => bookInfo({ uuid }).pipe(Effect.mapError(autocaliwebToolError)),
    autocaliweb_shelves: () => shelves.pipe(Effect.mapError(autocaliwebToolError)),
  })
)
