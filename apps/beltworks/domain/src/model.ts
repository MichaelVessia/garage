import { Clock, Descriptor, Schema as Ritmo } from '@typeonce/ritmo'
import * as Effect from 'effect/Effect'
import * as Fn from 'effect/Function'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

export const columns = 36
export const rows = 26
export const TILE_PROGRESS_MAX = 1000
export const step = Clock.hz(60)
const natural = S.Int.check(S.isGreaterThanOrEqualTo(0))
const direction = S.Literals(['N', 'E', 'S', 'W'])
export type Direction = typeof direction.Type
export const clockwise = { N: 'E', E: 'S', S: 'W', W: 'N' } satisfies Record<Direction, Direction>
export const counterClockwise = { N: 'W', W: 'S', S: 'E', E: 'N' } satisfies Record<Direction, Direction>
export const opposite = { N: 'S', S: 'N', E: 'W', W: 'E' } satisfies Record<Direction, Direction>
export const offsets = { N: { gx: 0, gy: -1 }, S: { gx: 0, gy: 1 }, W: { gx: -1, gy: 0 }, E: { gx: 1, gy: 0 } }
const cellFields = { gx: natural.check(S.isLessThan(columns)), gy: natural.check(S.isLessThan(rows)) }
const cell = S.Struct(cellFields)
export type Cell = typeof cell.Type
export const key = ({ gx, gy }: Cell) => `${gx},${gy}`
export const neighbor =
  (dir: Direction) =>
  ({ gx, gy }: Cell) => ({ gx: gx + offsets[dir].gx, gy: gy + offsets[dir].gy })
const tier = S.Literals([0, 1, 2, 3])
export type BoardTier = typeof tier.Type
const bounds = [
  { minX: 12, maxX: 23, minY: 8, maxY: 17 },
  { minX: 9, maxX: 26, minY: 6, maxY: 19 },
  { minX: 5, maxX: 30, minY: 3, maxY: 22 },
  { minX: 0, maxX: columns - 1, minY: 0, maxY: rows - 1 },
] as const
export const boardBounds = (level: BoardTier) => bounds[level]
export const inBounds: { (cell: Cell, level: BoardTier): boolean; (level: BoardTier): (cell: Cell) => boolean } =
  Fn.dual(2, ({ gx, gy }: Cell, level: BoardTier) => {
    const { minX, maxX, minY, maxY } = boardBounds(level)
    return gx >= minX && gx <= maxX && gy >= minY && gy <= maxY
  })
