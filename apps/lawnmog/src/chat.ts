import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { addressOf } from './block.ts'
import { ChatHistory, ChatInput, chatLifetimeMs, chatLimit, recentChat } from './chat-model.ts'
import type { ChatMessage } from './chat-model.ts'
import { requestChat } from './client.ts'

import './chat.css'

type ChatPanel = {
  button: HTMLButtonElement
  log: HTMLElement
  info: HTMLElement
  form: HTMLFormElement
  input: HTMLInputElement
  closeButton: HTMLButtonElement
  stage: HTMLElement
  setActive(active: boolean): void
  canSend(): boolean
}

const decodeHistory = Schema.decodeUnknownOption(ChatHistory)
const encodeMessage = Schema.encodeOption(Schema.fromJsonString(ChatInput))

export function createChat(panel: ChatPanel) {
  let shown: ReadonlyArray<ChatMessage> = []
  let expiry = 0
  let revision = 0
  let loading = false
  let sending = false
  let readFailed = false
  panel.input.maxLength = chatLimit

  function updateAccess() {
    panel.form.hidden = panel.closeButton.hidden === true || !panel.canSend()
    if (!readFailed && panel.closeButton.hidden === false) {
      if (!panel.canSend()) {
        panel.info.textContent = 'Claim a lawn to send messages.'
      } else if (panel.info.textContent === 'Claim a lawn to send messages.') {
        panel.info.textContent = ''
      }
    }
  }

  function close() {
    if (panel.closeButton.hidden === true) {
      return
    }
    panel.closeButton.hidden = true
    panel.button.hidden = false
    panel.button.setAttribute('aria-expanded', 'false')
    panel.input.value = ''
    if (!readFailed) {
      panel.info.textContent = ''
    }
    updateAccess()
    panel.setActive(false)
    const game = panel.stage.querySelector('canvas') ?? panel.stage
    game.focus()
    panel.log.scrollTop = panel.log.scrollHeight
  }

  function open() {
    if (panel.stage.contains(document.pointerLockElement)) {
      document.exitPointerLock()
    }
    panel.setActive(true)
    panel.closeButton.hidden = false
    panel.button.hidden = true
    panel.button.setAttribute('aria-expanded', 'true')
    updateAccess()
    if (panel.canSend()) {
      panel.input.focus()
    } else {
      panel.log.focus()
    }
    panel.log.scrollTop = panel.log.scrollHeight
    refresh()
  }

  function render(messages: ReadonlyArray<ChatMessage>) {
    const now = performance.timeOrigin + performance.now()
    const fresh = Arr.filter(messages, recentChat(now))
    if (
      fresh.length === shown.length &&
      Arr.every(fresh, (message, i) => message.id === shown[i]?.id && message.time === shown[i]?.time)
    ) {
      return
    }
    shown = fresh
    window.clearTimeout(expiry)
    const first = fresh[0]
    if (first !== undefined) {
      expiry = window.setTimeout(() => render(shown), Math.ceil(first.time + chatLifetimeMs - now))
    }
    const atBottom = panel.log.scrollTop + panel.log.clientHeight >= panel.log.scrollHeight - 8
    panel.log.replaceChildren(
      ...Arr.map(fresh, (message) => {
        const item = document.createElement('li')
        const author = document.createElement('strong')
        author.textContent = `${message.name} · ${addressOf(message.lot)}`
        item.append(author, document.createTextNode(` ${message.text}`))
        return item
      })
    )
    if (panel.closeButton.hidden === true || atBottom) {
      panel.log.scrollTop = panel.log.scrollHeight
    }
  }
  function renderHistory(raw: unknown) {
    const history = decodeHistory(raw)
    if (Option.isNone(history)) {
      throw new Error('Invalid chat history')
    }
    render(history.value.messages)
  }
  function refresh() {
    if (loading || document.hidden) {
      return
    }
    const started = revision
    loading = true
    void requestChat()
      .then(({ response, raw }) => {
        if (!response.ok) {
          throw new Error('Chat unavailable')
        }
        if (revision === started) {
          renderHistory(raw)
        }
        if (readFailed) {
          panel.info.textContent = ''
          readFailed = false
          updateAccess()
        }
      })
      .catch(() => {
        readFailed = true
        panel.info.textContent = 'Chat is reconnecting.'
      })
      .finally(() => {
        loading = false
      })
  }
  panel.form.onsubmit = (event) => {
    event.preventDefault()
    const text = Str.trim(panel.input.value)
    if (text.length === 0 || sending || !panel.canSend()) {
      return
    }
    const body = encodeMessage({ text })
    if (Option.isNone(body)) {
      panel.info.textContent = 'Check your message and try again.'
      return
    }
    sending = true
    panel.input.readOnly = true
    void requestChat(body.value)
      .then(({ response, raw }) => {
        if (response.ok) {
          revision += 1
          renderHistory(raw)
          if (panel.input.value !== '') {
            close()
          }
        } else {
          panel.info.textContent =
            response.status === 429 ? 'Wait a moment before sending again.' : 'Message could not be sent.'
        }
      })
      .catch(() => {
        panel.info.textContent = 'Connection lost. Check chat before sending again.'
      })
      .finally(() => {
        sending = false
        panel.input.readOnly = false
      })
  }
  panel.button.onclick = open
  panel.closeButton.onclick = close
  document.addEventListener('keydown', (event) => {
    if (panel.closeButton.hidden === true || event.isComposing) {
      return
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      panel.log.scrollTop += (event.key === 'PageUp' ? -1 : 1) * panel.log.clientHeight
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  })
  document.addEventListener('visibilitychange', () => {
    render(shown)
    refresh()
  })
  refresh()
  window.setInterval(refresh, 3000)
  return { open, close, updateAccess }
}
