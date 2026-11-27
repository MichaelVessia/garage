import { Game, GridIndex, Item, OnTile, WorldPosition, createRuntime, enqueue, simulation } from '../src/index.ts'
import type { Command, Runtime } from '../src/index.ts'

const advance = (runtime: Runtime, count: number) => {
  for (let i = 0; i < count; i++) {
    runtime.tick(simulation)
  }
}
const place = (runtime: Runtime, ...cmds: Array<Command>) => {
  for (const cmd of cmds) {
    enqueue(cmd)(runtime)
  }
}
const belt = (gx: number, gy = 12): Command => ({ type: 'placeBuilding', kind: 'belt', gx, gy, dir: 'E' })
const extractor = { type: 'placeBuilding', kind: 'extractor', gx: 13, gy: 12, dir: 'E' } as const satisfies Command
const factory = () => {
  const r = createRuntime(0)
  place(r, extractor, belt(14), belt(15), belt(16))
  return r
}

function feed(runtime: Runtime, loads: ReadonlyArray<{ gx: number; gy: number; value: number }>) {
  const load = Game.System(
    'Test/Feed',
    {
      commands: Game.System.commands(Game.System.spawns(Item, OnTile, WorldPosition)),
      resources: { index: Game.System.writeResource(GridIndex) },
    },
    ({ commands, resources }) => {
      const index = resources.index.get()
      const items = { ...index.items }
      for (const { gx, gy, value } of loads) {
        items[`${gx},${gy}`] = commands.spawn(
          Game.Command.spawn(
            [Item, { value }],
            [OnTile, { gx, gy, fromDir: 'W', progress: 1000, prevProgress: 1000 }],
            [WorldPosition, { x: gx, y: gy }]
          )
        )
      }
      resources.index.set({ ...index, items })
    }
  )
  runtime.tick(Game.Schedule(load, Game.Schedule.applyDeferred()))
}

export const fixtures = { advance, belt, extractor, factory, feed, place }
