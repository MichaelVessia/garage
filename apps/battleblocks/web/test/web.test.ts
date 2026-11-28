import { assert, it } from '@effect/vitest'
import { createMatch, DuelCommand, DuelPhase, projectView } from '@garage/battleblocks-domain'
import type { DuelState, Seat, CardValue } from '@garage/battleblocks-domain'
import { DeviceSession, QueueServerMessage } from '@garage/battleblocks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { vi } from 'vitest'

import {
  blockColors,
  resultHeading,
  cardCanStrike,
  values,
  spaceToWorldX,
  computeCameraTarget,
  computeBridgeMarkers,
  buildActionOptions,
  opponentCardProbabilities,
  readRoomCodeFromSearch,
  buildRoomShareUrl,
} from '../src/arenaMath.ts'
import type { MusicIntensity } from '../src/music.ts'
import { computeMusicIntensity, midiToHz, musicStep } from '../src/music.ts'
import {
  buildDeviceLinkUrl,
  createProfileStore,
  readLinkCodeFromSearch,
  formatRatingDelta,
  formatTurnCountdown,
  formatQueuePopulation,
  formatQueueWindow,
  formatStreak,
} from '../src/profile.ts'
import { createDuelSession } from '../src/session.ts'

const base = createMatch(123)
function options(state: Partial<DuelState>, seat: Seat, card?: CardValue) {
  return buildActionOptions(projectView({ ...base, ...state }, Option.some(seat)), Option.fromNullishOr(card))
}
const phase = DuelPhase.cases
it('centers the track and fits both edges on wide and narrow screens', () => {
  assert.equal(spaceToWorldX(1), -spaceToWorldX(18))
  assert.closeTo(spaceToWorldX(10) - spaceToWorldX(9), 1.2, 0.0001)
  const wide = computeCameraTarget([1, 18], 2)
  assert.equal(wide.lookX, 0)
  assert.deepEqual(wide, computeCameraTarget([-20, 50], 2))
  assert.isAbove(computeCameraTarget([1, 18], 0.5).z, wide.z)
  assert.isBelow(computeCameraTarget([8, 10], 2).z, wide.z)
  assert.isFinite(computeCameraTarget([1, 18], 0).z)
})
it('previews only legal moves, pushes and strikes for the selected value', () => {
  const moves = options({ positions: [8, 9], hands: [[1, 1], []] }, 0, 1)
  assert.deepEqual(
    Arr.map(moves, (m) => [m.label, m.tiles]),
    [
      ['← 1', [7]],
      ['⇒ 1', [10]],
      ['★ 1', [9]],
      ['★★ 1+1', [9]],
    ]
  )
  assert.deepEqual(options({ positions: [8, 9], hands: [[1, 1], []] }, 0, 3), [])
})
it('shows both dash tiles and all legal strike strengths', () => {
  const opts = options({ positions: [4, 9], hands: [[2, 3, 3], []] }, 0, 2)
  const dash = Arr.filter(opts, (opt) => DuelCommand.guards.DashingStrike(opt.command))
  assert.deepEqual(
    Arr.map(dash, (opt) => opt.tiles),
    [
      [6, 9],
      [6, 9],
    ]
  )
})
it('shows the defense choices and clamps a retreat to the edge', () => {
  const pending = phase.AwaitDefense.make({ attacker: 0, defender: 1, strikeValue: 2, strikeCount: 1, isDashing: true })
  const opts = options({ positions: [15, 17], phase: pending, hands: [[], [2, 5]] }, 1)
  assert.deepEqual(
    Arr.map(opts, (opt) => [opt.command._tag, opt.tiles]),
    [
      ['Block', [17]],
      ['Retreat', [18]],
      ['Retreat', [18]],
      ['TakeHit', []],
    ]
  )
  assert.deepEqual(
    Arr.map(
      Arr.filter(opts, (opt) => DuelCommand.guards.Retreat(opt.command)),
      (opt) => opt.label
    ),
    ['1 → (card 2)', '1 → (card 5)']
  )
  assert.equal(opts.at(-1)?.label, 'Take the hit and lose the round')
})
it('puts each movement button on its screen side for both players', () => {
  for (const seat of [0, 1] as const) {
    const moves = options(
      {
        positions: [6, 13],
        hands: [
          [5, 2],
          [5, 2],
        ],
        phase: phase.AwaitAction.make({ active: seat }),
      },
      seat,
      5
    )
    assert.equal(moves.at(0)?.label, '← 5')
    assert.equal(moves.at(1)?.label, '5 →')
  }
})
it('shows the result from the point of view of each player or spectator', () => {
  const names = ['Knight', 'Knight'] as const
  for (const scope of ['round', 'match'] as const) {
    for (const winner of [0, 1] as const) {
      const decided = Option.some(winner)
      assert.deepEqual(resultHeading({ scope, viewer: decided, winner: decided, names }), {
        tone: 'victory',
        title: 'You won the ' + scope + '!',
      })
      assert.deepEqual(resultHeading({ scope, viewer: Option.some(winner === 0 ? 1 : 0), winner: decided, names }), {
        tone: 'defeat',
        title: 'You lost the ' + scope,
      })
      assert.equal(
        resultHeading({ scope, viewer: Option.none(), winner: decided, names }).title,
        (winner === 0 ? 'Knight (left)' : 'Knight (right)') + ' won the ' + scope
      )
    }
  }
  assert.deepEqual(resultHeading({ scope: 'round', viewer: Option.some(0), winner: Option.none(), names }), {
    tone: 'tie',
    title: 'Round tied',
  })
})
it('keeps result commands out of the action shortcuts', () => {
  const phases = [
    phase.RoundOver.make({ winner: Option.some(0), reason: 'hit', nextStarter: 1 }),
    phase.MatchOver.make({ winner: 1, finalScore: [1, 3] }),
  ]
  assert.deepEqual(
    Arr.map(phases, (p) => Arr.map(options({ phase: p }, 0), (o) => o.label)),
    [[], []]
  )
})
const oddsView = projectView(
  {
    ...base,
    hands: [
      [1, 1, 1, 2],
      [3, 4, 5, 5, 5],
    ],
    discard: [1, 1, 2],
    deck: [2, 3, 3, 4, 4],
  },
  Option.some(0)
)
it('gives zero odds when all copies are visible', () => {
  assert.deepEqual(opponentCardProbabilities(oddsView)[0], {
    value: 1,
    unseen: 0,
    atLeastOne: 0,
    atLeastTwo: 0,
    pct: 0,
    pctTwo: 0,
  })
})
it('guarantees a copy when the deck cannot contain all unseen copies', () => {
  const odds = opponentCardProbabilities({ ...oddsView, deckCount: 2 })[1]
  assert.equal(odds?.atLeastOne, 1)
  assert.equal(odds?.pct, 100)
})
it('calculates exact odds for one and two copies in a five-card hand', () => {
  assert.deepEqual(opponentCardProbabilities(oddsView)[1], {
    value: 2,
    unseen: 3,
    atLeastOne: 11 / 12,
    atLeastTwo: 0.5,
    pct: 92,
    pctTwo: 50,
  })
})
it('returns zero odds for hidden or empty hands', () => {
  for (const view of [
    { ...oddsView, viewer: Option.none<Seat>() },
    { ...oddsView, opponentHandCount: 0 },
  ]) {
    for (const odds of opponentCardProbabilities(view)) {
      assert.equal(odds.atLeastOne, 0)
      assert.equal(odds.atLeastTwo, 0)
    }
  }
})
it('reads room codes and strips private query parameters from invite links', () => {
  assert.equal(readRoomCodeFromSearch('?room=ab234c'), 'AB234C')
  assert.isUndefined(readRoomCodeFromSearch('?room=A/B'))
  assert.isUndefined(readRoomCodeFromSearch(''))
  assert.equal(
    buildRoomShareUrl('https://arena.test/play?token=private#secret', 'ab234c'),
    'https://arena.test/play?room=AB234C'
  )
})

