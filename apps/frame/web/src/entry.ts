import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { Runtime } from 'foldkit'

import { ApiLive } from './api.js'
import { MissingRoot } from './errors.js'
import { Flags, Model, init, subscriptions, update } from './main.js'
import { view } from './view.js'

import './index.css'

const container = document.querySelector<HTMLElement>('#root')
if (container === null) {
  throw new MissingRoot()
}

const application = Runtime.makeElement({
  Flags,
  Model,
  flags: DateTime.now.pipe(Effect.map((now) => ({ now }))),
  init,
  update,
  view,
  subscriptions,
  container,
  resources: ApiLive,
})

Runtime.run(application)
