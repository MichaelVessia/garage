import type { exportSave } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as Request from 'effect/http/HttpClientRequest'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

import { element } from './hud.ts'
import { defaultCallsign, leaderboardSync } from './leaderboardSync.ts'

const row = S.Struct({
  callsign: S.String,
  ascensions: S.Int,
  totalCores: S.Int,
  milestone: S.Int,
  medals: S.Int,
  bestRunTicks: S.NullOr(S.Int),
  verifiedThroughput: S.Int,
  shareId: S.NullOr(S.String),
  isYou: S.Boolean,
})
const rows = S.Array(row)
const board = S.Struct({ foundryRank: rows, fastestM8: rows, throughput: rows, totalPlayers: S.Int })
const posted = S.Struct({ entry: S.Struct({ verifiedThroughput: S.Int }) })
const tabs = ['foundryRank', 'fastestM8', 'throughput'] as const
type Tab = (typeof tabs)[number]
type Profile = { callsign: string; shareFactory: boolean }
const callsignKey = 'beltworks:callsign:v1'
const shareKey = 'beltworks:leaderboard-share:v1'
const path = '/api/leaderboard'
const client = ManagedRuntime.make(FetchHttpClient.layer)
const unavailable = 'Leaderboard is available on the deployed site or Alchemy dev server.'
const labels = {
  foundryRank: ['#', 'Callsign', 'Foundry', 'Medals', 'Factory'],
  fastestM8: ['#', 'Callsign', 'M8 time', 'Ascensions', 'Factory'],
  throughput: ['#', 'Callsign', 'Items/min', 'Milestone', 'Factory'],
}

function readProfile(playerId: string): Profile {
  const fallback = defaultCallsign(playerId)
  let profile = { callsign: fallback, shareFactory: true }
  try {
    const saved = localStorage.getItem(callsignKey)
    profile = { callsign: saved ?? fallback, shareFactory: localStorage.getItem(shareKey) !== 'false' }
    if (saved === null) {
      localStorage.setItem(callsignKey, fallback)
    }
  } catch {
    // Keep the profile in memory when storage is unavailable.
  }
  return profile
}

function cell(tag: 'td' | 'th' | 'small', value: string | number) {
  const node = document.createElement(tag)
  node.textContent = String(value)
  return node
}

function m8Time(ticks: (typeof row.Type)['bestRunTicks']) {
  if (ticks === null) {
    return '—'
  }
  const tenths = Math.floor(ticks / 6)
  return (
    Str.padStart(2, '0')(String(Math.floor(tenths / 600))) +
    ':' +
    Str.padStart(4, '0')(((tenths % 600) / 10).toFixed(1))
  )
}

