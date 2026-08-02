# AutoCaliWeb

## Purpose

This context provides typed, read-only discovery of an AutoCaliWeb ebook library through OPDS Atom feeds and selected JSON metadata endpoints, exposed by the `autocaliweb` CLI.

## Ubiquitous language

- **Catalog**: the top-level OPDS feed and its navigation entries; qualify this when referring to the whole library.
- **Navigation entry**: an OPDS entry leading to another feed rather than describing a book.
- **Book**: an OPDS entry identified by a `urn:uuid:` identity and its acquisition metadata.
- **Acquisition link**: an OPDS download relation with format/media-type metadata.
- **Book info**: richer JSON metadata for one book UUID.
- **Shelf**: a named OPDS collection exposed for browsing; this context does not manage shelves.

## Responsibilities

- Parse OPDS XML, distinguish books from navigation entries, normalize relative links, and identify acquisition/cover links.
- Follow OPDS pagination for bounded book and recent-book reads.
- Decode catalog statistics, book metadata, shelves, and search results.
- Own Basic-authenticated OPDS/JSON HTTP requests and present read operations through the CLI.

## Non-responsibilities

- It does not add, remove, edit, rate, tag, download, or parse ebook files.
- It does not administer users or shelves.
- It does not validate UUID syntax.
- Search currently reads and slices one feed; it does not promise full pagination or a global match total.

## Important domain objects

`StatusResult`, `StatsResult`, `CatalogEntry`, `BookRecord`, `BookInfoRecord`, `DownloadLink`, `SearchResult`, and parser-internal `OpdsFeed` describe the catalog. Book UUID and the string-normalized acquisition/application ID are distinct identifiers.

## Invariants and compatibility contracts

- Bounded reads default to 50 records.
- Only entries whose IDs begin with `urn:uuid:` decode as books; other entries are navigation.
- Relative feed links resolve against the configured base URL.
- Only OPDS acquisition relations become download links.
- Book/recent reads stop at the requested limit, the last page, or a missing `next` link.
- `version` currently aliases status; changing that is observable CLI behavior.
- All invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/autocaliweb` owns OPDS/JSON anti-corruption, domain values, errors, operations, and HTTP. Live configuration requires `AUTOCALIWEB_URL`, `AUTOCALIWEB_USERNAME`, and redacted `AUTOCALIWEB_PASSWORD`. It depends on Effect, `@garage/cli-protocol`, and `@xmldom/xmldom`. The remote boundary exposes both Atom XML and JSON.

## Package and app relationship

`apps/autocaliweb-cli` is the thin executable: it validates limits, joins multi-word search queries, requires a book UUID where needed, composes Bun HTTP, and delegates domain work to `@garage/autocaliweb`.

## Known ambiguities

- Code says both **AutoCaliWeb** and **Calibre Companion** for metadata; AutoCaliWeb is the owning context, while Calibre-style JSON is an upstream representation.
- **Version** is not currently a distinct version endpoint.
- **Categories** and **tags** currently project the same metadata source.
- Search `total` is the fetched feed size, not a guaranteed server-wide total.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/opds.ts`, `src/http.ts`, and package/app tests.