export const toolUnlock = {
  belt: 0,
  extractor: 0,
  add: 1,
  splitter: 2,
  merger: 2,
  buffer: 5,
  tunnelIn: 3,
  tunnelOut: 3,
  mul: 4,
  filter: 5,
  sub: 6,
  beacon: 7,
  div: 8,
  trash: 6,
} as const
export const TUNNEL_MAX_SPAN = 5
export type BuildingAt = (cell: Cell) => Option.Option<{ kind: BuildingState['kind']; dir: Direction }>
export function findTunnelPartner({
  cell,
  facing,
  at,
  source = 'tunnelIn',
}: {
  cell: Cell
  facing: Direction
  at: BuildingAt
  source?: 'tunnelIn' | 'tunnelOut'
}) {
  const next = neighbor(source === 'tunnelIn' ? facing : opposite[facing])
  let cursor = cell
  for (let distance = 1; distance <= TUNNEL_MAX_SPAN; distance++) {
    cursor = next(cursor)
    const machine = at(cursor)
    if (
      Option.isSome(machine) &&
      machine.value.dir === facing &&
      (machine.value.kind === 'tunnelIn' || machine.value.kind === 'tunnelOut')
    ) {
      return machine.value.kind === source ? undefined : cursor
    }
  }
  return undefined
}
const op = S.Literals(['add', 'sub', 'mul', 'div'])
export type CombinerOp = typeof op.Type
export const BUFFER_CAPACITY = 24
const port = S.Literals([0, 1])
const building = S.Union([
  S.Struct({ kind: S.Literal('hub') }),
  S.Struct({ kind: S.Literal('extractor'), remainingTicks: S.Finite, surgeCount: natural, bonusPending: S.Boolean }),
  S.Struct({ kind: S.Literals(['belt', 'tunnelIn', 'tunnelOut']) }),
  S.Struct({ kind: S.Literal('merger'), nextInput: S.Literals([0, 1, 2]) }),
  S.Struct({
    kind: S.Literal('buffer'),
    storedValue: S.Option(natural),
    cooldownTicks: S.optionalKey(natural),
    count: natural.check(S.isLessThanOrEqualTo(BUFFER_CAPACITY)),
  }).check(S.makeFilter((b) => Option.isNone(b.storedValue) === (b.count === 0))),
  S.Struct({ kind: S.Literal('splitter'), nextPort: port }),
  S.Struct({
    kind: S.Literal('combiner'),
    op,
    slotA: S.Option(natural),
    slotB: S.Option(natural),
    remainingTicks: S.Finite,
  }),
  S.Struct({ kind: S.Literal('trash') }),
  S.Struct({ kind: S.Literal('filter'), targetValue: natural }),
  S.Struct({ kind: S.Literal('beacon'), fuelTicks: natural.check(S.isLessThanOrEqualTo(1800)) }),
])
export type BuildingState = typeof building.Type
const upgrade = S.Literals(['beltSpeed', 'extractorSpeed', 'combinerSpeed', 'hubValue', 'surge'])
const level = S.Int.check(S.isBetween({ minimum: 1, maximum: 15 }))
const specialLevel = S.Int.check(S.isBetween({ minimum: 1, maximum: 10 }))
const counts = S.Record(S.String, natural)
export type Upgrade = typeof upgrade.Type
const mutator = S.Literals(['standard', 'primeRush', 'highVelocity'])
export type Mutator = typeof mutator.Type
export const metaUpgradeLimits = {
  bootstrap: 5,
  masterySynergy: 5,
  beaconResonance: 3,
  veinRichness: 4,
  contractMastery: 4,
} as const
export type MetaUpgradeKey = keyof typeof metaUpgradeLimits
const metaUpgrade = S.Literals(['bootstrap', 'masterySynergy', 'beaconResonance', 'veinRichness', 'contractMastery'])
const rank = (key: MetaUpgradeKey) => natural.check(S.isLessThanOrEqualTo(metaUpgradeLimits[key]))
export const medalIds = [
  'firstDelivery',
  'multiLine',
  'underground',
  'overclocked',
  'blueprintArchitect',
  'throughputTitan',
  'ascended',
  'primeEngineer',
] as const
export type MedalId = (typeof medalIds)[number]
const meta = S.Struct({
  bestRunTicks: S.OptionFromOptionalKey(natural),
  medals: S.Array(S.Literals(medalIds))
    .check(S.isUnique())
    .pipe(S.withDecodingDefaultKey(Effect.succeed([]))),
  ascensions: natural,
  cores: natural,
  totalCoresEarned: natural,
  seed: S.Int,
  mutator,
  metaUpgrades: S.Struct({
    bootstrap: rank('bootstrap'),
    masterySynergy: rank('masterySynergy'),
    beaconResonance: rank('beaconResonance'),
    veinRichness: rank('veinRichness'),
    contractMastery: rank('contractMastery'),
  }),
})
const progression = S.Struct({
  runTicks: natural.pipe(S.withDecodingDefaultKey(Effect.succeed(0))),
  meta,
  boardTier: tier,
  milestoneIndex: natural,
  delivered: counts,
  vault: counts,
  vaultRemainders: S.Record(S.String, natural.check(S.isLessThan(100))),
  rateByValue: counts,
  missionRateStart: S.optionalKey(natural),
  contractIndex: natural,
  contractDelivered: natural,
  totalDelivered: natural,
  sparks: natural,
  sparkCents: natural.check(S.isLessThan(100)),
  upgrades: S.Struct({
    beltSpeed: level,
    extractorSpeed: level,
    combinerSpeed: level,
    hubValue: specialLevel,
    surge: specialLevel,
  }),
  deliveryWindow: S.Array(S.Struct({ tick: natural, value: natural })),
})
export const initialMeta = {
  medals: [],
  ascensions: 0,
  cores: 0,
  totalCoresEarned: 0,
  seed: 0,
  mutator: 'standard',
  metaUpgrades: { bootstrap: 0, masterySynergy: 0, beaconResonance: 0, veinRichness: 0, contractMastery: 0 },
} as const
export const initial: typeof progression.Type = {
  runTicks: 0,
  meta: { ...initialMeta, bestRunTicks: Option.none() },
  boardTier: 0,
  milestoneIndex: 0,
  delivered: {},
  vault: {},
  vaultRemainders: {},
  rateByValue: {},
  contractIndex: 0,
  contractDelivered: 0,
  totalDelivered: 0,
  sparks: 0,
  sparkCents: 0,
  upgrades: { beltSpeed: 1, extractorSpeed: 1, combinerSpeed: 1, hubValue: 1, surge: 1 },
  deliveryWindow: [],
}
const commandCell = { gx: S.Finite, gy: S.Finite }
const placement = {
  kind: S.Literals(['extractor', 'belt', 'splitter', 'merger', 'buffer', 'trash', 'tunnelIn', 'tunnelOut', 'beacon']),
  dir: direction,
}
const combinerPlacement = { kind: S.Literal('combiner'), op, dir: direction }
const filterPlacement = { kind: S.Literal('filter'), targetValue: S.optionalKey(natural), dir: direction }
const offset = { dx: S.Int, dy: S.Int }
export const blueprintEntry = S.Union([
  S.Struct({ ...offset, ...placement }),
  S.Struct({ ...offset, ...combinerPlacement }),
  S.Struct({ ...offset, ...filterPlacement }),
])
export type BlueprintEntry = typeof blueprintEntry.Type
const placeCell = { type: S.Literal('placeBuilding'), ...commandCell }
const command = S.Union([
  S.Struct({ ...placeCell, ...placement }),
  S.Struct({ ...placeCell, ...combinerPlacement }),
  S.Struct({ ...placeCell, ...filterPlacement }),
  S.Struct({ type: S.Literal('setFilter'), ...commandCell, targetValue: natural }),
  S.Struct({ type: S.Literal('stampBlueprint'), originX: S.Int, originY: S.Int, entries: S.Array(blueprintEntry) }),
  S.Struct({ type: S.Literal('removeBuilding'), ...commandCell }),
  S.Struct({ type: S.Literal('rotateBuilding'), ...commandCell }),
  S.Struct({ type: S.Literal('buyUpgrade'), upgrade }),
  S.Struct({ type: S.Literal('expandBoard') }),
  S.Struct({ type: S.Literal('ascendBoard'), mutator }),
  S.Struct({ type: S.Literal('buyMetaUpgrade'), upgrade: metaUpgrade }),
  S.Struct({ type: S.Literal('resetBoard') }),
  S.Struct({ type: S.Literal('clearFloor') }),
  S.Struct({ type: S.Literal('removeArea'), minX: S.Int, maxX: S.Int, minY: S.Int, maxY: S.Int }),
])
export type Command = typeof command.Type
const codec = <A extends S.Top & { readonly DecodingServices: never; readonly EncodingServices: never }>(schema: A) => {
  const json = S.toCodecJson(schema)
  return { '~standard': S.toStandardSchemaV1(json)['~standard'], '~encode': json.pipe(S.flip, S.toStandardSchemaV1) }
}
export const GridCell = Descriptor.ConstructedComponent(codec(cell))('Beltworks/GridCell')
export const Facing = Descriptor.ConstructedComponent(codec(S.Struct({ dir: direction })))('Beltworks/Facing')
const value = S.Struct({ value: natural })
export const ResourceVein = Descriptor.ConstructedComponent(codec(value))('Beltworks/ResourceVein')
export const Building = Descriptor.ConstructedComponent(codec(building))('Beltworks/Building')
export const Item = Descriptor.ConstructedComponent(codec(value))('Beltworks/Item')
const progress = S.Finite.check(S.isBetween({ minimum: 0, maximum: TILE_PROGRESS_MAX }))
export const OnTile = Descriptor.ConstructedComponent(
  codec(S.Struct({ ...cellFields, progress, prevProgress: progress, fromDir: direction }))
)('Beltworks/OnTile')
export const WorldPosition = Descriptor.ConstructedComponent(codec(S.Struct({ x: S.Finite, y: S.Finite })))(
  'Beltworks/WorldPosition'
)
export const Time = Clock.resource('Beltworks/Time', step)
export const Progression = Descriptor.ConstructedResource(codec(progression))('Beltworks/Progression')
export const CommandQueue = Descriptor.ConstructedResource(command.pipe(S.Array, codec))('Beltworks/CommandQueue')
const ids = S.Record(S.String, natural)
export const GridIndex = Descriptor.ConstructedResource(codec(S.Struct({ veins: ids, buildings: ids, items: ids })))(
  'Beltworks/GridIndex'
)
export const ItemCrafted = Descriptor.Event<
  Cell & { readonly op: CombinerOp; readonly a: number; readonly b: number; readonly result: number }
>()('Beltworks/ItemCrafted')
export const ItemDelivered = Descriptor.Event<
  Cell & { readonly value: number; readonly matchedTarget: boolean; readonly sparksEarned: number }
>()('Beltworks/ItemDelivered')
export const MilestoneCompleted = Descriptor.Event<{ readonly milestoneIndex: number; readonly targetValue: number }>()(
  'Beltworks/MilestoneCompleted'
)
export const MedalUnlocked = Descriptor.Event<{ readonly medal: MedalId }>()('Beltworks/MedalUnlocked')
export const CommandRejected = Descriptor.Event<{ readonly reason: string }>()('Beltworks/CommandRejected')
export const CommandRequested = Descriptor.Event<Command>()('Beltworks/CommandRequested')
export const Game = Ritmo.bind(
  Ritmo.fragment({
    components: { GridCell, Facing, ResourceVein, Building, Item, OnTile, WorldPosition },
    resources: { Time, Progression, CommandQueue, GridIndex },
    events: { CommandRequested, ItemCrafted, ItemDelivered, MilestoneCompleted, CommandRejected, MedalUnlocked },
  }),
  Ritmo.defineRoot('Beltworks')
)
