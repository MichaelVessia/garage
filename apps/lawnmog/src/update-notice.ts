import { watchUpdates } from './updates.ts'

declare const __LAWNMOG_BUILD_ID__: string

const notice = document.querySelector<HTMLElement>('#update-notice')
const reload = document.querySelector<HTMLButtonElement>('#update-reload')
const later = document.querySelector<HTMLButtonElement>('#update-later')
if (notice !== null && reload !== null && later !== null) {
  watchUpdates({
    currentVersion: __LAWNMOG_BUILD_ID__,
    onUpdate: () => {
      notice.hidden = false
    },
  })
  reload.onclick = () => window.location.reload()
  later.onclick = () => {
    notice.hidden = true
  }
}
