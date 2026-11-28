import { DuelEvent, DuelPhase } from '@garage/battleblocks-domain'
import type { PlayerView, Seat } from '@garage/battleblocks-domain'
import {
  AmbientLight,
  Camera3D,
  IcosahedronGeometry,
  Container3D,
  CubeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Material3D,
  Mesh3D,
  SphereGeometry,
  Sprite3D,
  TorusGeometry,
  View3D,
} from '@pixi/3d'
import type { Geometry3D } from '@pixi/3d'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import { Texture } from 'pixi.js'
import type { Application } from 'pixi.js'

import type { ActionOption, BridgeMarker } from './arenaMath.ts'
import { blockColors, values, computeBridgeMarkers, computeCameraTarget, spaceToWorldX, turnSeat } from './arenaMath.ts'

function badgeTexture(
  cache: MutableHashMap.MutableHashMap<string, Texture>,
  label: string,
  fill: string,
  ink = '#1e293b'
) {
  const key = label + fill + ink
  const cached = MutableHashMap.get(cache, key)
  if (Option.isSome(cached)) {
    return cached.value
  }
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 72
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Cannot draw bridge badges without a 2D canvas')
  }
  ctx.fillStyle = fill
  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.roundRect(3, 3, 122, 66, 24)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = ink
  ctx.font = 'bold 57px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 64, 38)
  const texture = Texture.from(canvas, true)
  MutableHashMap.set(cache, key, texture)
  return texture
}

