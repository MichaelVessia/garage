import { Clock, Result } from '@typeonce/ritmo'
import * as ER from 'effect/Result'
import * as S from 'effect/Schema'

import { CommandRequested, CommandQueue, Game, initial, step, Time } from './model.ts'
import type { Command } from './model.ts'
import { savedBoard } from './save.ts'
import { advanceBelts, positions, processCommands, runCombiners, runExtractors, setup } from './systems.ts'

export * from './model.ts'
export * from './economy.ts'

export const simulation = Game.Schedule(
  Clock.system(Game, { name: 'Beltworks/AdvanceTime', resource: Time }),
  processCommands,
  Game.Schedule.applyDeferred(),
  runExtractors,
  runCombiners,
  advanceBelts,
  positions,
  Game.Schedule.applyDeferred()
)
export const initialResources = () => ({
  Time: Clock.start(step),
  Progression: initial,
  CommandQueue: [],
  GridIndex: { veins: {}, buildings: {}, items: {} },
})
export const generate = (seed: number) => Game.Schedule(setup(seed), Game.Schedule.applyDeferred())
const blank = () => {
  const made = Game.Runtime.make({ services: Game.Runtime.services(), resources: initialResources() })
  if (!made.ok) {
    throw new Error('Invalid initial Beltworks resources')
  }
  return made.value
}
export type Runtime = ReturnType<typeof blank>
export function createRuntime(seed: number) {
  const runtime = blank()
  runtime.tick(generate(seed))
  return runtime
}
const collect = Game.Schedule(
  Game.System(
    'Beltworks/Enqueue',
    {
      resources: { queue: Game.System.writeResource(CommandQueue) },
      events: { requested: Game.System.readEvent(CommandRequested) },
    },
    ({ events, resources }) => {
      resources.queue.set([...resources.queue.get(), ...events.requested.all()])
    }
  )
)
export const enqueue = (command: Command) => (runtime: Runtime) => {
  runtime.send(CommandRequested, command)
  runtime.tick(collect)
}
const fields = S.Record(S.String, S.Unknown)
export const BeltworksSaveSchema = S.Struct({
  version: S.Literal(3),
  gameVersion: S.Int,
  nextEntity: S.Int,
  entities: S.Array(S.Struct({ id: S.Int, components: fields })),
  resources: S.Struct({
    'Beltworks/Time': fields,
    'Beltworks/CommandQueue': S.Array(fields),
    'Beltworks/Progression': fields,
    'Beltworks/GridIndex': fields,
  }),
  relations: fields,
  machines: fields,
  nextStates: fields,
  scopes: fields,
})
export function exportSave(runtime: Runtime) {
  const snapshot = runtime.snapshot()
  if (!snapshot.ok) {
    throw new Error('Could not encode Beltworks save')
  }
  return snapshot.value
}
export function createRuntimeFromSave(save: unknown) {
  const decoded = S.decodeUnknownResult(BeltworksSaveSchema)(save)
  if (ER.isFailure(decoded)) {
    return Result.failure('Invalid Beltworks save')
  }
  const runtime = blank()
  const restored = runtime.restore(decoded.success)
  if (!restored.ok) {
    return restored
  }
  const board = runtime.inspect(savedBoard)
  return board.valid && board.count === decoded.success.entities.length
    ? Result.success(runtime)
    : Result.failure('Invalid Beltworks board index or layout')
}

// Apply player edits while production is paused.
export const applyEdits = Game.Schedule(processCommands, Game.Schedule.applyDeferred())
