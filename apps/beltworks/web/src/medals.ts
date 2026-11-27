import type { MedalId } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Rec from 'effect/Record'

export const medalInfo = {
  firstDelivery: ['First delivery', 'Complete milestone 1.'],
  multiLine: ['Multi-line', 'Deliver 3 values at 10/min each.'],
  underground: ['Underground', 'Move cargo through a tunnel.'],
  overclocked: ['Overclocked', 'Produce with two fueled beacons.'],
  contractRunner: ['Contract Runner', 'Complete 3 side contracts.'],
  throughputTitan: ['Throughput titan', 'Deliver 150 mission items/min.'],
  ascended: ['Ascended', 'Ascend for the first time.'],
  primeEngineer: ['Prime engineer', 'Ascend in either bonus mode.'],
} as const satisfies Record<MedalId, readonly [string, string]>

export function medalGrid({ grid, bonus }: { grid: HTMLElement; bonus: HTMLElement }) {
  const chips = Arr.map(Rec.toEntries(medalInfo), ([id, [name, description]]) => {
    const chip = document.createElement('li')
    chip.title = description
    const label = document.createElement('b')
    label.textContent = name
    const detail = document.createElement('small')
    detail.textContent = description
    chip.append(label, detail)
    grid.append(chip)
    return { id, chip }
  })
  return (owned: ReadonlyArray<MedalId>) => {
    bonus.textContent = '+' + owned.length * 3 + '% Sparks'
    for (const { id, chip } of chips) {
      chip.classList.toggle('earned', Arr.contains(owned, id))
      chip.setAttribute('aria-label', (Arr.contains(owned, id) ? 'Unlocked. ' : 'Locked. ') + chip.textContent)
    }
  }
}
