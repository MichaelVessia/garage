// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "enableJavaScriptEvaluation": true } }
import { afterEach, beforeEach, describe, expect, it, vi } from '@effect/vitest'

import indexHtml from '../index.html?raw'

// The inline boot watchdog in index.html, run against a page where the app did or did not mount.
const watchdog = /<script>(?<body>[\s\S]*?)<\/script>/u.exec(indexHtml)?.groups?.body ?? ''

const runWatchdog = () => {
  const script = document.createElement('script')
  script.textContent = watchdog
  document.head.append(script)
  vi.advanceTimersByTime(15_000)
}

describe('boot watchdog', () => {
  const reloads = { count: 0 }
  beforeEach(() => {
    reloads.count = 0
    vi.useFakeTimers()
    vi.spyOn(globalThis.location, 'reload').mockImplementation(() => {
      reloads.count += 1
    })
    document.body.innerHTML = '<div id="root"></div>'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps a mounted app, which replaces #root', () => {
    document.querySelector('#root')?.replaceWith(document.createElement('main'))
    runWatchdog()
    expect(watchdog).not.toBe('')
    expect(reloads.count).toBe(0)
  })

  it('reloads when the app never mounted', () => {
    runWatchdog()
    expect(reloads.count).toBe(1)
  })
})
