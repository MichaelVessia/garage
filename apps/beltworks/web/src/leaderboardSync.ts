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
    totalDelivered: number
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
      const { visiting, revision, totalDelivered, milestoneIndex, ascensions } = state()
      if (visiting || (totalDelivered === 0 && milestoneIndex === 0 && ascensions === 0)) {
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
