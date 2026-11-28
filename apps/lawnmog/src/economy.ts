import { gridSize } from './model.ts'
import type { Tool } from './model.ts'

interface Equipment {
  readonly name: string
  readonly description: string
  readonly price: number
  // oxlint-disable-next-line enfect/prefer-option-over-null -- The public catalog uses null for starter tools.
  readonly requires: Tool | null
  readonly cost: number
}

export const toolCatalog: Record<Tool, Equipment> = {
  rake: {
    name: 'Leaf rake',
    description: 'Bag leaves for free. Save them to send to a neighbor in any season.',
    price: 0,
    requires: null,
    cost: 0,
  },
  'handheld-blower': {
    name: 'Handheld leaf blower',
    description:
      'Sweep a 3 × 3 area into your bag. Choose a neighbor to send up to 25 leaves with the same control. Each blast costs 1 coin.',
    price: 60,
    requires: 'rake',
    cost: 1,
  },
  'backpack-blower': {
    name: 'Backpack leaf blower',
    description:
      'Sweep a 5 × 5 area into your bag. Choose a neighbor to send up to 65 leaves with the same control. Each blast costs 2 coins.',
    price: 260,
    requires: 'handheld-blower',
    cost: 2,
  },
  reel: {
    name: 'Reel mower',
    description: 'Cut one tall patch per pass by hand. No fuel cost.',
    price: 0,
    requires: null,
    cost: 0,
  },
  push: {
    name: 'Gas push mower',
    description: 'Cut two patches in a row. Gas costs 1 coin per effective pass.',
    price: 40,
    requires: 'reel',
    cost: 1,
  },
  'self-propelled': {
    name: 'Self-propelled mower',
    description: 'Cut three patches in a row. Gas costs 2 coins per effective pass.',
    price: 240,
    requires: 'push',
    cost: 2,
  },
  riding: {
    name: 'Riding mower',
    description: 'Cut a 3 × 3 area. Gas costs 3 coins per effective pass.',
    price: 800,
    requires: 'self-propelled',
    cost: 3,
  },
  'watering-can': {
    name: 'Watering can',
    description: 'Use the rain barrel to water one dry patch for free.',
    price: 0,
    requires: null,
    cost: 0,
  },
  hose: {
    name: 'Garden hose',
    description: 'Water three patches in a row for 1 coin per effective pass.',
    price: 32,
    requires: 'watering-can',
    cost: 1,
  },
  sprinkler: {
    name: 'Sprinkler',
    description: 'Water a 3 × 3 area for 2 coins. Leave it there to water for 2 coins per dry tick while funds last.',
    price: 180,
    requires: 'hose',
    cost: 2,
  },
  irrigation: {
    name: 'Irrigation',
    description:
      'Automatically water the whole lawn for 5 coins per dry tick while funds last. Replaces sprinkler watering.',
    price: 650,
    requires: 'sprinkler',
    cost: 5,
  },
  feed: {
    name: 'Hand fertilizer scoop',
    description:
      'Add 8 fertility to one patch for 1 coin. Grass uses more nutrients in spring and summer. Aim for 72%.',
    price: 0,
    requires: null,
    cost: 1,
  },
  'drop-spreader': {
    name: 'Drop spreader',
    description:
      'Add 16 fertility per patch in a strip three patches wide. Fertilizer costs 2 coins per effective pass.',
    price: 90,
    requires: 'feed',
    cost: 2,
  },
  'broadcast-spreader': {
    name: 'Broadcast spreader',
    description: 'Add 24 fertility per patch across a 3 × 3 area. Fertilizer costs 3 coins per effective pass.',
    price: 360,
    requires: 'drop-spreader',
    cost: 3,
  },
  treat: {
    name: 'Spot treatment bottle',
    description: 'Remove 8 disease from one patch for 1 coin. Wet or nutrient-poor grass develops disease faster.',
    price: 0,
    requires: null,
    cost: 1,
  },
  'pump-sprayer': {
    name: 'Pump sprayer',
    description:
      'Remove 18 disease per patch in a strip three patches wide. Treatment costs 2 coins per effective pass.',
    price: 110,
    requires: 'treat',
    cost: 2,
  },
  'backpack-sprayer': {
    name: 'Backpack sprayer',
    description: 'Remove 32 disease per patch across a 3 × 3 area. Treatment costs 3 coins per effective pass.',
    price: 420,
    requires: 'pump-sprayer',
    cost: 3,
  },
}

export function quarterOf(cell: number): number {
  return (cell % gridSize >= gridSize / 2 ? 1 : 0) + (cell >= gridSize ** 2 / 2 ? 2 : 0)
}
