import { leaderboardEligible } from '@garage/beltworks-domain'
import * as Hash from 'effect/Hash'

const materials = ['Amber', 'Brass', 'Cobalt', 'Copper', 'Iron', 'Jade', 'Mint', 'Silver']
const mascots = ['Anvil', 'Badger', 'Finch', 'Gear', 'Hare', 'Lynx', 'Otter', 'Wren']

export function defaultCallsign(playerId: string) {
  const hash = Hash.string(playerId) >>> 0
  return materials[hash % materials.length] + ' ' + mascots[Math.floor(hash / materials.length) % mascots.length]
}

export function leaderboardSync({
  state,
  post,
}: {
  state: () => {
    visiting: boolean
    revision: number
    milestoneIndex: number
    ascensions: number
  }
  post: () => Promise<void>
}) {
  let synced = -1
  let lastAttempt = -Infinity
  let pending = Promise.resolve()
  return (periodic = false) => {
    const attempt = pending.then(() => {
      const current = state()
      const { revision } = current
      if (current.visiting || !leaderboardEligible(current)) {
        return
      }
      const now = performance.now()
      if (revision === synced || (periodic && now - lastAttempt < 30_000)) {
        return
      }
      lastAttempt = now
      return post().then(() => {
        synced = revision
      })
    })
    pending = attempt.catch(() => {})
    return attempt
  }
}
