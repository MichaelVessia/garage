import * as Option from 'effect/Option'

import { draw } from './board.ts'
import type { Camera } from './camera.ts'
import { leaderboardPlayerId, readSharedFactory } from './cloud.ts'
import type { createEditor } from './editor.ts'
import { notify } from './effects.ts'
import type { Factory } from './factory.ts'
import type { createGuide } from './guide.ts'
import { element } from './hud.ts'
import { setupLeaderboard } from './leaderboard.ts'
import { saveBoard } from './storage.ts'
import type { Tool } from './tools.ts'
import { watchUpdates, saveAndReload } from './updates.ts'
import type { createViewport } from './viewport.ts'

declare const __BELTWORKS_BUILD_ID__: string
export function connectFactory({
  factory,
  editor,
  guide,
  viewport,
  clearStroke,
}: {
  factory: Factory
  editor: ReturnType<typeof createEditor>
  guide: ReturnType<typeof createGuide>
  viewport: ReturnType<typeof createViewport>
  clearStroke: () => void
}) {
  const { runtime, state, board, inspection, sync, storage, localRevision, history, undoButton } = factory
  const { choose, refresh } = editor
  let savedRevision = editor.revision
  function save(keepalive = false, force = false) {
    if (savedRevision === editor.revision && !force) {
      return
    }
    return inspection.saveHome((home) => {
      const revision = Math.floor(performance.timeOrigin + performance.now())
      leaderboard.sync(true)
      if (saveBoard(storage)(home, revision)) {
        savedRevision = editor.revision
      } else {
        notify('Local save unavailable')
      }
      return sync.upload(revision, keepalive)
    })
  }
  const updateNotice = element('update-notice')
  watchUpdates({
    currentVersion: __BELTWORKS_BUILD_ID__,
    onUpdate: () => {
      updateNotice.hidden = false
    },
  })
  element('update-later').onclick = () => {
    updateNotice.hidden = true
  }
  element('update-reload').onclick = () => {
    updateNotice.hidden = true
    void saveAndReload({ save: () => save(false, true), reload: () => window.location.reload() })
  }
  window.setInterval(() => void save(), 5000)
  window.addEventListener('pagehide', () => void save(true))
  element('share').onclick = () => {
    void sync
      .shareLink()
      .then(notify)
      .catch(() => notify('Could not share factory'))
  }
  let homeView = Option.none<{ tool: Tool; camera: Camera; dismissed: Option.Option<number> }>()
  let inspectionRequest = 0
  function redrawFactory(nextTool: Tool) {
    state.pendingStroke = Option.none()
    clearStroke()
    element('milestone-banner').hidden = true
    for (const node of board.fx.removeChildren()) {
      node.destroy({ children: true })
    }
    runtime.tick(draw)
    refresh(true)
    choose(nextTool)
    viewport.center()
    element('workshop').inert = inspection.visiting
    undoButton.toggleAttribute('disabled', inspection.visiting || !history.available)
    for (const id of ['clear', 'reset', 'speed', 'pause', 'open-workshop']) {
      element(id).toggleAttribute('disabled', inspection.visiting)
    }
  }
  const resumed = sync.load(() => !editor.editedSinceStart, localRevision)
  const leaderboard = setupLeaderboard({
    state: () => ({
      visiting: inspection.visiting,
      revision: editor.revision,
      totalDelivered: state.view.p.totalDelivered,
      milestoneIndex: state.view.p.milestoneIndex,
      ascensions: state.view.p.meta.ascensions,
    }),
    getSave: inspection.getSave,
    playerId: leaderboardPlayerId(),
    inspect: (shareId, callsign) => {
      const request = ++inspectionRequest
      return Promise.all([readSharedFactory(shareId), resumed]).then(([shared]) => {
        if (request !== inspectionRequest) {
          return
        }
        void save()
        const camera = { scale: board.world.scale.x, x: board.world.x, y: board.world.y }
        inspection.enter(shared)
        if (Option.isNone(homeView)) {
          homeView = Option.some({ tool: state.tool, camera, dismissed: guide.dismissed })
        }
        redrawFactory('select')
        element('inspection-label').textContent = 'Inspecting ' + callsign + "'s factory"
        element('inspection-banner').hidden = false
      })
    },
  })
  element('inspection-back').onclick = () => {
    if (Option.isNone(homeView)) {
      return
    }
    inspection.leave()
    const { camera, tool: homeTool, dismissed } = homeView.value
    inspectionRequest++
    homeView = Option.none()
    redrawFactory(homeTool)
    guide.dismissed = dismissed
    guide.animateBoard(true)
    board.world.scale.set(camera.scale)
    board.world.position.set(camera.x, camera.y)
    element('inspection-banner').hidden = true
  }
  const restored = resumed.then((restoredMessage) => {
    if (restoredMessage !== undefined) {
      history.clear()
      undoButton.toggleAttribute('disabled', true)
      runtime.tick(draw)
      refresh(true)
      if (restoredMessage === 'Loaded shared factory') {
        void save()
      }
      if (restoredMessage.length > 0) {
        notify(restoredMessage)
      }
    }
  })
  return { syncScore: () => leaderboard.sync(), restored }
}
