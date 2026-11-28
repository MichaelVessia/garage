import { DuelCommand, DuelPhase, DuelEvent, createMatch, projectView } from '@garage/battleblocks-domain'
import type { CardValue, PlayerView, Seat, LeaderboardEntry } from '@garage/battleblocks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'
import { Application } from 'pixi.js'

import { mountArena } from './arena3d.ts'
import {
  blockColors,
  cardCanStrike,
  buildActionOptions,
  buildRoomShareUrl,
  readRoomCodeFromSearch,
  opponentCardProbabilities,
  resultHeading,
  resultStars,
  turnSeat,
  values,
} from './arenaMath.ts'
import { createAudio } from './audio.ts'
import { computeMusicIntensity } from './music.ts'
import {
  createProfileStore,
  formatRatingDelta,
  formatTurnCountdown,
  formatQueuePopulation,
  formatQueueWindow,
  formatStreak,
  buildDeviceLinkUrl,
} from './profile.ts'
import type { Snapshot } from './session.ts'
import { createDuelSession } from './session.ts'

function element(id: string) {
  const node = document.getElementById(id)
  if (node === null) {
    throw new Error('Missing element ' + id)
  }
  return node
}
function dialog(id: string) {
  const node = Arr.findFirst(Array.from(document.getElementsByTagName('dialog')), (el) => el.id === id)
  if (Option.isSome(node)) {
    return node.value
  }
  throw new Error('Expected dialog ' + id)
}
function input(id: string) {
  const node = Arr.findFirst(Array.from(document.getElementsByTagName('input')), (el) => el.id === id)
  if (Option.isSome(node)) {
    return node.value
  }
  throw new Error('Expected input ' + id)
}
function button(label: string, click: () => void) {
  const node = document.createElement('button')
  node.textContent = label
  node.onclick = click
  return node
}
const arenaMenu = element('arena-menu')
const compactMenu = window.matchMedia('(max-width: 650px)')
function sizeMenu() {
  arenaMenu.toggleAttribute('open', compactMenu.matches === false)
}
sizeMenu()
compactMenu.addEventListener('change', sizeMenu)
for (const control of arenaMenu.querySelectorAll('button')) {
  control.addEventListener('click', () => {
    if (compactMenu.matches) {
      arenaMenu.removeAttribute('open')
    }
  })
}
const lobby = dialog('lobby')
const profileDialog = dialog('profile-dialog')
const rules = dialog('rules')
const ranks = dialog('leaderboard')
const searching = dialog('searching')
const profiles = createProfileStore()
const hand = element('hand')
const actions = element('actions')
const audio = createAudio()
window.addEventListener('pointerdown', audio.unlock, { once: true })
window.addEventListener('keydown', audio.unlock, { once: true })
window.addEventListener('click', audio.unlock, { capture: true })
type HudState = {
  snapshot?: Snapshot
  names: readonly [string, string]
  view: PlayerView
  selection: Option.Option<CardValue>
  arena?: ReturnType<typeof mountArena>
}
const state: HudState = {
  names: ['Red', 'Blue'],
  selection: Option.none(),
  view: projectView(createMatch(1), Option.none()),
}
function notice(message: string) {
  element('notice').textContent = message
  element('lobby-message').textContent = message
}
function select(value: CardValue) {
  if (state.view.myHand.includes(value)) {
    audio.playSelect(value)
    state.selection = Option.contains(state.selection, value) ? Option.none() : Option.some(value)
    drawHand()
  }
}
function drawHand() {
  const { view, selection } = state
  hand.replaceChildren(
    ...Arr.map(view.myHand, (card) => {
      const node = button(String(card), () => select(card))
      const ready = cardCanStrike(view, card)
      node.setAttribute('aria-label', 'Select card ' + card + (ready ? ', ready to strike' : ''))
      node.dataset.ready = String(ready)
      node.style.setProperty('--card', blockColors[card].css)
      node.style.setProperty('--card-ink', blockColors[card].text)
      const steps = document.createElement('span')
      steps.className = 'steps'
      steps.setAttribute('aria-hidden', 'true')
      steps.append(
        ...Arr.map(values, (step) => {
          const pip = document.createElement('i')
          if (step <= card) {
            pip.className = 'on'
          }
          return pip
        })
      )
      node.append(steps)
      node.setAttribute('aria-pressed', String(Option.contains(selection, card)))
      return node
    })
  )
  const options = buildActionOptions(view, selection)
  const defaultPreview = Option.isSome(selection)
    ? Arr.findFirst(options, (opt) => opt.hops.length > 0 && Option.contains(opt.accent, selection.value))
    : Option.none()
  state.arena?.preview(defaultPreview)
  const retreatCards = element('retreat-cards')
  retreatCards.replaceChildren()
  actions.replaceChildren()
  for (const opt of options) {
    const node = button(opt.label, () => session.send(opt.command))
    node.setAttribute('aria-label', opt.ariaLabel)
    node.title = opt.ariaLabel
    if (DuelCommand.guards.Move(opt.command)) {
      node.dataset.move = (opt.tiles[0] ?? opt.origin) < opt.origin ? 'left' : 'right'
    }
    if (Option.isSome(opt.accent)) {
      node.style.setProperty('--card', blockColors[opt.accent.value].css)
      node.style.setProperty('--card-ink', blockColors[opt.accent.value].text)
    }
    node.onpointerenter = node.onfocus = () => state.arena?.preview(Option.some(opt))
    node.onpointerleave = node.onblur = () => state.arena?.preview(defaultPreview)
    if (DuelCommand.guards.Retreat(opt.command)) {
      retreatCards.append(node)
    } else {
      actions.append(node)
    }
  }
  element('retreats').hidden = retreatCards.childElementCount === 0
  if (options.length === 0) {
    const seat = Option.getOrUndefined(turnSeat(view.phase))
    actions.textContent =
      seat === undefined
        ? 'Complete'
        : Option.contains(view.viewer, seat)
          ? view.legalCommands.length === 0
            ? 'Waiting for opponent…'
            : 'Select a card.'
          : 'Waiting for ' + state.names[seat] + '…'
  }
}
function eventText(event: DuelEvent, names: readonly [string, string]) {
  return DuelEvent.match(event, {
    Moved: (e) => names[e.seat] + ' moved to ' + e.to,
    Pushed: (e) => names[e.opponent] + ' pushed to ' + e.to,
    Dashed: (e) => names[e.seat] + ' dashed to ' + e.to,
    Retreated: (e) => names[e.seat] + ' retreated to ' + e.to,
    Struck: (e) => names[e.attacker] + ' struck with ' + e.strikeCount + ' × ' + e.strikeValue,
    Blocked: (e) => names[e.defender] + ' blocked',
    HitLanded: (e) => names[e.attacker] + ' landed a hit',
    Recovered: (e) => names[e.seat] + ' recovered',
    RoundStarted: (e) => 'Round ' + e.round + ' started',
    RoundEnded: () => 'Round ended',
    MatchEnded: (e) => names[e.winner] + ' won the match',
    DeckReshuffled: () => 'Deck reshuffled',
  })
}
const launch = { pending: true, active: false }
function updateMusic() {
  audio.setIntensity(computeMusicIntensity(state.view, launch.active && lobby.open === false))
}
function showResult() {
  const { view, names } = state
  const phase = view.phase
  const result = element('result')
  result.hidden = searching.open || lobby.open || Option.isSome(turnSeat(phase))
  if (result.hidden) {
    return
  }
  element('result-stars').textContent = resultStars(view)
  const next = element('continue')
  const matchOver = DuelPhase.guards.MatchOver(phase)
  const rankedEnd = matchOver && state.snapshot?.ranked === true
  element('result-rematch').hidden =
    rankedEnd === false || Arr.some(view.legalCommands, DuelCommand.guards.Rematch) === false
  element('result-ranks').hidden = rankedEnd === false
  delete element('result-detail').dataset.delta
  result.dataset.kind = matchOver ? 'match' : 'round'
  if (DuelPhase.guards.RoundOver(phase)) {
    const reasons = {
      hit: 'Clean hit',
      'time-over-position': 'Time over · track lead',
      'time-over-draw': 'Time over · equal distance',
    }
    const heading = resultHeading({ scope: 'round', viewer: view.viewer, winner: phase.winner, names })
    result.dataset.tone = heading.tone
    element('result-eyebrow').textContent = 'Round ' + view.round + ' complete'
    element('result-title').textContent = heading.title
    element('result-detail').textContent =
      reasons[phase.reason] + ' · Score: ' + view.score[0] + ' – ' + view.score[1] + ' · First to 3'
    next.textContent = 'Next Round →'
    next.hidden = Arr.some(view.legalCommands, DuelCommand.guards.StartNextRound) === false
    next.onclick = () => session.send(DuelCommand.cases.StartNextRound.make({}))
  } else if (matchOver) {
    const heading = resultHeading({ scope: 'match', viewer: view.viewer, winner: Option.some(phase.winner), names })
    result.dataset.tone = heading.tone
    element('result-eyebrow').textContent = 'Set complete · Best of 5'
    element('result-title').textContent = heading.title
    element('result-detail').textContent =
      'Final score · ' + names[0] + ' ' + phase.finalScore[0] + ' – ' + phase.finalScore[1] + ' ' + names[1]
    if (rankedEnd) {
      const reason = state.snapshot?.forfeitReason
      element('result-eyebrow').textContent =
        'Ranked Match · Best of 5' +
        (reason === undefined ? '' : reason === 'timeout' ? ' · Timeout forfeit' : ' · Disconnect forfeit')
      if (Option.isSome(view.viewer)) {
        const delta = state.snapshot?.ratingDeltas?.[view.viewer.value]
        element('result-detail').textContent +=
          ' · ' + (delta === undefined ? 'Updating Elo…' : formatRatingDelta(delta))
        if (delta !== undefined) {
          element('result-detail').dataset.delta = delta.delta >= 0 ? 'up' : 'down'
        }
      }
      next.hidden = false
      next.textContent = 'Next Ranked Match'
      next.onclick = startQueue
      return
    }
    next.textContent = 'Play Again!'
    next.hidden = Arr.some(view.legalCommands, DuelCommand.guards.Rematch) === false
    next.onclick = () => session.send(DuelCommand.cases.Rematch.make({}))
  }
}
lobby.addEventListener('close', () => {
  updateMusic()
  showResult()
})
const session = createDuelSession({
  show: (snapshot) => {
    const { view, names, mode, events } = snapshot
    element('battle-start').hidden = true
    element('battle-hand').hidden = false
    element('round-status').hidden = false
    state.snapshot = snapshot
    setClock(snapshot.ranked && Option.isSome(turnSeat(view.phase)) ? snapshot.turnDeadlineMs : undefined)
    if (events) {
      state.selection = Option.none()
    }
    state.view = view
    state.names = names
    element('mode').textContent = mode
    for (const [i, id] of ['ember', 'frost'].entries()) {
      const wins = view.score[i] ?? 0
      const node = element(id)
      const side = i === 0 ? 'Left' : 'Right'
      const own = Option.isSome(view.viewer) && view.viewer.value === i
      const label = own ? 'You · ' + side : side
      const rating = snapshot.seatRatings?.[i]
      element(id + '-label').textContent = label
      element(id + '-wins').textContent = Arr.join(
        Arr.map([1, 2, 3], (star) => (star <= wins ? '★' : '☆')),
        ''
      )
      element(id + '-wins').setAttribute('aria-label', wins + ' rounds won')
      element(id + '-position').textContent =
        'Space ' + view.positions[i] + (typeof rating === 'number' ? ' · ' + rating + ' Elo' : '')
      node.title = names[i] ?? label
    }
    element('round').textContent = 'Round ' + view.round
    const seat = Option.getOrUndefined(turnSeat(view.phase))
    const yours = seat !== undefined && Option.contains(view.viewer, seat)
    const urgency =
      seat === undefined
        ? 'ended'
        : yours
          ? DuelPhase.guards.AwaitDefense(view.phase)
            ? 'defend'
            : 'yours'
          : 'opponent'
    element('dock').dataset.turn = urgency
    const phase = element('phase')
    phase.dataset.urgency = urgency
    const distance = Math.abs(view.positions[1] - view.positions[0])
    const color = Option.getOrUndefined(Arr.findFirst(values, (v) => v === distance))
    element('range').style.color = color === undefined ? '' : blockColors[color].css
    const waiting = (s: Seat) =>
      Option.isNone(view.viewer) ? names[s] + '’s turn' : mode === 'Bot practice' ? 'Bot’s turn' : 'Opponent’s turn'
    phase.textContent = DuelPhase.match(view.phase, {
      AwaitAction: (p) => (yours ? 'Your turn' : waiting(p.active)),
      AwaitDefense: (p) =>
        yours
          ? (p.isDashing ? 'Dash strike' : 'Strike') +
            ' · ' +
            p.strikeValue +
            (p.strikeCount > 1 ? '×' + p.strikeCount : '')
          : waiting(p.defender),
      RoundOver: () => 'Round complete',
      MatchOver: () => 'Set complete',
    })
    element('range').textContent = distance + (distance === 1 ? ' space apart' : ' spaces apart')
    element('deck').textContent = view.deckCount + ' in deck · ' + view.reshufflesRemaining + ' reshuffles'
    element('odds').hidden = Option.isNone(view.viewer)
    element('counts').replaceChildren(
      ...Arr.map(opponentCardProbabilities(view), ({ value, pct, pctTwo, unseen }) => {
        const node = document.createElement('span')
        const card = document.createElement('b')
        card.textContent = String(value)
        node.append(card, ' ' + pct + '%')
        node.style.setProperty('--card-ink', blockColors[value].text)
        node.style.setProperty('--card', blockColors[value].css)
        node.dataset.distance = String(value === distance)
        node.title = 'Opponent holds 1+: ' + pct + '% · 2+: ' + pctTwo + '% (' + unseen + ' unseen)'
        return node
      })
    )
    element('events').textContent = Arr.join(
      Arr.map(view.lastEvents, (e) => eventText(e, names)),
      ' · '
    )
    if (events) {
      for (const e of view.lastEvents) {
        audio.play(e, view.viewer)
      }
    }
    state.arena?.update(view, events)
    drawHand()
    if (launch.pending) {
      lobby.close()
      launch.pending = false
    }
    showResult()
    launch.active = true
    updateMusic()
    element('copy').hidden = readRoomCodeFromSearch(location.search) === undefined
  },
  notice,
  onRankedFinished: () => {
    void profiles.refresh().then(renderProfile)
  },
  autoRound: () => input('auto').checked,
})
let initialRoom = true
element('start-practice').onclick = element('practice').onclick = () => {
  initialRoom = false
  launch.pending = true
  notice('')
  session.practice()
}
element('create').onclick = () => {
  initialRoom = false
  launch.pending = true
  void session.online(undefined, callsign())
}
element('join').onsubmit = (event) => {
  event.preventDefault()
  const code = readRoomCodeFromSearch(new URLSearchParams({ room: input('code').value }).toString())
  if (code !== undefined) {
    initialRoom = false
    launch.pending = true
    void session.online(code, callsign())
  }
}
element('copy').onclick = () => {
  const code = readRoomCodeFromSearch(location.search)
  if (code === undefined) {
    return
  }
  const link = buildRoomShareUrl(location.href, code)
  if (navigator.clipboard === undefined) {
    notice(link)
    return
  }
  void navigator.clipboard.writeText(link).then(
    () => notice('Invite link copied.'),
    () => notice(link)
  )
}
function openLobby() {
  lobby.showModal()
  showResult()
  updateMusic()
}
element('modes').onclick = element('result-lobby').onclick = openLobby
element('help').onclick = () => rules.showModal()
function audioButton(id: string, label: string, enabled: boolean, toggle: () => boolean) {
  const node = element(id)
  function render(on: boolean) {
    node.textContent = label + (on ? ' on' : ' off')
    node.setAttribute('aria-pressed', String(on))
  }
  render(enabled)
  node.onclick = () => render(toggle())
}
audioButton('sound', 'SFX', audio.sfxEnabled(), () => audio.toggleSfx())
audioButton('music', 'Music', audio.musicEnabled(), () => audio.toggleMusic())
window.addEventListener('keydown', (event) => {
  if (
    document.querySelector('dialog[open]') !== null ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.repeat
  ) {
    return
  }
  if (DuelPhase.guards.MatchOver(state.view.phase)) {
    if (event.key === 'Enter') {
      event.preventDefault()
    }
    return
  }
  const card = Arr.findFirst(values, (v) => String(v) === event.key)
  if (Option.isSome(card)) {
    select(card.value)
  }
  if (event.key === 'Escape') {
    state.selection = Option.none()
    drawHand()
  }
  if (event.key === 'Enter') {
    const options = buildActionOptions(state.view, state.selection)
    const only = options[0]
    if (
      options.length === 1 &&
      only !== undefined &&
      (Option.isSome(state.selection) || state.view.legalCommands.length === 1)
    ) {
      event.preventDefault()
      session.send(only.command)
    }
  }
})
let clockTimer = 0
function setClock(deadline: Snapshot['turnDeadlineMs']) {
  clearInterval(clockTimer)
  const node = element('clock')
  node.hidden = typeof deadline !== 'number'
  if (typeof deadline !== 'number') {
    node.textContent = ''
    return
  }
  const end = deadline
  function tick() {
    const now = performance.timeOrigin + performance.now()
    node.textContent = formatTurnCountdown(deadline, now)
    node.dataset.urgent = String(end - now <= 10_000)
  }
  tick()
  clockTimer = window.setInterval(tick, 250)
}
function callsign() {
  return Option.getOrUndefined(profiles.current())?.profile.callsign
}
function profileStatus(text: string) {
  element('profile-status').textContent = text
}
function renderProfile() {
  const session = Option.getOrUndefined(profiles.current())
  if (session === undefined) {
    return
  }
  element('start-ranked').removeAttribute('disabled')
  const p = session.profile
  element('lobby-player').textContent = p.callsign + ' · ' + p.rating + ' Elo'
  element('profile-name').textContent = p.callsign
  input('callsign').value = p.callsign
  element('profile-record').textContent =
    p.rating + ' Elo · ' + p.wins + 'W – ' + p.losses + 'L · Streak ' + formatStreak(p.streak)
}
element('profile-btn').onclick = element('lobby-profile-btn').onclick = () => {
  renderProfile()
  profileStatus('')
  profileDialog.showModal()
}
element('profile-form').onsubmit = (event) => {
  event.preventDefault()
  void ready
    .then(() => profiles.updateCallsign(input('callsign').value))
    .then((result) => {
      if (result.ok) {
        renderProfile()
      }
      profileStatus(result.ok ? 'Callsign saved.' : result.message)
    })
}
element('create-link').onclick = () => {
  void ready
    .then(() => profiles.createDeviceLink())
    .then((result) => {
      if (result.ok === false) {
        profileStatus(result.message)
        return
      }
      const { code, expiresAtMs } = result.link
      element('link-output').hidden = false
      element('link-code').textContent = code
      element('link-expiry').textContent =
        'Expires at ' + new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(expiresAtMs)
      const url = buildDeviceLinkUrl(location.href, code)
      element('copy-link').onclick = () => {
        if (navigator.clipboard === undefined) {
          profileStatus(url)
          return
        }
        void navigator.clipboard.writeText(url).then(
          () => profileStatus('Device link copied.'),
          () => profileStatus(url)
        )
      }
    })
}
element('claim-form').onsubmit = (event) => {
  event.preventDefault()
  void ready
    .then(() => profiles.claimDeviceLink(input('link-input').value))
    .then((result) => {
      if (result.ok) {
        renderProfile()
        input('link-input').value = ''
        element('link-output').hidden = true
      }
      profileStatus(result.ok ? 'Linked profile ' + result.profile.callsign + '!' : result.message)
    })
}
function rankRow(entry: LeaderboardEntry) {
  const row = document.createElement('tr')
  row.dataset.viewer = String(entry.isViewer)
  for (const value of [
    entry.rank === 0 ? 'Unranked' : '#' + entry.rank,
    entry.callsign,
    entry.rating,
    entry.wins + '–' + entry.losses,
    formatStreak(entry.streak),
  ]) {
    const cell = document.createElement('td')
    cell.textContent = String(value)
    row.append(cell)
  }
  return row
}
let rankRequest = 0
function refreshRanks() {
  const request = ++rankRequest
  element('rank-count').textContent = 'Loading ranks…'
  void ready
    .then(() => profiles.fetchLeaderboard())
    .then((data) => {
      if (request !== rankRequest) {
        return
      }
      const table = element('rank-rows')
      const pinned = element('viewer-rank')
      pinned.hidden = true
      table.replaceChildren()
      if (Option.isNone(data)) {
        element('rank-count').textContent = 'Could not load ranks. Try again.'
        return
      }
      const { entries, viewer, totalPlayers } = data.value
      element('rank-count').textContent =
        totalPlayers +
        ' ranked players' +
        (entries.length === 0 ? ' · Play a ranked match to start the leaderboard.' : '')
      table.replaceChildren(...Arr.map(entries, rankRow))
      if (viewer !== null && Arr.some(entries, (e) => e.playerId === viewer.playerId) === false) {
        pinned.replaceChildren(rankRow(viewer))
        pinned.hidden = false
      }
    })
}
element('refresh-ranks').onclick = refreshRanks
element('ranks').onclick = element('result-ranks').onclick = () => {
  ranks.showModal()
  void refreshRanks()
}
element('result-rematch').onclick = () => session.send(DuelCommand.cases.Rematch.make({}))
let queueTimer = 0
function hideQueue() {
  clearInterval(queueTimer)
  searching.close()
}
function cancelQueue() {
  session.cancelQueue()
  hideQueue()
  openLobby()
}
element('cancel-queue').onclick = cancelQueue
searching.oncancel = (event) => {
  event.preventDefault()
  cancelQueue()
}
element('queue-bot').onclick = () => {
  session.cancelQueue()
  hideQueue()
  element('practice').click()
}
function startQueue() {
  initialRoom = false

  const account = Option.getOrUndefined(profiles.current())
  if (account === undefined) {
    openLobby()
    notice('Ranked play needs an online profile.')
    return
  }
  if (searching.open) {
    return
  }
  launch.pending = true
  lobby.close()
  searching.showModal()
  setClock(undefined)
  showResult()
  const start = performance.now()
  const tick = () => {
    const elapsed = Math.floor((performance.now() - start) / 1000)
    element('queue-time').textContent = Math.floor(elapsed / 60) + ':' + Str.padStart(2, '0')(String(elapsed % 60))
  }
  tick()
  queueTimer = window.setInterval(tick, 250)
  element('queue-status').textContent = account.profile.rating + ' Elo · Connecting…'
  session.quickMatch({
    sessionToken: account.token,
    onQueueUpdate: (msg) => {
      element('queue-status').textContent =
        formatQueuePopulation(msg.waitingCount) + ' ' + msg.rating + ' Elo · ' + formatQueueWindow(msg.window)
    },
    onMatched: () => {
      hideQueue()
      notice('Joining ranked room…')
    },
    onQueueClosed: (message) => {
      hideQueue()
      openLobby()
      notice(message)
    },
  })
}
element('start-ranked').onclick = element('quick-match').onclick = startQueue
const room = readRoomCodeFromSearch(location.search)
if (room !== undefined) {
  lobby.showModal()
}
function initializeLobby() {
  return profiles.init().then(({ notice: message }) => {
    renderProfile()
    profileStatus(message)
    if (message !== '') {
      notice(message)
    }
    element('quick-match').removeAttribute('disabled')
    if (room !== undefined) {
      if (launch.active === false && launch.pending && searching.open === false && initialRoom) {
        void session.online(room, callsign())
      }
    }
  })
}
const ready = initializeLobby()
try {
  const host = element('stage')
  const app = new Application()
  await app.init({
    resizeTo: host,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(devicePixelRatio, 2),
    preference: 'webgl',
    backgroundAlpha: 0,
    autoStart: false,
  })
  new ResizeObserver(() => app.resize()).observe(host)
  const arena = mountArena({ host, app })
  state.arena = arena
  arena.update(state.view, false)
  drawHand()
} catch {
  element('graphics').textContent = '3D graphics unavailable. Use the space indicators and card controls to play.'
}
