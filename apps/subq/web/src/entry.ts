import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { ApiLive, FetchWithCredentials } from './api.js'
import { ChangedUrl, ClickedLink, Model, init, update, view } from './main.js'

import './index.css'

const container = document.querySelector<HTMLElement>('#root')
if (container === null) {
  throw new Error('missing #root')
}

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container,
  resources: Layer.mergeAll(ApiLive, FetchWithCredentials),
  routing: {
    onUrlChange: (url) => ChangedUrl({ url }),
    onUrlRequest: (request) => ClickedLink({ request }),
  },
})

Runtime.run(application)