it('marks every space with relative steps and absolute track landmarks', () => {
  const markers = computeBridgeMarkers(projectView({ ...base, positions: [4, 9] }, Option.some(0)))
  assert.deepEqual(
    Arr.map(markers, (m) => [m.nearLabel, m.nearTone]),
    [
      ['-3', 'backward'],
      ['-2', 'backward'],
      ['-1', 'backward'],
      ['0', 'self'],
      ['1', 'forward'],
      ['2', 'forward'],
      ['3', 'forward'],
      ['4', 'forward'],
      ['5', 'opponent-strike'],
      ...Arr.map(Arr.range(10, 18), () => ['', 'hidden']),
    ]
  )
  assert.deepEqual(
    Arr.map(markers, (m) => [m.space, m.farLabel, m.farTone]),
    Arr.map(Arr.range(1, 18), (space) => [
      space,
      String(space),
      [1, 18].includes(space) ? 'edge' : [9, 10].includes(space) ? 'center' : 'muted',
    ])
  )
})
it('counts leftward for seat two and hides steps beyond five', () => {
  const markers = computeBridgeMarkers(projectView({ ...base, positions: [4, 11] }, Option.some(1)))
  assert.deepEqual(
    Arr.map(markers, (m) => m.nearLabel),
    ['', '', '', '7', '', '5', '4', '3', '2', '1', '0', '-1', '-2', '-3', '-4', '-5', '', '']
  )
  assert.equal(markers[3]?.nearTone, 'opponent-dash')
})
it('distinguishes dash range from longer distances', () => {
  for (const [distance, tone] of [
    [6, 'opponent-dash'],
    [10, 'opponent-dash'],
    [11, 'opponent-far'],
    [14, 'opponent-far'],
  ] satisfies Array<[number, string]>) {
    const markers = computeBridgeMarkers(projectView({ ...base, positions: [1, 1 + distance] }, Option.some(0)))
    assert.equal(markers[distance]?.nearTone, tone)
    assert.equal(markers[distance]?.nearLabel, String(distance))
  }
})
function spectatorOrigin(duelPhase: DuelPhase) {
  const markers = computeBridgeMarkers(projectView({ ...base, positions: [4, 9], phase: duelPhase }, Option.none()))
  return Option.getOrUndefined(Arr.findFirst(markers, (marker) => marker.nearTone === 'self'))?.space
}
it('anchors spectators on the active seat, defender, or first seat after a round', () => {
  assert.equal(spectatorOrigin(phase.AwaitAction.make({ active: 1 })), 9)
  assert.equal(
    spectatorOrigin(
      phase.AwaitDefense.make({ attacker: 0, defender: 1, strikeValue: 5, strikeCount: 1, isDashing: false })
    ),
    9
  )
  assert.equal(spectatorOrigin(phase.RoundOver.make({ winner: Option.some(1), reason: 'hit', nextStarter: 1 })), 4)
})

