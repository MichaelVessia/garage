import * as HashSet from 'effect/HashSet'
import * as Str from 'effect/String'

const staticSpaNavigationPaths = HashSet.make(
  '/',
  '/login',
  '/stats',
  '/weight',
  '/injection',
  '/schedule',
  '/settings'
)

const scheduleViewPath = /^\/schedule\/[^/]+$/u

export const isSpaNavigationPath = (pathname: string): boolean => {
  const normalizedPath = pathname.length > 1 ? Str.replace(/\/+$/u, '')(pathname) : pathname

  return HashSet.has(staticSpaNavigationPaths, normalizedPath) || scheduleViewPath.test(normalizedPath)
}