function surface(color: number, glow = 0) {
  const base = { baseColor: color, roughness: 0.72, specular: { factor: 0.25 } }
  return new Material3D(glow > 0 ? { ...base, emissive: { color, strength: glow } } : base)
}
function part(
  parent: Container3D,
  geometry: Geometry3D,
  material: Material3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number
) {
  return parent.addChild(new Mesh3D({ geometry, material, x, y, z, scale: { x: w, y: h, z: d } }))
}
type ArenaState = {
  markers: ReadonlyArray<BridgeMarker>
  preview: Option.Option<ActionOption>
  positions: readonly [number, number]
  shake: number
}
export function mountArena({ host, app }: { host: HTMLElement; app: Application }) {
  const camera = new Camera3D({ fov: 48, far: 500 })
  const scene = new View3D({
    camera,
    width: host.clientWidth,
    height: host.clientHeight,
    toneMapping: 'aces',
    environment: { skyColor: 0xc7_e7_ff, groundColor: 0x7c_d9_8c },
  })
  app.stage.addChild(scene)
  const root = scene.root
  const cube = new CubeGeometry()
  const star = new IcosahedronGeometry({ radius: 0.5 })
  const sphere = new SphereGeometry({ radius: 0.5, widthSegments: 16, heightSegments: 10 })
  const cylinder = new CylinderGeometry({ radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 8 })
  const turnHoop = new TorusGeometry({ radius: 0.68, tube: 0.045 })

  const crownPeak = new CylinderGeometry({ radiusTop: 0, radiusBottom: 0.5, height: 1, radialSegments: 4 })
  const shieldGlass = new Material3D({ baseColor: 0x7d_d3_fc, alphaMode: 'blend', alpha: 0.26 })
  const cream = surface(0xff_ff_ff)
  const eyeWhite = surface(0xff_ff_ff, 0.25)
  const butter = surface(0xfe_f3_c7)
  const wood = surface(0xd9_77_06)
  const gold = surface(blockColors[3].hex, 0.3)
  const ember = surface(blockColors[1].hex)
  const frost = surface(blockColors[5].hex)
  const ink = surface(0x1e_29_3b)
  const paints = Arr.map(values, (value) => surface(blockColors[value].hex, 0.35))
  const hills = surface(0x16_a3_4a)
  for (const x of [-18, -6, 8, 22]) {
    part(root, sphere, hills, x, -7.8, -12, 16, 6 + Math.cos(x) * 1.4, 7)
  }
  part(root, sphere, gold, 8, 7, -13, 2.6, 2.6, 2.6)
  const clouds = Arr.map([-15, -5, 5, 15], (x, i) => {
    const cloud = root.addChild(new Container3D({ x, y: 4.5 + (i % 3), z: -9 - i * 1.8 }))
    for (const offset of [-1, 0, 1]) {
      part(cloud, sphere, cream, offset, offset === 0 ? 0.36 : 0, 0, 2.3, 1.25, 1.3)
    }
    return { cloud, x }
  })
  const beads = Array.from({ length: 17 * 3 }, () => {
    const mesh = part(root, sphere, gold, 0, 0, 0.62, 0.22, 0.22, 0.22)
    mesh.visible = false
    return { mesh, height: 0 }
  })

  const textures = MutableHashMap.empty<string, Texture>()
  const rails = Array.from({ length: 18 }, (_, index) => {
    const x = spaceToWorldX(index + 1)
    part(root, cube, wood, x, -0.38, 0, 1.16, 0.45, 2.16)
    const tile = index % 2 === 0 ? cream : butter
    part(root, cube, tile, x, -0.11, 0, 1.12, 0.18, 2.05)
    part(root, cube, tile, x, -0.025, 0, 1.07, 0.05, 2)
    for (const edge of [-1, 1]) {
      part(root, cube, tile, x, -0.028, edge * 1.005, 1.075, 0.04, 0.04).rotation.x = Math.PI / 4
      part(root, cube, tile, x + edge * 0.54, -0.028, 0, 0.04, 0.04, 2).rotation.z = Math.PI / 4
    }
    part(root, cube, tile, x, -0.31, 1.09, 0.75, 0.05, 0.035)
    if (index % 3 === 1) {
      part(root, cylinder, wood, x, -2.6, 0, 0.92, 4.4, 1.36)
      const brace = part(root, cube, wood, x + 0.45, -0.95, 0, 0.25, 1.45, 1.4)
      brace.rotation.z = -0.64
    }
    const pad = part(root, cube, gold, x, 0.015, 0.75, 0.88, 0.03, 0.22)
    pad.visible = false
    const badge = (y: number, z: number, width: number) =>
      root.addChild(
        new Sprite3D({
          x,
          y,
          z,
          texture: Texture.EMPTY,
          pixelSize: width / 128,
          billboardMode: 'spherical',
          alphaMode: 'blend',
        })
      )
    const near = badge(-0.05, 1.48, 0.85)
    near.visible = false
    return { pad, near, far: badge(0.04, -1.35, 0.72) }
  })
  part(root, cube, ember, spaceToWorldX(1), -0.31, 1.11, 1.1, 0.09, 0.05)
  part(root, cube, frost, spaceToWorldX(18), -0.31, 1.11, 1.1, 0.09, 0.05)
  part(root, cube, gold, 0, -0.07, 0, 0.05, 0.12, 2.14)
  function fighter(seat: Seat, accent: Material3D) {
    const actor = root.addChild(new Container3D({ x: spaceToWorldX(seat === 0 ? 1 : 18) }))
    const body = actor.addChild(new Container3D())
    const facing = seat === 0 ? 1 : -1
    body.rotation.y = facing * 0.24
    const feet = Arr.map([-1, 1], (side) => {
      const foot = body.addChild(new Container3D({ x: side * 0.2, y: 0.09, z: 0.04 }))
      part(foot, cylinder, ink, 0, 0.13, -0.03, 0.27, 0.28, 0.32)
      part(foot, sphere, ink, 0, 0.035, 0.05, 0.37, 0.24, 0.54)
      part(foot, sphere, cream, 0, 0.015, 0.23, 0.29, 0.09, 0.21)
      return foot
    })
    for (const layer of [0, 1, 2]) {
      const y = 0.61 + layer * 0.545
      part(body, cube, accent, 0, y, 0, 0.74, 0.52, 0.62)
      if (layer < 2) {
        part(body, cube, ink, 0, y + 0.2725, 0, 0.735, 0.025, 0.615)
      }
    }
    part(body, cube, ink, 0, 1.02, 0, 0.76, 0.095, 0.64)
    part(body, cube, gold, 0, 1.02, 0.33, 0.14, 0.14, 0.045)
    for (const side of [-1, 1]) {
      part(body, sphere, eyeWhite, side * 0.16, 1.73, 0.314, 0.26, 0.25, 0.16)
      part(body, sphere, ink, side * 0.16 + facing * 0.035, 1.73, 0.385, 0.105, 0.14, 0.052)
      part(body, cube, ink, side * 0.16, 1.89, 0.32, 0.15, 0.036, 0.04).rotation.z = side * 0.15
      part(body, cube, ink, side * 0.047, 1.535, 0.318, 0.109, 0.035, 0.035).rotation.z = side * 0.32
    }
    part(body, cube, gold, 0, 1.985, 0, 0.77, 0.075, 0.65)
    if (seat === 0) {
      for (const x of [-0.25, 0, 0.25]) {
        const height = x === 0 ? 0.22 : 0.16
        part(body, crownPeak, gold, x, 2.02 + height / 2, 0.22, 0.23, height, 0.2)
      }
    } else {
      part(body, sphere, cream, 0, 2.015, 0, 0.75, 0.23, 0.62)
      part(body, cube, cream, 0, 2.015, 0.28, 0.77, 0.065, 0.23)
      part(body, cube, gold, 0, 2.09, 0.015, 0.095, 0.11, 0.46)
    }
    const backArm = body.addChild(new Container3D({ x: -facing * 0.44, y: 1.05, z: 0.025 }))
    part(backArm, sphere, accent, 0, 0, 0, 0.24, 0.23, 0.25)
    part(backArm, cylinder, accent, 0, -0.14, 0, 0.17, 0.29, 0.17)
    part(backArm, sphere, cream, 0, -0.31, 0, 0.23, 0.24, 0.24)
    backArm.rotation.z = -facing * 0.5

    part(body, sphere, accent, facing * 0.4, 1.08, 0.08, 0.34, 0.25, 0.27)
    const weapon = body.addChild(new Container3D({ x: facing * 0.42, y: 1.08, z: 0.08 }))
    weapon.rotation.z = (facing * Math.PI) / 15
    part(weapon, cylinder, accent, facing * 0.085, 0, 0, 0.18, 0.31, 0.18).rotation.z = Math.PI / 2
    part(weapon, sphere, cream, facing * 0.25, 0, 0, 0.24, 0.24, 0.23)
    part(weapon, sphere, gold, facing * 0.375, 0, 0, 0.12, 0.285, 0.285)
    part(weapon, cylinder, eyeWhite, facing * 0.69, 0, 0, 0.05, 0.6, 0.05).rotation.z = Math.PI / 2
    part(weapon, sphere, gold, facing * 0.995, 0, 0, 0.094, 0.094, 0.094)
    const confetti = Array.from({ length: 8 }, (_, i) => {
      const mesh = part(actor, star, paints[i % 5] ?? gold, 0, 1, 0, 0.16, 0.2, 0.16)
      mesh.visible = false
      return mesh
    })
    const streak = part(body, cube, accent, -facing * 0.72, 0.83, 0, 1.4, 0.065, 0.12)
    const ring = part(actor, sphere, shieldGlass, 0, 1.1, 0, 1, 1, 1)
    ring.visible = streak.visible = false
    const turnRing = part(actor, turnHoop, gold, 0, 0.03, 0, 1.22, 1.22, 1.22)
    turnRing.visible = false
    return {
      actor,
      body,
      turnRing,
      feet,
      backArm,
      confetti,
      weapon,
      streak,
      ring,
      seat,
      motion: '',
      time: 0,
      impact: 0,
      shield: 0,
    }
  }
  const fighters: readonly [ReturnType<typeof fighter>, ReturnType<typeof fighter>] = [
    fighter(0, ember),
    fighter(1, frost),
  ]
  root.addChild(new AmbientLight({ color: 0xff_ff_ff, intensity: 0.55 }))
  const lighting: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [5, 11, 8, 0xff_f8_e8, 1.55],
    [-6, 7, 5, 0xd6_ec_ff, 0.65],
  ]
  for (const [x, y, z, color, intensity] of lighting) {
    const light = root.addChild(new DirectionalLight({ color, intensity, x, y, z }))
    light.lookAt({ x: 0, y: 0, z: 0 })
  }
  const state: ArenaState = { positions: [1, 18], shake: 0, markers: [], preview: Option.none() }
  function drawPreview() {
    const action = Option.getOrUndefined(state.preview)
    for (const [i, bead] of beads.entries()) {
      const step = Math.floor(i / 3)
      const target = action?.hops[step]
      bead.mesh.visible = target !== undefined
      if (action === undefined || target === undefined) {
        continue
      }
      const start = action.hops[step - 1] ?? action.origin
      const t = ((i % 3) + 1) / 4
      bead.height = 0.28 + 2.4 * t * (1 - t)
      bead.mesh.x = spaceToWorldX(start + (target - start) * t)
      bead.mesh.y = bead.height
      bead.mesh.material = Option.isSome(action.accent) ? (paints[action.accent.value - 1] ?? gold) : gold
    }
    for (const marker of state.markers) {
      const rail = rails[marker.space - 1]
      if (rail === undefined) {
        continue
      }
      const highlighted = action?.tiles.includes(marker.space) ?? false
      rail.pad.visible = highlighted
      rail.near.visible = marker.nearTone !== 'hidden'
      if (marker.nearTone === 'hidden') {
        continue
      }
      const paint = Option.getOrUndefined(marker.nearValue)
      rail.near.texture =
        paint === undefined
          ? badgeTexture(
              textures,
              marker.nearLabel,
              Match.value(marker.nearTone).pipe(
                Match.when('self', () => '#ffffff'),
                Match.when('opponent-dash', () => '#fbbf24'),
                Match.orElse(() => '#ddd6fe')
              )
            )
          : badgeTexture(textures, marker.nearLabel, blockColors[paint].css, blockColors[paint].text)
    }
  }
  function animate(seat: Seat, motion: string) {
    const actor = fighters[seat]
    actor.motion = motion
    actor.time = 1
  }
  function impact(seat: Seat, power: number) {
    const actor = fighters[seat]
    actor.impact = 1
    state.shake = power
  }
  function event(e: DuelEvent) {
    DuelEvent.match(e, {
      Moved: ({ seat }) => animate(seat, 'step'),
      Dashed: ({ seat }) => animate(seat, 'dash'),
      Pushed: ({ opponent }) => animate(opponent, 'push'),
      Retreated: ({ seat }) => animate(seat, 'retreat'),
      Struck: ({ attacker, isDashing }) => {
        animate(attacker, isDashing ? 'dash' : 'strike')
        impact(attacker, 0.06)
      },
      Blocked: ({ defender }) => {
        fighters[defender].shield = 1
        state.shake = 0.09
      },
      HitLanded: ({ defender }) => {
        animate(defender, 'hit')
        impact(defender, 0.22)
      },
      Recovered: ({ seat }) => impact(seat, 0.03),
      RoundStarted: () => {},
      RoundEnded: () => {},
      DeckReshuffled: () => {},
      MatchEnded: () => {},
    })
  }
  app.ticker.add((t) => {
    const dt = Math.min(0.08, t.deltaMS / 1000)
    const { width, height } = app.screen
    if (scene.width !== width || scene.height !== height) {
      scene.setSize(width, height)
    }
    const target = computeCameraTarget(state.positions, width / Math.max(1, height))
    const smooth = 1 - Math.exp(-7 * dt)
    const pan = camera.z === 0 ? 1 : smooth
    camera.x += (target.x - camera.x) * pan
    camera.y += (target.y - camera.y) * pan
    camera.z += (target.z - camera.z) * pan
    camera.lookAt({ x: camera.x + Math.sin(t.lastTime * 0.09) * state.shake, y: 0.65, z: 0 })
    state.shake *= 1 - smooth
    for (const { cloud, x } of clouds) {
      cloud.x = x + 1.1 * Math.sin(t.lastTime * 0.00015 + x)
    }
    for (const [i, bead] of beads.entries()) {
      if (bead.mesh.visible) {
        bead.mesh.y = bead.height + 0.05 * Math.sin(t.lastTime * 0.006 - i)
      }
    }
    for (const f of fighters) {
      if (f.turnRing.visible) {
        const speed = f.turnRing.material === ember ? 0.009 : 0.003
        f.turnRing.scale.set(1.22 + 0.045 * Math.sin(t.lastTime * speed))
      }
      f.time = Math.max(0, f.time - dt * 2.7)
      f.impact = Math.max(0, f.impact - dt * 2.3)
      const wave = Math.sin(f.time * Math.PI)
      const lunge = f.motion === 'strike' || f.motion === 'dash'
      const recoil = f.motion === 'hit' || f.motion === 'push'
      const facing = f.seat === 0 ? 1 : -1
      f.actor.x +=
        (spaceToWorldX(state.positions[f.seat]) - f.actor.x) * (f.motion === 'dash' ? 1 - Math.exp(-15 * dt) : smooth)
      f.body.x = facing * wave * (lunge ? 0.36 : recoil ? -0.32 : 0)
      f.body.rotation.z = facing * wave * (lunge ? -0.23 : recoil ? 0.28 : 0)
      f.body.y = wave * (lunge || f.motion === 'retreat' || f.motion === 'step' ? 0.51 : 0.12)
      const breath = 0.024 * Math.sin(t.lastTime * 0.003 + f.seat) + wave * 0.07
      f.body.scale.set(1 - breath, 1 + breath, 1)
      const thrust = lunge ? wave : f.motion === 'step' ? wave * 0.5 : 0
      const stride = Math.sin(2 * Math.PI * f.time) * wave
      for (const [i, foot] of f.feet.entries()) {
        const swing = i === 0 ? stride : -stride
        foot.rotation.z = facing * swing * 0.32
        foot.y = 0.09 + Math.max(0, swing) * 0.09
      }
      f.backArm.rotation.z = -facing * (0.5 + thrust * 0.42)
      for (const [i, piece] of f.confetti.entries()) {
        piece.visible = f.impact > 0
        const spread = 1 - f.impact
        const angle = (i * Math.PI) / 4
        piece.position.set(
          Math.cos(angle) * spread * 1.2,
          1 + Math.sin(angle) * spread + Math.sin(spread * Math.PI) * 0.6,
          0.4
        )
        piece.rotation.z = angle + spread * 4
      }
      f.weapon.x = facing * (0.42 + thrust * 0.12)
      f.streak.visible = f.motion === 'dash' && wave > 0.2
      f.shield = Math.max(0, f.shield - dt * 2.3)
      f.ring.visible = f.shield > 0
      const boing = Math.sin(f.shield * Math.PI) * 0.2
      f.ring.scale.set(1.95 + boing, 2.36 + boing, 1.45 + boing)
    }
  })
  const initialCamera = computeCameraTarget(state.positions, host.clientWidth / Math.max(1, host.clientHeight))
  camera.position.set(initialCamera.x, initialCamera.y, initialCamera.z)
  camera.lookAt({ x: initialCamera.lookX, y: 0.65, z: 0 })
  host.append(app.canvas)
  app.render()
  app.start()
  return {
    update(view: PlayerView, events: boolean) {
      state.positions = view.positions
      state.markers = computeBridgeMarkers(view)
      for (const marker of state.markers) {
        const rail = rails[marker.space - 1]
        if (rail === undefined) {
          continue
        }
        rail.far.texture = badgeTexture(textures, marker.farLabel, '#fffbea')
        rail.far.alpha = marker.farTone === 'muted' ? 0.76 : 1
      }
      drawPreview()
      for (const f of fighters) {
        f.turnRing.visible = Option.contains(turnSeat(view.phase), f.seat)
        f.turnRing.material = DuelPhase.guards.AwaitDefense(view.phase) ? ember : gold
      }
      if (events) {
        for (const e of view.lastEvents) {
          event(e)
        }
      }
    },
    preview(action: Option.Option<ActionOption>) {
      state.preview = action
      drawPreview()
    },
  }
}
