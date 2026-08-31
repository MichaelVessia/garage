import { describe, expect, it } from 'vitest'

import { isSpaNavigationPath } from '../src/spa-routes.js'

describe('isSpaNavigationPath', () => {
  it.each([
    '/',
    '/login',
    '/stats',
    '/weight',
    '/injection',
    '/schedule',
    '/schedule/schedule-id',
    '/settings',
    '/stats/',
    '/schedule/schedule-id/',
  ])('allows the SPA route %s', (pathname) => {
    expect(isSpaNavigationPath(pathname)).toBe(true)
  })

  it.each([
    '/.env',
    '/service/.env',
    '/vendor/.env',
    '/wordpress/',
    '/wp-config.php',
    '/unknown',
    '/schedule/schedule-id/extra',
    '/api/v1/config',
  ])('rejects the unknown route %s', (pathname) => {
    expect(isSpaNavigationPath(pathname)).toBe(false)
  })
})
