// @effect-diagnostics-next-line nodeBuiltinImport:off -- The runtime test needs an isolated storage directory.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { expect, it } from 'vitest'

import { ChatHistory, recentChat } from '../src/chat-model.ts'
import { Command } from '../src/model.ts'

const encode = Schema.encodeOption(Schema.fromJsonString(Schema.Unknown))
const history = Schema.decodeUnknownOption(ChatHistory)

// @effect-diagnostics asyncFunction:off -- Exercise HTTP sessions and restart the local Worker.
it('shares durable chat between residents and lets guests read', async () => {
  const build = await Bun.build({
    entrypoints: [new URL('../server/src/worker.ts', import.meta.url).pathname],
    external: ['cloudflare:workers'],
    target: 'browser',
  })
  const script = await build.outputs[0]?.text()
  if (script === undefined) {
    throw new Error('Worker build failed')
  }
  const options = {
    modules: true,
    script,
    compatibilityDate: '2026-11-27',
    durableObjects: { BLOCK: { className: 'Block', useSQLite: true } },
  }
  const directory = await mkdtemp(tmpdir() + '/lawnmog-chat-')
  const start = () => new Miniflare({ ...convertV4MiniflareOptions(options), resourcePersistencePath: directory })
  let runtime = start()
  try {
    const block = new URL('/api/block', await runtime.ready).href
    const chat = block + '/chat'
    const post = (url: string, cookie: string, body: unknown, origin = new URL(block).origin) =>
      runtime.dispatchFetch(url, { method: 'POST', headers: { cookie, origin }, body: Option.getOrThrow(encode(body)) })
    const visit = async () => {
      const response = await runtime.dispatchFetch(block)
      return Str.split(';')(response.headers.get('set-cookie') ?? '')[0]
    }
    const [ada, lee, guest] = await Promise.all([visit(), visit(), visit()])
    expect((await post(chat, '', { text: 'hello' })).status).toBe(401)
    expect((await post(chat, guest, { text: 'hello' })).status).toBe(403)
    for (const [cookie, lot, name] of [
      [ada, 1, 'Ada'],
      [lee, 2, 'Lee'],
    ] as const) {
      expect((await post(block, cookie, Command.cases.Claim.make({ lot, name }))).status).toBe(200)
    }
    expect((await post(chat, ada, { text: 'hello' }, 'https://elsewhere.test')).status).toBe(403)
    expect((await post(chat, ada, { text: '   ' })).status).toBe(400)
    expect((await post(chat, ada, { text: Str.repeat(201)('x') })).status).toBe(400)
    const [a, b] = await Promise.all([
      post(chat, ada, { text: ' <b>Hello</b> ', name: 'Lee', lot: 2 }),
      post(chat, lee, { text: 'Hi Ada' }),
    ])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect((await post(chat, ada, { text: 'again' })).status).toBe(429)
    const read = async () =>
      Option.getOrThrow(
        history(await (await runtime.dispatchFetch(new URL('/api/block/chat', await runtime.ready).href)).json())
      ).messages
    const messages = await read()
    expect(messages).toHaveLength(2)
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Ada', lot: 1, text: '<b>Hello</b>' }),
        expect.objectContaining({ name: 'Lee', lot: 2, text: 'Hi Ada' }),
      ])
    )
    await runtime.dispose()
    runtime = start()
    await runtime.ready
    expect(await read()).toEqual(messages)
  } finally {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)

it('expires a message exactly one hour after it was sent', () => {
  const sent = { id: 1, lot: 1, name: 'Lee', text: 'Hello', time: 1000 }
  expect(recentChat(sent.time + 3_599_999)(sent)).toBe(true)
  expect(recentChat(sent.time + 3_600_000)(sent)).toBe(false)
})
