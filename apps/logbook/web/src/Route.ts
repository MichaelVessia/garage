import { Route } from '@effect/ui'
import { AssetId } from '@garage/logbook-domain/Asset/Asset.id'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

export const screenPaths = { Due: '/', Assets: '/assets', 'Quick Log': '/quick-log' } as const

const assetPrefix = `${screenPaths.Assets}/`
const routes = Route.union({
  Due: Route.make(screenPaths.Due),
  Assets: Route.make(screenPaths.Assets),
  Asset: Route.make('/assets/:assetId', { params: { assetId: AssetId } }),
  'Quick Log': Route.make(screenPaths['Quick Log']),
})
type LogbookRoute = typeof routes.Type

export const assetPath = (assetId: AssetId): string => {
  // Browsers normalize a bare dot segment before the app receives the URL.
  const segment = assetId === '.' || assetId === '..' ? `:${assetId}` : encodeURIComponent(assetId)
  return `${assetPrefix}${segment}`
}

const assetFromSegment = (segment: string): Option.Option<AssetId> => {
  if (Str.includes('/')(segment)) {
    return Option.none()
  }
  try {
    return Schema.decodeOption(AssetId)(
      segment === ':.' || segment === ':..' ? Str.slice(1)(segment) : decodeURIComponent(segment)
    )
  } catch {
    return Option.none()
  }
}

const parse = (url: string): Option.Option<LogbookRoute> => {
  const pathname = Str.split(/[?#]/u)(url)[0]
  if (Str.startsWith(assetPrefix)(pathname)) {
    // The raw colon marks a dot ID. A percent-encoded colon belongs to the ID.
    return Option.some(
      assetFromSegment(Str.slice(assetPrefix.length)(pathname)).pipe(
        Option.match({ onNone: routes.Assets, onSome: (assetId) => routes.Asset({ params: { assetId } }) })
      )
    )
  }
  switch (pathname) {
    case screenPaths.Due:
      return Option.some(routes.Due())
    case screenPaths.Assets:
      return Option.some(routes.Assets())
    case screenPaths['Quick Log']:
      return Option.some(routes['Quick Log']())
    default:
      return Option.none()
  }
}

const print = (route: LogbookRoute): string =>
  routes.guards.Asset(route) ? assetPath(route.params.assetId) : screenPaths[route._tag]

export const LogbookRoutes = Object.assign(routes, {
  parse,
  // Unknown links leave the app. A direct visit to an unknown path shows Due.
  resolve: (url: string): Option.Option<Route.Resolved<LogbookRoute>> =>
    Option.some({ route: Option.getOrElse(parse(url), routes.Due), redirected: false, notFound: false, invalid: [] }),
  print,
  printPath: print,
})

export const screenOf = (route: LogbookRoute): keyof typeof screenPaths =>
  routes.guards.Asset(route) ? 'Assets' : route._tag

export const selectedAsset = (route: LogbookRoute) => (routes.guards.Asset(route) ? route.params.assetId : null)
