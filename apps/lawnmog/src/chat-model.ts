import * as Schema from 'effect/Schema'

export const chatLimit = 200
export const ChatInput = Schema.Struct({ text: Schema.String })
export const ChatMessage = Schema.Struct({
  id: Schema.Int,
  lot: Schema.Int,
  name: Schema.String,
  text: Schema.String,
  time: Schema.Int,
})
export type ChatMessage = typeof ChatMessage.Type
export const ChatHistory = Schema.Struct({ messages: Schema.Array(ChatMessage) })

export const chatLifetimeMs = 60 * 60 * 1000
export const recentChat = (now: number) => (message: ChatMessage) => message.time + chatLifetimeMs > now