export function setupLeaderboard({
  state,
  getSave,
  playerId,
  inspect,
}: {
  state: Parameters<typeof leaderboardSync>[0]['state']
  getSave: () => ReturnType<typeof exportSave>
  playerId: string
  inspect: (shareId: string, callsign: string) => Promise<void>
}) {
  const dialog = document.querySelector<HTMLDialogElement>('#leaderboard')
  const name = document.querySelector<HTMLInputElement>('#leaderboard-callsign')
  const share = document.querySelector<HTMLInputElement>('#leaderboard-share')
  const post = document.querySelector<HTMLButtonElement>('#leaderboard-post')
  if (dialog === null || name === null || share === null || post === null) {
    throw new Error('Missing leaderboard controls')
  }
  let profile = readProfile(playerId)
  name.value = profile.callsign
  share.checked = profile.shareFactory
  const status = element('leaderboard-status')
  const empty = element('leaderboard-empty')
  let boardData = Option.none<typeof board.Type>()
  let selected: Tab = 'foundryRank'
  let readVersion = 0
  let profileRevision = 0

  function render() {
    element('leaderboard-columns').replaceChildren(...Arr.map(labels[selected], (label) => cell('th', label)))
    const table = element('leaderboard-rows')
    table.closest('table')?.setAttribute('aria-labelledby', 'board-' + selected)
    table.replaceChildren()
    const data = Option.getOrUndefined(boardData)
    for (const [i, entry] of (data?.[selected] ?? []).entries()) {
      const tr = document.createElement('tr')
      tr.classList.toggle('is-you', entry.isYou)
      const who = cell('td', entry.callsign)
      if (entry.isYou) {
        who.append(cell('small', 'You'))
      }
      tr.append(cell('td', i + 1), who)
      if (selected === 'foundryRank') {
        const stats = cell('td', entry.ascensions + ' asc.')
        stats.append(cell('small', entry.totalCores + ' cores · M' + entry.milestone))
        tr.append(stats, cell('td', entry.medals + '/8'))
      } else if (selected === 'fastestM8') {
        tr.append(cell('td', m8Time(entry.bestRunTicks)), cell('td', entry.ascensions))
      } else {
        const rate = cell('td', entry.verifiedThroughput)
        rate.className = 'verified-rate'
        tr.append(rate, cell('td', 'M' + entry.milestone))
      }
      const action = cell('td', '')
      const id = entry.shareId
      if (id !== null) {
        const inspectButton = document.createElement('button')
        inspectButton.textContent = 'Inspect'
        inspectButton.setAttribute('aria-label', 'Inspect ' + entry.callsign + '’s factory')
        inspectButton.onclick = () => {
          inspectButton.disabled = true
          void inspect(id, entry.callsign)
            .then(
              () => dialog?.close(),
              () => {
                status.textContent = 'Could not load this factory.'
              }
            )
            .finally(() => {
              inspectButton.disabled = false
            })
        }
        action.append(inspectButton)
      }
      tr.append(action)
      table.append(tr)
    }
    if (data !== undefined) {
      empty.textContent = data[selected].length > 0 ? '' : 'No scores on this board yet.'
    }
    for (const tab of tabs) {
      element('board-' + tab).setAttribute('aria-pressed', String(selected === tab))
    }
  }

  function refresh() {
    const version = ++readVersion
    const url = new URL(path, location.origin)
    url.searchParams.set('playerId', playerId)
    return client.runPromise(
      HttpClient.get(url).pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(S.decodeUnknownEffect(board)),
        Effect.timeout(Duration.seconds(10)),
        Effect.match({
          onSuccess: (result) => {
            if (version === readVersion) {
              boardData = Option.some(result)
              element('leaderboard-count').textContent =
                result.totalPlayers + (result.totalPlayers === 1 ? ' player' : ' players')
              render()
            }
          },
          onFailure: () => {
            if (version === readVersion) {
              empty.textContent = unavailable
            }
          },
        })
      )
    )
  }

  const sync = leaderboardSync({
    state: () => {
      const current = state()
      return { ...current, revision: current.revision + profileRevision }
    },
    post: () =>
      client.runPromise(
        Request.post(new URL(path, location.origin)).pipe(
          Request.bodyJsonUnsafe({ playerId, ...profile, save: getSave() }),
          HttpClient.execute,
          Effect.flatMap((response) => response.json),
          Effect.flatMap(S.decodeUnknownEffect(posted)),
          Effect.timeout(Duration.seconds(15)),
          Effect.asVoid
        )
      ),
  })
  for (const tab of tabs) {
    element('board-' + tab).onclick = () => {
      selected = tab
      render()
    }
  }
  element('open-leaderboard').onclick = () => {
    const more = element('more-actions')
    if (more.matches(':popover-open')) {
      more.hidePopover()
    }
    dialog.showModal()
    status.textContent = ''
    empty.textContent = 'Loading scores…'
    render()
    void sync()
      .catch(() => {})
      .then(refresh)
  }
  element('leaderboard-close').onclick = () => dialog.close()
  dialog.onkeydown = (event) => event.stopPropagation()
  dialog.onclick = (event) => {
    if (event.target === dialog) {
      dialog.close()
    }
  }
  element('leaderboard-form').onsubmit = (event) => {
    event.preventDefault()
    const callsign = Str.trim(name.value)
    if (!/^[a-zA-Z0-9 _.-]{1,16}$/u.test(callsign)) {
      status.textContent = 'Use 1 to 16 letters, numbers, spaces, periods, hyphens or underscores.'
      name.focus()
      return
    }
    if (!post.disabled) {
      post.disabled = true
      profile = { callsign, shareFactory: share.checked }
      profileRevision++
      try {
        localStorage.setItem(callsignKey, callsign)
        localStorage.setItem(shareKey, String(profile.shareFactory))
      } catch {
        // Keep the settings for this session when storage is unavailable.
      }
      status.textContent = 'Saving…'
      void sync()
        .then(
          () => {
            status.textContent = 'Settings saved.'
            return refresh()
          },
          () => {
            status.textContent = 'Could not update the leaderboard. Try again.'
          }
        )
        .finally(() => {
          post.disabled = false
        })
    }
  }
  return {
    sync: (periodic = false) => void sync(periodic).catch(() => {}),
  }
}