it('sets music by session, phase and strike range', () => {
  const view = projectView(base, Option.none())
  assert.equal(computeMusicIntensity(view, false), 'calm')
  assert.equal(computeMusicIntensity({ ...view, positions: [5, 11] }, true), 'duel')
  assert.equal(computeMusicIntensity({ ...view, positions: [5, 10] }, true), 'clash')
  const defense = phase.AwaitDefense.make({
    attacker: 0,
    defender: 1,
    strikeValue: 3,
    strikeCount: 1,
    isDashing: false,
  })
  assert.equal(computeMusicIntensity({ ...view, phase: defense }, true), 'clash')
  for (const ended of [
    phase.RoundOver.make({ winner: Option.none(), reason: 'hit', nextStarter: 0 }),
    phase.MatchOver.make({ winner: 1, finalScore: [2, 3] }),
  ]) {
    assert.equal(computeMusicIntensity({ ...view, positions: [7, 8], phase: ended }, true), 'calm')
  }
})
const layers = (intensity: MusicIntensity) =>
  Arr.flatMap(Arr.range(0, 63), (step) => {
    const notes = musicStep(step, intensity)
    assert.deepEqual(notes, musicStep(step + 64, intensity))
    assert.deepEqual(notes, musicStep(step - 64, intensity))
    return Arr.getSomes([notes.bass, notes.arp, notes.lead])
  })
it('loops four bars and adds layers as the duel intensifies', () => {
  assert.equal(midiToHz(69), 440)
  const calm = layers('calm')
  const duel = layers('duel')
  const clash = layers('clash')
  assert.isAbove(calm.length, 0)
  assert.isAbove(duel.length, calm.length)
  assert.isAbove(clash.length, duel.length)
  for (const note of clash) {
    assert.include([0, 2, 4, 7, 9], note % 12)
    assert.isFinite(midiToHz(note))
    assert.isAbove(midiToHz(note), 0)
  }
})

