import { DurableObject } from 'cloudflare:workers'
import * as Arr from 'effect/Array'
import * as Clock from 'effect/Clock'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { transitionBlock, viewBlock } from '../../src/block.ts'
import { ChatInput, chatLimit } from '../../src/chat-model.ts'
import { Command, Resident } from '../../src/model.ts'
import { readChat, sendChat } from './chat.ts'
import { BlockStorageError, CredentialError, InvalidCommandBody } from './errors.ts'
import { Position, Presence } from './presence.ts'
import { loadBlock } from './storage.ts'

type Env = { BLOCK: DurableObjectNamespace<Block> }
const decodeCommand = Schema.decodeUnknownOption(Command)
const decodePosition = Schema.decodeUnknownOption(Position)
const tokenPattern = /(?:^|;\s*)lawnmog_player=([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})(?:;|$)/

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

const handle = Effect.fn('lawnmog.block.fetch')(function* (
  request: Request,
  storage: DurableObjectStorage,
  presence: Presence
) {
  const token = tokenPattern.exec(request.headers.get('Cookie') ?? '')?.[1]
  const url = new URL(request.url)
  const walking = url.pathname === '/api/block/presence'
  const chatting = url.pathname === '/api/block/chat'
  let text = ''
  let position = Option.none<typeof Position.Type>()
  let command = Option.none<Command>()
  if (request.method === 'POST') {
    const origin = request.headers.get('Origin')
    if (origin !== null && origin !== url.origin) {
      return reply({ reason: 'origin' }, 403)
    }
    if (token === undefined) {
      return reply({ reason: 'session-required' }, 401)
    }
    const raw = yield* Effect.tryPromise({ try: () => request.json(), catch: () => InvalidCommandBody.make({}) }).pipe(
      Effect.tapError((failure) => Effect.logDebug(failure)),
      Effect.orElseSucceed(() => null)
    )
    if (chatting) {
      const input = Schema.decodeUnknownOption(ChatInput)(raw)
      text = Option.isSome(input) ? Str.trim(input.value.text) : ''
      if (text.length === 0 || text.length > chatLimit) {
        return reply({ reason: 'invalid-message' }, 400)
      }
    } else if (walking) {
      position = decodePosition(raw)
    } else {
      command = decodeCommand(raw)
    }
    if (!chatting && (walking ? Option.isNone(position) : Option.isNone(command))) {
      return reply({ reason: 'invalid-command' }, 400)
    }
  } else if (request.method !== 'GET') {
    return reply({ reason: 'method' }, 405)
  }

  const credential =
    token === undefined
      ? Option.none()
      : yield* Effect.tryPromise({
          try: () => crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
          catch: (cause) => CredentialError.make({ cause }),
        }).pipe(Effect.map((bytes) => Option.some(new Uint8Array(bytes).toHex())))
  const now = yield* Clock.currentTimeMillis
  const key = Option.getOrUndefined(credential)
  if (chatting && request.method === 'GET') {
    const history = yield* Effect.tryPromise({
      try: () => readChat({ storage, now }),
      catch: (cause) => BlockStorageError.make({ cause }),
    })
    return reply(history)
  }
  if (walking || chatting) {
    let owner = key === undefined ? undefined : Option.getOrUndefined(MutableHashMap.get(presence.owners, key))
    if (request.method === 'POST') {
      if (owner === undefined && key !== undefined) {
        const raw = yield* Effect.tryPromise({
          try: () => storage.get<unknown>('block'),
          catch: (cause) => BlockStorageError.make({ cause }),
        })
        const stored = loadBlock({ raw, now })
        const lot = Option.getOrUndefined(
          Arr.findFirst(
            stored?.block.lots ?? [],
            (entry) => Resident.guards.Player(entry.resident) && entry.resident.credential === key
          )
        )
        if (lot !== undefined) {
          owner = { lot: lot.id, name: lot.resident.name }
          MutableHashMap.set(presence.owners, key, owner)
        }
      }
      if (owner === undefined) {
        return reply({ reason: 'claim-required' }, 403)
      }
      if (chatting) {
        const sender = owner
        const result = yield* Effect.tryPromise({
          try: () => sendChat({ storage, owner: sender, text, now }),
          catch: (cause) => BlockStorageError.make({ cause }),
        })
        return reply(result.body, result.status)
      }
      if (Option.isSome(position)) {
        presence.move({ ...position.value, ...owner }, now)
      }
    }
    return reply({ peers: presence.peers(now, owner?.lot) })
  }
  const response = yield* Effect.tryPromise({
    try: () =>
      storage.transaction((tx) =>
        tx.get<unknown>('block').then((stored) => {
          const decoded = loadBlock({ raw: stored, now })
          if (decoded === undefined) {
            return reply({ reason: 'invalid-block' }, 500)
          }
          const block = decoded.block
          const input = { block, now, credential }
          const result = transitionBlock(Option.isSome(command) ? { ...input, command: command.value } : input)
          const view = viewBlock({ block: result.block, credential })
          const response =
            result.kind === 'accepted'
              ? reply({ ...view, receipt: result.receipt })
              : reply({ reason: result.reason, view }, 409)
          return decoded.save || result.block !== block ? tx.put('block', result.block).then(() => response) : response
        })
      ),
    catch: (cause) => BlockStorageError.make({ cause }),
  })

  if (token === undefined) {
    const uuid = yield* Effect.sync(() => SecureRandom.uuidV4Unsafe())
    const secure = url.protocol === 'https:' ? '; Secure' : ''
    response.headers.append(
      'Set-Cookie',
      `lawnmog_player=${uuid}; Path=/api/block; Max-Age=31536000; HttpOnly; SameSite=Strict${secure}`
    )
  }
  return response
})

export class Block extends DurableObject<Env> {
  private readonly presence = new Presence()
  public override alarm(): Promise<void> {
    // ast-grep-ignore: no-runpromise-in-effect
    return Effect.runPromise(Clock.currentTimeMillis)
      .then((now) => readChat({ storage: this.ctx.storage, now }))
      .then(() => undefined)
  }
  public override fetch(request: Request): Promise<Response> {
    // The Workers runtime calls this method with a native Request.
    // ast-grep-ignore: no-runpromise-in-effect
    return Effect.runPromise(
      handle(request, this.ctx.storage, this.presence).pipe(
        Effect.tapError((failure) => Effect.logError(failure)),
        Effect.orElseSucceed(() => reply({ reason: 'block-unavailable' }, 503))
      )
    )
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    if (!['/api/block', '/api/block/presence', '/api/block/chat'].includes(new URL(request.url).pathname)) {
      return reply({ reason: 'not-found' }, 404)
    }
    return env.BLOCK.getByName('clover-lane').fetch(request)
  },
}
