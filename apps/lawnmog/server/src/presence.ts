import * as MutableHashMap from 'effect/MutableHashMap'
import * as Schema from 'effect/Schema'

export const Position = Schema.Struct({ x: Schema.Finite, z: Schema.Finite, yaw: Schema.Finite })
type Peer = typeof Position.Type & { lot: number; name: string }
export const presenceLifetime = 15_000

export class Presence {
  private readonly entries = MutableHashMap.empty<number, { peer: Peer; seen: number }>()
  readonly owners = MutableHashMap.empty<string, { lot: number; name: string }>()

  move(peer: Peer, now: number) {
    MutableHashMap.set(this.entries, peer.lot, { peer, seen: now })
  }

  peers(now: number, self?: number): Array<Peer> {
    const peers: Array<Peer> = []
    for (const [lot, { peer, seen }] of this.entries) {
      if (now - seen >= presenceLifetime) {
        MutableHashMap.remove(this.entries, lot)
      } else if (lot !== self) {
        peers.push(peer)
      }
    }
    return peers
  }
}