it('uses the five block colors for cards and relative badges', () => {
  assert.deepEqual(
    Arr.map(values, (v) => blockColors[v].css),
    ['#dc2626', '#ea580c', '#facc15', '#16a34a', '#0284c7']
  )
  for (const v of values) {
    assert.equal(blockColors[v].hex, Number.parseInt(Str.slice(1)(blockColors[v].css), 16))
    const markers = computeBridgeMarkers(projectView({ ...base, positions: [6, 6 + v] }, Option.some(0)))
    assert.deepEqual(markers[5 + v]?.nearValue, Option.some(v))
    assert.deepEqual(markers[5 - v]?.nearValue, Option.some(v))
  }
})
it('marks only legal direct strikes in the hand', () => {
  const state: DuelState = { ...base, positions: [6, 10], hands: [[2, 2, 4], []] }
  const view = projectView(state, Option.some(0))
  assert.isTrue(cardCanStrike(view, 4))
  assert.isFalse(cardCanStrike(view, 2))
  assert.isFalse(cardCanStrike(projectView(state, Option.some(1)), 4))
})
for (const seat of [0, 1] satisfies Array<Seat>) {
  it('counts screen spaces for seat ' + seat, () => {
    const other = seat === 0 ? 1 : 0
    const state: DuelState = {
      ...base,
      positions: [6, 10],
      phase: phase.AwaitAction.make({ active: seat }),
      hands: [
        [2, 2, 4],
        [2, 2, 4],
      ],
    }
    const origin = state.positions[seat]
    const sign = seat === 0 ? 1 : -1
    const arrow = seat === 0 ? '→' : '←'
    const preview = (card: CardValue, label: string, snapshot = state) =>
      Option.getOrUndefined(Arr.findFirst(options(snapshot, seat, card), (o) => o.label === label))?.hops
    assert.deepEqual(preview(2, seat === 0 ? '2 →' : '← 2'), [origin + sign, origin + 2 * sign])
    assert.deepEqual(preview(2, seat === 0 ? '← 2' : '2 →'), [origin - sign, origin - 2 * sign])
    const all = [origin + sign, origin + 2 * sign, origin + 3 * sign, origin + 4 * sign]
    assert.deepEqual(preview(4, '★ 4'), all)
    assert.deepEqual(preview(2, arrow + '2 + ★2'), all)
    const defense = phase.AwaitDefense.make({
      attacker: other,
      defender: seat,
      strikeValue: 4,
      strikeCount: 1,
      isDashing: true,
    })
    assert.deepEqual(preview(2, seat === 0 ? '← 2' : '2 →', { ...state, phase: defense }), [
      origin - sign,
      origin - 2 * sign,
    ])
  })
}

it('accepts only complete device link codes', () => {
  assert.equal(readLinkCodeFromSearch('?link=%20a1bc23%20'), 'A1BC23')
  for (const invalid of ['', '?link=abc', '?link=abcd_q', '?room=ABC123']) {
    assert.isUndefined(readLinkCodeFromSearch(invalid))
  }
})
it('removes unrelated parameters and fragments from a device link', () => {
  assert.equal(
    buildDeviceLinkUrl('https://arena.test/game?room=ABC123&token=test#private', 'ab12cd'),
    'https://arena.test/game?link=AB12CD'
  )
})
it('shows signed Elo changes', () => {
  assert.equal(formatRatingDelta({ before: 1000, after: 1016, delta: 16 }), '1000 → 1016 (+16 Elo)')
  assert.equal(formatRatingDelta({ before: 1000, after: 984, delta: -16 }), '1000 → 984 (-16 Elo)')
})
it('rounds remaining turn time up and stops at zero', () => {
  assert.equal(formatTurnCountdown(2001, 1000), '2s')
  assert.equal(formatTurnCountdown(500, 1000), '0s')
  assert.equal(formatTurnCountdown(null, 0), '')
  assert.equal(formatTurnCountdown(undefined, 0), '')
})
it('counts only other players in the ranked queue', () => {
  assert.equal(formatQueuePopulation(1), 'No other players in the ranked queue.')
  assert.equal(formatQueuePopulation(2), '1 other player in the ranked queue.')
  assert.equal(formatQueuePopulation(4), '3 other players in the ranked queue.')
})
it('labels limited and unlimited search windows', () => {
  assert.equal(formatQueueWindow(null), 'Any Elo')
  assert.equal(formatQueueWindow(150), '±150 Elo')
})
it('shows streaks of two games or more', () => {
  assert.deepEqual(Arr.map([-3, -1, 0, 1, 2], formatStreak), ['3L', '—', '—', '—', '2W'])
})

