import * as Arr from 'effect/Array'

import type { ChatMessage } from '../../src/chat-model.ts'
import { chatLifetimeMs, recentChat } from '../../src/chat-model.ts'

// @effect-diagnostics asyncFunction:off -- Keep the cleanup alarm in the same transaction as the messages.
async function scheduleExpiry(tx: DurableObjectTransaction, messages: ReadonlyArray<ChatMessage>) {
  const first = messages[0]
  const alarm = await tx.getAlarm()
  if (first === undefined) {
    if (alarm !== null) {
      await tx.deleteAlarm()
    }
  } else if (alarm !== first.time + chatLifetimeMs) {
    await tx.setAlarm(first.time + chatLifetimeMs)
  }
}

export function readChat({ storage, now }: { storage: DurableObjectStorage; now: number }) {
  // @effect-diagnostics-next-line asyncFunction:off -- Durable Object storage retries the complete cleanup transaction.
  return storage.transaction(async (tx) => {
    const stored = (await tx.get<Array<ChatMessage>>('chat')) ?? []
    const messages = Arr.filter(stored, recentChat(now))
    if (messages.length < stored.length) {
      if (messages.length === 0) {
        await tx.delete('chat')
      } else {
        await tx.put('chat', messages)
      }
    }
    await scheduleExpiry(tx, messages)
    return { messages }
  })
}

export function sendChat({
  storage,
  owner,
  text,
  now,
}: {
  storage: DurableObjectStorage
  owner: { lot: number; name: string }
  text: string
  now: number
}) {
  // @effect-diagnostics-next-line asyncFunction:off -- Durable Object storage retries this Promise callback as one transaction.
  return storage.transaction(async (tx) => {
    const cooldown = 'chat-last:' + owner.lot
    const last = await tx.get<number>(cooldown)
    if (last !== undefined && now - last < 1000) {
      return { status: 429, body: { reason: 'chat-cooldown' } }
    }
    const messages = (await tx.get<Array<ChatMessage>>('chat')) ?? []
    const message = { ...owner, text, time: now, id: Math.max(now, (messages.at(-1)?.id ?? 0) + 1) }
    const recent = [...Arr.filter(messages, recentChat(now)).slice(-49), message]
    await tx.put({ chat: recent, [cooldown]: now })
    await scheduleExpiry(tx, recent)
    return { status: 200, body: { messages: recent } }
  })
}
