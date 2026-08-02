// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as Option from 'effect/Option'
import * as Url from 'foldkit/url'

import { SucceededFetchSession } from '../src/auth.js'
import { ChangedUrl, init, update } from '../src/main.js'

const timezone = 'America/New_York'
const user = { email: 'person@example.com', id: 'user-1', name: 'Person' }

const parseUrl = (value: string): Url.Url => Option.getOrThrow(Url.fromString(value))

const fetchStatsArgs = (commands: ReturnType<typeof update>[1]) =>
  commands.find((command) => command.name === 'FetchStats')?.args

describe('application timezone', () => {
  it('stores the supplied timezone during initialization', () => {
    const [model] = init({ timezone }, parseUrl('https://subq.example/stats'))

    expect(model.timezone).toBe(timezone)
  })

  it('threads the initialized timezone through route entry and range changes', () => {
    const [initial] = init({ timezone }, parseUrl('https://subq.example/stats'))
    const [authenticated, entryCommands] = update(initial, SucceededFetchSession({ user }))

    expect(fetchStatsArgs(entryCommands)).toEqual({ end: null, start: null, timezone })

    const [, rangeCommands] = update(
      authenticated,
      ChangedUrl({ url: parseUrl('https://subq.example/stats?start=2026-06-03&end=2026-07-03') })
    )

    expect(fetchStatsArgs(rangeCommands)).toEqual({ end: '2026-07-03', start: '2026-06-03', timezone })
  })
})