const savedProfile = {
  playerId: 'guest',
  callsign: 'Ember',
  wins: 3,
  losses: 2,
  streak: 2,
  peakRating: 1032,
  rating: 1016,
}
const savedSession = { token: 'existing', profile: savedProfile }
it('removes a used link and keeps the saved profile after authentication', () => {
  const replaceState = vi.fn()
  const windowFetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 410 }))
    .mockResolvedValueOnce(Response.json({ profile: savedProfile }))
  vi.stubGlobal('location', new URL('https://arena.test/?link=AB12CD&room=ROOM12'))
  vi.stubGlobal('history', { replaceState })
  vi.stubGlobal('window', { fetch: windowFetch })
  vi.stubGlobal('localStorage', {
    getItem: () => Option.getOrThrow(S.encodeOption(S.fromJsonString(DeviceSession))(savedSession)),
    setItem: vi.fn(),
  })
  const profiles = createProfileStore()
  return profiles
    .init()
    .then((result) => {
      assert.equal(replaceState.mock.calls[0]?.[2].href, 'https://arena.test/?room=ROOM12')
      assert.equal(windowFetch.mock.calls[0]?.[0], '/api/profile/claim')
      assert.equal(new Headers(windowFetch.mock.calls[1]?.[1].headers).get('Authorization'), 'Bearer existing')
      assert.equal(result.notice, 'Device link code expired or already used.')
      assert.deepEqual(profiles.current(), Option.some(savedSession))
    })
    .finally(() => vi.unstubAllGlobals())
})
it('replaces a rejected session with a registered guest', () => {
  const windowFetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ ...savedSession, token: 'fresh' }))
  const setItem = vi.fn()
  vi.stubGlobal('location', new URL('https://arena.test/'))
  vi.stubGlobal('window', { fetch: windowFetch })
  vi.stubGlobal('localStorage', {
    getItem: () => Option.getOrThrow(S.encodeOption(S.fromJsonString(DeviceSession))(savedSession)),
    setItem,
  })
  const profiles = createProfileStore()
  return profiles
    .init()
    .then(() => {
      assert.equal(windowFetch.mock.calls[1]?.[0], '/api/profile/register')
      assert.equal(windowFetch.mock.calls[1]?.[1].body, '{}')
      assert.equal(Option.getOrUndefined(profiles.current())?.token, 'fresh')
      assert.equal(setItem.mock.calls[0]?.[0], 'battleblocks.session.v1')
    })
    .finally(() => vi.unstubAllGlobals())
})
it('cancels a queue and connects a matched player with the room token', () => {
  const sockets: Array<TestSocket> = []
  class TestSocket {
    static OPEN = 1
    readyState = TestSocket.OPEN
    onmessage?: (event: { data: string }) => void
    close = vi.fn()
    send = vi.fn()
    url: URL
    constructor(url: URL) {
      this.url = url
      sockets.push(this)
    }
  }
  const setItem = vi.fn()
  vi.stubGlobal('location', new URL('https://arena.test/'))
  vi.stubGlobal('history', { replaceState: vi.fn() })
  vi.stubGlobal('localStorage', { setItem })
  vi.stubGlobal('WebSocket', TestSocket)
  try {
    const session = createDuelSession({ show: vi.fn(), notice: vi.fn(), autoRound: () => false })
    const callbacks = { sessionToken: 'device/?', onMatched: vi.fn(), onQueueUpdate: vi.fn(), onQueueClosed: vi.fn() }
    session.quickMatch(callbacks)
    session.cancelQueue()
    assert.equal(sockets[0]?.send.mock.calls[0]?.[0], '{"_tag":"Cancel"}')
    session.quickMatch(callbacks)
    const msg = Option.getOrThrow(
      S.encodeOption(S.fromJsonString(QueueServerMessage))(
        QueueServerMessage.cases.Matched.make({
          roomId: 'ROOM12',
          seat: 0,
          token: 'seat-token',
          opponentName: 'Blue',
          opponentRating: 1000,
        })
      )
    )
    sockets[0]?.onmessage?.({ data: msg })
    assert.lengthOf(sockets, 2)
    assert.equal(sockets[1]?.url.searchParams.get('session'), 'device/?')
    sockets[1]?.onmessage?.({ data: msg })
    assert.equal(callbacks.onMatched.mock.calls.length, 1)
    assert.equal(sockets[2]?.url.href, 'wss://arena.test/api/rooms/ROOM12/ws?token=seat-token')
    assert.deepEqual(setItem.mock.calls, [['battleblocks.seat.ROOM12', 'seat-token']])
  } finally {
    vi.unstubAllGlobals()
  }
})
