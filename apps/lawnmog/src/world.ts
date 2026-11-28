import { AmbientLight, Camera3D, Container3D, DirectionalLight, View3D } from '@pixi/3d'
import * as Arr from 'effect/Array'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as MutableHashSet from 'effect/MutableHashSet'
import * as Option from 'effect/Option'
import { Application } from 'pixi.js'

import type { BlockView, Direction, EquippedTool } from './model.ts'
import {
  estateColumn,
  estateIndex,
  lotColumn,
  lotOrigin,
  oppositeZ,
  signPosition,
  spacing,
  streetIndex,
  turfSize,
} from './street-layout.ts'
import { buildLot, solid } from './world-art.ts'
import { worldControls } from './world-controls.ts'
import { createEstate } from './world-estate.ts'
import { gardener } from './world-gardener.ts'
import { leafFlights } from './world-leaves.ts'
import { equipment, reach } from './world-tools.ts'
import type { WorldTool } from './world-tools.ts'

export type { WorldTool } from './world-tools.ts'
const workSpeed: Record<WorldTool, number> = {
  reel: 0.7,
  push: 1,
  'self-propelled': 1.38,
  riding: 1.85,
  'watering-can': 0.62,
  hose: 1,
  sprinkler: 1,
  irrigation: 1,
  feed: 0.68,
  'drop-spreader': 0.9,
  'broadcast-spreader': 1.08,
  treat: 0.68,
  'pump-sprayer': 0.9,
  'backpack-sprayer': 1.08,
  rake: 0.7,
  'handheld-blower': 0.9,
  'backpack-blower': 1,
}
export type Pose = { x: number; z: number; yaw: number }
export type WorldPeer = Pose & { lot: number; name: string }
type View = Pick<
  BlockView,
  'lots' | 'player' | 'weather' | 'season' | 'estateLeaves' | 'karenAnger' | 'nextJudgingAt' | 'yardWinner'
>
type Callbacks = {
  onMove: (pose: Pose) => void
  onReturnPile: (cell: number, senderLot: number, id: number) => void
  // oxlint-disable-next-line enfect/prefer-option-over-null -- The HUD clears the return prompt when focus leaves a pile.
  onReturnFocus: (senderLot: number | null) => void
  onLeafLaunch: () => void
  onWork: (lot: number, cell: number, direction: Direction) => void
  // oxlint-disable-next-line enfect/prefer-option-over-null -- The shell accepts null when the player leaves a sign.
  onFocus: (lot: number | null) => void
  onActivity?: (tool: EquippedTool, working: boolean, walking: boolean) => void
}
export interface World {
  setBlock(view: View): void
  setPeers(peers: ReadonlyArray<WorldPeer>): void
  setTool(tool: EquippedTool): void
  /** Return true when the follow camera is selected. */
  toggleCamera(): boolean
  setBlowerTargeted(targeted: boolean): void
  setWorkingEnabled(enabled: boolean): void
  /** Return to the sidewalk outside this address. */
  blowLeaves(source: number, cell: number, destination: number, landing: number, amount: number): void
  visitEstate(): void
  visit(lot: number): void
  dispose(): void
}

function localPosition(x: number, z: number) {
  const index = streetIndex({ column: Math.round(x / spacing), opposite: z > oppositeZ / 2 })
  const origin = lotOrigin(index)
  return { index, x: (x - origin.x) * origin.side, z: (z - origin.z) * origin.side }
}
/** Row zero is nearest the house. Each lawn uses its own axes. */
export function groundCell(point: Pick<Pose, 'x' | 'z'>) {
  const { index, x, z } = localPosition(point.x, point.z)
  const col = Math.floor((x / turfSize + 0.5) * 8)
  const row = Math.floor((z / turfSize + 0.5) * 8)
  if (index < 0 || col < 0 || col >= 8 || row < 0 || row >= 8) {
    return null
  }
  return { index, cell: row * 8 + col }
}

