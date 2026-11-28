import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { expect, it } from 'vitest'

import { BlockView, Command } from '../src/model.ts'

const readView = Schema.decodeUnknownOption(BlockView)
const readText = Schema.decodeUnknownOption(Schema.fromJsonString(BlockView))
const writeCommand = Schema.encodeOption(Schema.fromJsonString(Command))

// @effect-diagnostics asyncFunction:off -- The test drives the local runtime's Promise API.
it('serializes competing claims and shares changed lawns across private sessions', async () => {
  const build = await Bun.build({
    entrypoints: [new URL('../server/src/worker.ts', import.meta.url).pathname],
    external: ['cloudflare:workers'],
    target: 'browser',
  })
  const script = build.outputs[0]
  if (script === undefined) {
    throw new Error('Worker build failed')
  }
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await script.text(),
      compatibilityDate: '2026-11-27',
      durableObjects: { BLOCK: { className: 'Block', useSQLite: true } },
    })
  )
  try {
    const endpoint = new URL('/api/block', await runtime.ready).href
    const get = (cookie?: string) =>
      runtime.dispatchFetch(endpoint, cookie === undefined ? {} : { headers: { cookie } })
    const post = (cookie: string, body: Command) =>
      runtime.dispatchFetch(endpoint, {
        method: 'POST',
        headers: { cookie },
        body: Option.getOrThrow(writeCommand(body)),
      })
    const visit = async () => {
      const response = await get()
      const cookie = Str.split(';')(response.headers.get('set-cookie') ?? '')[0]
      if (cookie.length === 0) {
        throw new Error('Session cookie missing')
      }
      expect(response.headers.get('set-cookie')).toContain('HttpOnly')
      return cookie
    }
    const [first, second] = await Promise.all([visit(), visit()])
    const results = await Promise.all([
      post(first, Command.cases.Claim.make({ lot: 1, name: 'Ada' })),
      post(second, Command.cases.Claim.make({ lot: 1, name: 'Rae' })),
    ])
    expect(
      Arr.sort(
        Arr.map(results, (response) => response.status),
        Order.Number
      )
    ).toEqual([200, 409])
    const winner = results[0]?.ok ? first : second
    const other = winner === first ? second : first
    expect((await post(other, Command.cases.Claim.make({ lot: 2, name: 'Lee' }))).status).toBe(200)
    expect(
      (await post(winner, Command.cases.Work.make({ lot: 1, cell: 0, tool: 'reel', pattern: 'straight' }))).status
    ).toBe(200)
    expect((await post(winner, Command.cases.Equip.make({ tool: 'watering-can' }))).status).toBe(200)
    expect(
      (await post(winner, Command.cases.Work.make({ lot: 1, cell: 0, tool: 'reel', pattern: 'straight' }))).status
    ).toBe(409)
    const worked = await post(
      winner,
      Command.cases.Work.make({ lot: 1, cell: 0, tool: 'watering-can', pattern: 'straight' })
    )
    expect(await worked.json()).toMatchObject({ receipt: { gross: 0, cost: 0, bonus: 0 } })
    expect((await post(winner, Command.cases.Equip.make({ tool: null }))).status).toBe(200)
    expect(await (await get(winner)).json()).toMatchObject({ player: { equipped: null } })
    expect(
      (await post(winner, Command.cases.Work.make({ lot: 1, cell: 1, tool: 'watering-can', pattern: 'straight' })))
        .status
    ).toBe(409)
    expect((await post(winner, Command.cases.Equip.make({ tool: 'watering-can' }))).status).toBe(200)
    expect(await (await get(winner)).json()).toMatchObject({ player: { equipped: 'watering-can' } })
    const response = await get(other)
    const raw = await response.text()
    expect(raw).not.toContain('credential')
    expect(raw).not.toContain(first)
    expect(raw).not.toContain(second)
    const view = Option.getOrThrow(readText(raw))
    expect(view.player?.lot).toBe(2)
    expect(view.lots[0]).toMatchObject({ id: 1, bot: false, patches: expect.any(Array) })
    expect(view.lots[0]?.patches[0]).toMatchObject({ height: 25, definition: 100 })
    expect(view.lots[1]).toMatchObject({ id: 2, bot: false, name: 'Lee' })
    const walk = (cookie: string, data: unknown) =>
      runtime.dispatchFetch(endpoint + '/presence', {
        method: 'POST',
        headers: { cookie },
        body: Option.getOrThrow(Schema.encodeOption(Schema.fromJsonString(Schema.Unknown))(data)),
      })
    expect((await walk(await visit(), { x: 0, z: 0, yaw: 0 })).status).toBe(403)
    expect((await walk(winner, { x: null, z: 0, yaw: 0 })).status).toBe(400)
    expect((await walk(winner, { x: 4, z: 5, yaw: 1, lot: 2, name: 'Spoof' })).status).toBe(200)
    expect(await (await walk(winner, { x: 6, z: 7, yaw: 0 })).json()).toEqual({ peers: [] })
    const peers = [{ lot: 1, name: winner === first ? 'Ada' : 'Rae', x: 6, z: 7, yaw: 0 }]
    expect(await (await runtime.dispatchFetch(endpoint + '/presence')).json()).toEqual({ peers })
    expect(await (await walk(other, { x: 2, z: 2, yaw: 2 })).json()).toEqual({ peers })
    for (let lot = 3; lot <= 7; lot += 1) {
      const guest = await visit()
      const claim = await post(guest, Command.cases.Claim.make({ lot, name: `Neighbor ${lot}` }))
      expect(claim.status).toBe(200)
    }

    const expanded = Option.getOrThrow(readView(await (await get(other)).json()))
    expect(expanded.lots).toHaveLength(9)
    expect(expanded.lots[6]).toMatchObject({ id: 7, name: 'Neighbor 7', bot: false })
    expect(expanded.lots[7]).toMatchObject({ id: 8, bot: true })
    expect((await post(winner, Command.cases.Claim.make({ lot: 8, name: 'Returning' }))).status).toBe(200)
    const returning = await get(winner)
    const recovered = Option.getOrThrow(readView(await returning.json()))
    expect(recovered.player).toMatchObject({ lot: 1, equipped: 'watering-can' })
    expect(recovered.lots).toHaveLength(9)
    expect(recovered.lots[7]?.bot).toBe(true)
  } finally {
    await runtime.dispose()
  }
})
