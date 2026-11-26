import { AssetId } from '@garage/logbook-domain/Asset/Asset.id'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

export const screenPaths = { Due: '/', Assets: '/assets', 'Quick Log': '/quick-log' } as const

type Route = { readonly screen: keyof typeof screenPaths; readonly selected: Option.Option<AssetId> }

const assetPrefix = `${screenPaths.Assets}/`

export const assetPath = (assetId: AssetId): string => `${assetPrefix}${encodeURIComponent(assetId)}`

export const isAppPath = (pathname: string): boolean =>
  pathname === screenPaths.Due ||
  pathname === screenPaths.Assets ||
  pathname === screenPaths['Quick Log'] ||
  Str.startsWith(assetPrefix)(pathname)

export const routeFromPath = (pathname: string): Route => {
  if (pathname === screenPaths.Assets) {
    return { screen: 'Assets', selected: Option.none() }
  }
  if (Str.startsWith(assetPrefix)(pathname)) {
    const segment = Str.slice(assetPrefix.length)(pathname)
    if (Str.includes('/')(segment)) {
      return { screen: 'Assets', selected: Option.none() }
    }
    try {
      return { screen: 'Assets', selected: Schema.decodeOption(AssetId)(decodeURIComponent(segment)) }
    } catch {
      return { screen: 'Assets', selected: Option.none() }
    }
  }
  return { screen: pathname === screenPaths['Quick Log'] ? 'Quick Log' : 'Due', selected: Option.none() }
}