function avatar(root: Container3D, peer: WorldPeer) {
  const body = gardener({ parent: root, shirt: peer.lot % 2 === 1 ? 0xc8_88_42 : 0x77_9b_b2 })
  body.node.position.set(peer.x, 0, peer.z)
  body.node.rotation.y = -peer.yaw
  return { ...body, target: peer, steps: 0 }
}

function horizon(root: Container3D) {
  const sky = root.addChild(new Container3D())
  solid(sky, 0xa1_b1_72, 0, -0.64, 0, 250, 0.62, 250)
  for (let i = 0; i < 28; i++) {
    const angle = (i * 2 * Math.PI) / 28
    const x = Math.sin(angle) * 79,
      z = Math.cos(angle) * 79
    solid(sky, i % 2 === 1 ? 0x83_a4_8a : 0x70_8d_79, x, -4, z, 32 + (i % 4) * 3, 15 + (i % 5) * 2, 25, 'leaf')
    if (i % 3 === 0) {
      const y = 16 + (i % 7)
      solid(sky, 0xff_f2_d9, x, y, z, 13, 3.3, 5, 'leaf')
      solid(sky, 0xff_fa_e9, x + 2, y + 1.4, z, 7, 4.3, 5, 'leaf')
    }
  }
  solid(sky, 0xff_e9_ae, -38, 34, -70, 5, 5, 5, 'leaf')
  return sky
}
// @effect-diagnostics-next-line missingPipeableSignature:off -- The game shell supplies a host and callbacks.
export function createWorld(host: HTMLElement, callbacks: Callbacks): Promise<World> {
  const app = new Application()
  return app
    .init({
      resizeTo: host,
      preference: 'webgl',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(1.75, window.devicePixelRatio),
      backgroundColor: 0xc7_df_d2,
    })
    .then((): World => {
      const camera = new Camera3D({ fov: 69, near: 0.045, far: 155 })
      const scene = new View3D({
        camera,
        autoResize: true,
        background: { skyColor: 0x3e_99_c8, groundColor: 0xc2_e8_ec },
        environment: { skyColor: 0xc1_db_ea, groundColor: 0xb6_ac_84 },
        fog: { type: 'linear', color: 0xc7_d7_bb, near: 34, far: 106 },
      })
      app.stage.addChild(scene)
      const root = scene.root
      const sun = root.addChild(new DirectionalLight({ x: -12, y: 23, z: 11, color: 0xff_e3_b8, intensity: 1.55 }))
      sun.lookAt({ x: 0, y: 0, z: 0 })
      root.addChild(new AmbientLight({ color: 0xff_ee_d9, intensity: 0.65 }))
      const sky = horizon(root)
      const estate = createEstate(root)
      const flights = leafFlights(root)
      app.canvas.style.display = 'block'
      host.append(app.canvas)
      const controls = worldControls({ canvas: app.canvas, host })
      const carrier = root.addChild(new Container3D())
      carrier.visible = false
      let tool: EquippedTool = null
      let held = Option.none<ReturnType<typeof equipment>>()
      function localGardener() {
        return gardener({
          parent: carrier,
          shirt: 0x6f_91_78,
          grips: Option.getOrUndefined(held)?.grips ?? [],
          riding: tool === 'riding',
        })
      }
      let body = localGardener(),
        follow = false
      body.head.visible = false
      let view: View = {
        lots: [],
        player: null,
        weather: 'sunny',
        season: 'autumn',
        estateLeaves: 0,
        karenAnger: 0,
        nextJudgingAt: 0,
        yardWinner: null,
      }
      const lots = MutableHashMap.empty<number, ReturnType<typeof buildLot>>()
      const neighbors = MutableHashMap.empty<number, ReturnType<typeof avatar>>()
      let x = -2.65,
        z = 6.42,
        t = 0,
        steps = 0,
        focus = Option.none<number>()
      let enabled = false,
        blowerTargeted = false,
        returnPress = false,
        returnFocus = Option.none<number>(),
        gustUntil = 0,
        untilWork = 0,
        lastCell = '',
        untilMove = 0,
        lastPose = Option.none<Pose>()
      let visibleIndex = -100
      function updateLots() {
        const center = Math.round(x / spacing)
        for (const [i, lot] of lots) {
          if (Math.abs(center - lotColumn(i)) > 3 || view.lots[i] === undefined) {
            lot.dispose()
            MutableHashMap.remove(lots, i)
          }
        }
        for (let column = center - 3; column <= center + 3; column++) {
          for (const opposite of [false, true]) {
            const i = streetIndex({ column, opposite })
            const lot = view.lots[i]
            if (lot === undefined) {
              continue
            }
            const slot = Option.getOrElse(MutableHashMap.get(lots, i), () => buildLot({ root, index: i }))
            MutableHashMap.set(lots, i, slot)
            slot.update(lot, view.season)
          }
        }
        visibleIndex = center
      }
      function visit(id: number) {
        const index = Option.getOrElse(
          Arr.findFirstIndex(view.lots, (lot) => lot.id === id),
          () => -1
        )
        if (index < 0) {
          return
        }
        const origin = lotOrigin(index)
        x = origin.x - 2.65 * origin.side
        z = origin.z + 6.42 * origin.side
        controls.resetView(origin.side === 1 ? 0.28 : Math.PI + 0.28)
        updateLots()
      }
      function canWalk(nx: number, nz: number) {
        const pairs = Math.floor(view.lots.length / 2)
        if (
          nx < (estateColumn - Math.ceil(pairs / 2) - 0.5) * spacing + 0.24 ||
          nx > (estateColumn + Math.floor(pairs / 2) + 0.5) * spacing - 0.24 ||
          nz > oppositeZ + 10.55 ||
          nz < -10.55
        ) {
          return false
        }
        const local = localPosition(nx, nz)
        if (local.index === estateIndex) {
          return (
            !(local.z < -5.25 && Math.abs(local.x) < 5.8) &&
            !(local.z < -4.02 && Math.abs(local.x) < 2) &&
            !(Math.abs(local.x + 3.9) < 1.5 && Math.abs(local.z - 5.4) < 0.25)
          )
        }
        if (view.lots[local.index] === undefined) {
          return local.z >= 7
        }
        if (local.z < -5.3 && Math.abs(local.x) < 4.25) {
          return false
        }
        if (local.z < -4.02 && Math.abs(local.x) < 1.39) {
          return false
        }
        if (Math.abs(local.x - signPosition.x) < 1.27 && Math.abs(local.z - signPosition.z) < 0.24) {
          return false
        }
        if (Math.hypot(local.x + 5.6, local.z + 5.9) < 0.47 || Math.hypot(local.x - 5.8, local.z + 9) < 0.47) {
          return false
        }
        return true
      }
      function frame(dt: number) {
        t += dt
        const input = controls.read(dt)
        const { yaw, pitch } = input,
          sin = Math.sin(yaw),
          cos = Math.cos(yaw)
        const head = groundCell({ x: x + sin * reach, z: z - cos * reach })
        const powering =
          enabled &&
          input.working &&
          head !== null &&
          view.player !== null &&
          view.lots[head.index]?.id === view.player.lot
        const gear = powering && tool !== null ? workSpeed[tool] : 1
        const speed = ((input.fast ? 5.8 : 3.3) * gear * dt) / Math.max(1, Math.hypot(input.side, input.forward))
        const nx = x + (input.forward * sin + input.side * cos) * speed
        const nz = z + (input.side * sin - input.forward * cos) * speed
        const ox = x,
          oz = z
        if (canWalk(nx, z)) {
          x = nx
        }
        if (canWalk(x, nz)) {
          z = nz
        }
        if (Math.round(x / spacing) !== visibleIndex) {
          updateLots()
        }
        const distance = Math.hypot(x - ox, z - oz)
        steps += distance * 2.8
        const seated = tool === 'riding'
        const swing = distance > 0 ? Math.sin(steps) : 0
        const bob = seated ? 0 : Math.abs(swing) * 0.026
        const eye = (seated ? 1.76 : 1.63) + bob
        const boomX = -sin + cos * 0.37,
          boomZ = cos + sin * 0.37
        let boom = 0
        if (follow) {
          for (let d = 0.18; d <= 3.8; d += 0.18) {
            if (!canWalk(x + boomX * d, z + boomZ * d)) {
              break
            }
            boom = d
          }
        }
        body.head.visible = boom > 0.6
        if (boom > 0.6) {
          camera.position.set(x + boomX * boom, eye + boom * 0.37, z + boomZ * boom)
          camera.lookAt({ x: x + sin * 0.7, y: 1.04 + Math.sin(pitch) * 0.8, z: z - cos * 0.7 })
        } else {
          camera.position.set(x + sin * 0.2, eye, z - cos * 0.2)
          camera.lookAt({
            x: camera.x + sin * Math.cos(pitch),
            y: eye + Math.sin(pitch),
            z: camera.z - cos * Math.cos(pitch),
          })
        }
        carrier.position.set(x, 0, z)
        body.stride(swing)
        carrier.rotation.y = -yaw
        estate.update(t, dt, x, z, view.karenAnger, view.estateLeaves)
        flights.update(dt)
        sky.x = x
        const aim = groundCell({ x: x + sin * reach, z: z - cos * reach })
        const aimLot = aim === null ? undefined : view.lots[aim.index]
        let nextFocus = Option.none<number>()
        for (const offset of [0, -1, 1]) {
          const index = streetIndex({ column: Math.round(x / spacing) + offset, opposite: z > oppositeZ / 2 })
          const lot = view.lots[index]
          if (lot === undefined) {
            continue
          }
          const origin = lotOrigin(index)
          if (
            Math.hypot(x - origin.x - origin.side * signPosition.x, z - origin.z - origin.side * signPosition.z) <= 4.35
          ) {
            nextFocus = Option.some(lot.id)
            break
          }
        }
        if (Option.getOrUndefined(nextFocus) !== Option.getOrUndefined(focus)) {
          focus = nextFocus
          callbacks.onFocus(Option.getOrNull(focus))
        }
        const blower = tool === 'handheld-blower' || tool === 'backpack-blower'
        const targeting = blowerTargeted && blower
        const pile =
          enabled && blower && aim !== null && aimLot !== undefined && aimLot.id === view.player?.lot
            ? Option.getOrUndefined(Arr.findFirst(aimLot.returnPiles, (entry) => entry.cell === aim.cell))
            : undefined
        if (Option.getOrUndefined(returnFocus) !== pile?.senderLot) {
          returnFocus = Option.fromUndefinedOr(pile?.senderLot)
          controls.setPileFocus(pile !== undefined, targeting)
          callbacks.onReturnFocus(Option.getOrNull(returnFocus))
        }
        if (!input.working || input.workPressed) {
          returnPress = false
        }
        if (pile !== undefined && input.workPressed) {
          returnPress = true
          callbacks.onReturnPile(pile.cell, pile.senderLot, pile.id)
          gustUntil = t + 0.28
        }
        const localWork =
          !targeting &&
          !returnPress &&
          pile === undefined &&
          enabled &&
          tool !== null &&
          input.working &&
          aim !== null &&
          aimLot !== undefined &&
          aimLot.id === view.player?.lot
        if (!returnPress && targeting && enabled && view.player !== null && input.workPressed) {
          callbacks.onLeafLaunch()
          gustUntil = t + 0.28
        }
        const active = localWork || (enabled && blower && t < gustUntil)
        Option.getOrUndefined(held)?.animate(t, distance, dt, active)
        callbacks.onActivity?.(tool, active, distance > 0)
        if (localWork) {
          const key = aimLot.id + '/' + aim.cell
          if (t >= untilWork && (key !== lastCell || t >= untilWork + 0.32)) {
            untilWork = t + 0.14
            lastCell = key
            const direction = Math.abs(sin) > Math.abs(cos) ? (sin > 0 ? 'east' : 'west') : cos > 0 ? 'north' : 'south'
            callbacks.onWork(aimLot.id, aim.cell, direction)
          }
        } else {
          lastCell = ''
        }
        const lastMove = Option.getOrUndefined(lastPose)
        if (
          t >= untilMove &&
          (lastMove === undefined || lastMove.x !== x || lastMove.z !== z || lastMove.yaw !== yaw || t >= untilMove + 3)
        ) {
          untilMove = t + 0.1
          const pose = { x, z, yaw }
          lastPose = Option.some(pose)
          callbacks.onMove(pose)
        }
        const blend = 1 - Math.exp(-dt * 12)
        for (const peer of MutableHashMap.values(neighbors)) {
          const { node, target } = peer
          const travel = Math.hypot(target.x - node.x, target.z - node.z) * blend
          peer.steps += travel * 2.8
          peer.stride(travel > 0.001 ? Math.sin(peer.steps) : 0)
          node.x += (target.x - node.x) * blend
          node.z += (target.z - node.z) * blend
          const angle = -target.yaw - node.rotation.y
          node.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * blend
        }
      }
      app.ticker.add((ticker) => frame(Math.min(0.05, ticker.deltaMS / 1000)))
      return {
        setBlock(next) {
          const wasHome = view.player?.lot
          view = next
          estate.setJudging(next)
          carrier.visible = next.player !== null
          if (next.player !== null && wasHome !== next.player.lot) {
            visit(next.player.lot)
          } else {
            updateLots()
          }
          sun.intensity = { rain: 0.76, overcast: 1.05, sunny: 1.55 }[next.weather]
        },
        setPeers(peers) {
          const present = MutableHashSet.fromIterable(Arr.map(peers, (peer) => peer.lot))
          for (const [id, peer] of neighbors) {
            if (!MutableHashSet.has(present, id)) {
              peer.node.destroy({ children: true })
              MutableHashMap.remove(neighbors, id)
            }
          }
          for (const peer of peers) {
            const current = Option.getOrUndefined(MutableHashMap.get(neighbors, peer.lot))
            if (current !== undefined) {
              current.target = peer
            } else {
              MutableHashMap.set(neighbors, peer.lot, avatar(root, peer))
            }
          }
        },
        setTool(next) {
          if (tool === next) {
            return
          }
          Option.getOrUndefined(held)?.node.destroy({ children: true })
          tool = next
          held = next === null ? Option.none() : Option.some(equipment({ parent: carrier, tool: next }))
          controls.setWorkAvailable(enabled && next !== null)
          body.node.destroy({ children: true })
          body = localGardener()
          body.head.visible = follow
          lastCell = ''
        },
        toggleCamera() {
          follow = !follow
          return follow
        },
        setBlowerTargeted(targeted) {
          if (targeted !== blowerTargeted) {
            blowerTargeted = targeted
            gustUntil = 0
            controls.setBlowerTargeted(targeted)
            controls.setPileFocus(Option.isSome(returnFocus), targeted)
          }
        },
        setWorkingEnabled(value) {
          enabled = value
          controls.setWorkAvailable(value && tool !== null)
        },
        blowLeaves(source, cell, destination, landing, amount) {
          const from = Option.getOrElse(
            Arr.findFirstIndex(view.lots, (lot) => lot.id === source),
            () => -1
          )
          const to =
            destination === 0
              ? estateIndex
              : Option.getOrElse(
                  Arr.findFirstIndex(view.lots, (lot) => lot.id === destination),
                  () => -1
                )
          if (from >= 0 && (to >= 0 || to === estateIndex)) {
            flights.send(from, cell, to, landing, amount)
          }
        },
        visitEstate() {
          x = estateColumn * spacing
          z = 11.5
          controls.resetView(0)
          updateLots()
        },
        visit,
        dispose() {
          app.stop()
          controls.dispose()
          estate.dispose()
          for (const lot of MutableHashMap.values(lots)) {
            lot.dispose()
          }
          root.destroy({ children: true })
          app.destroy({ removeView: true }, { children: true })
        },
      }
    })
}
