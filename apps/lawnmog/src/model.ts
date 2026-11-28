import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

const percent = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))
const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const LotId = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const PlayerName = Schema.Trimmed.check(Schema.isPattern(/^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,19}$/u))
const Pattern = Schema.Literals(['straight', 'crosscut', 'diagonal', 'checker'])
export type Pattern = typeof Pattern.Type

export const Season = Schema.Literals(['spring', 'summer', 'autumn', 'winter'])
export type Season = typeof Season.Type
export const Direction = Schema.Literals(['north', 'south', 'east', 'west'])
export type Direction = typeof Direction.Type

const cover = percent.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0)))
export const Lawn = Schema.Struct({
  weeds: cover,
  leaves: cover,
  moisture: percent,
  fertility: percent,
  height: percent,
  disease: percent,
  definition: percent,
  pattern: Pattern,
})
export type Lawn = typeof Lawn.Type

export const Tool = Schema.Literals([
  'reel',
  'watering-can',
  'push',
  'self-propelled',
  'riding',
  'hose',
  'sprinkler',
  'irrigation',
  'feed',
  'drop-spreader',
  'broadcast-spreader',
  'treat',
  'pump-sprayer',
  'backpack-sprayer',
  'rake',
  'handheld-blower',
  'backpack-blower',
])
export type Tool = typeof Tool.Type
export const gridSize = 8
const cell = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: gridSize * gridSize - 1 }))
const patches = Schema.Array(Lawn).check(Schema.isMinLength(64), Schema.isMaxLength(64))
const originalPlayer = { name: PlayerName, credential: Schema.String, energy: count, xp: count }
const bot = { name: Schema.String }
const clock = { tick: count, nextTickAt: count }
export const LegacyResident = Schema.TaggedUnion({ Bot: bot, Player: originalPlayer })
export const LegacyBlock = Schema.Struct({
  version: Schema.optionalKey(Schema.Never),
  ...clock,
  lots: Schema.Array(Schema.Struct({ id: LotId, resident: LegacyResident, lawn: Lawn })),
})
const wallet = { ...originalPlayer, coins: count, tools: Schema.Array(Tool) }
const turf = { lawn: Lawn, patches, sprinkler: Schema.NullOr(cell) }
export const V2Resident = Schema.TaggedUnion({ Bot: bot, Player: wallet })
export const V2Block = Schema.Struct({
  version: Schema.Literal(2),
  lots: Schema.Array(Schema.Struct({ id: LotId, resident: V2Resident, ...turf })),
  ...clock,
})
const quarter = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
const equipped = Schema.NullOr(Tool)
export type EquippedTool = typeof equipped.Type
const selection = { equipped, pattern: Pattern }
const inspectionResult = Schema.Literals(['pending', 'passed', 'cited'])
export const starterLeafBag = 25
const baggedLeaves = count.pipe(Schema.withDecodingDefaultKey(Effect.succeed(starterLeafBag)))
const lastDelivery = Schema.optionalKey(
  Schema.Struct({ id: count, sender: PlayerName, amount: count, senderLot: LotId, sourceCell: cell, landingCell: cell })
)
const ownerInspection = Schema.Struct({
  eligibleTick: Schema.NullOr(count),
  failures: count,
  lastFine: count,
})
export const Resident = Schema.TaggedUnion({
  Bot: bot,
  Player: {
    ...wallet,
    lastDelivery,
    baggedLeaves,
    inspection: ownerInspection.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({ eligibleTick: null, failures: 0, lastFine: 0 }))
    ),
    ...selection,
    quarter,
    automaticWatering: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
    paidCells: Schema.Array(cell),
    mowed: Schema.Array(cell),
  },
})
const pileAddress = { id: count, cell, senderLot: LotId }
const returnPile = Schema.Struct({ ...pileAddress, amount: percent })
const returnPiles = Schema.Array(returnPile)
const Lot = Schema.Struct({
  returnPiles: Schema.optionalKey(returnPiles),
  lastPileId: Schema.optionalKey(count),
  id: LotId,
  resident: Resident,
  lastResult: inspectionResult.pipe(Schema.withDecodingDefaultKey(Effect.succeed('pending'))),
  ...turf,
})
export type Lot = typeof Lot.Type

export const V3Block = Schema.Struct({
  version: Schema.Literal(3),
  lots: Schema.Array(Lot),
  ...clock,
})
const estate = { karenAnger: cover, estateLeaves: count.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))) }
export const BlockState = Schema.Struct({
  ...V3Block.fields,
  version: Schema.Literal(4),
  ...estate,
  yardWinner: Schema.NullOr(LotId).pipe(Schema.optionalKey),
})
export type BlockState = typeof BlockState.Type

export const Command = Schema.TaggedUnion({
  Claim: { lot: LotId, name: PlayerName },
  LaunchLeaves: { destination: count },
  SweepLeaves: { cell },
  ReturnPile: pileAddress,
  Work: { lot: LotId, cell, tool: Tool, pattern: Pattern, direction: Schema.optionalKey(Direction) },
  Equip: { tool: equipped },
  SetWatering: { enabled: Schema.Boolean },
  SetPattern: { pattern: Pattern },
  Buy: { tool: Tool },
})
export type Command = typeof Command.Type

const Weather = Schema.Literals(['sunny', 'overcast', 'rain'])
export type Weather = typeof Weather.Type
const LotView = Schema.Struct({
  returnPiles: returnPiles.pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
  id: LotId,
  name: Schema.String,
  bot: Schema.Boolean,
  appeal: percent,
  hoa: Schema.Struct({ compliant: Schema.Boolean, reading: Schema.String, lastResult: inspectionResult }).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({ compliant: true, reading: '', lastResult: 'pending' as const }))
  ),
  ...turf,
})
export type LotView = typeof LotView.Type

export const BlockView = Schema.Struct({
  lots: Schema.Array(LotView),
  hoa: Schema.Struct({ nextInspectionAt: count, standard: Schema.String, remedy: Schema.String }).pipe(
    Schema.withDecodingDefaultKey(
      Effect.succeed({ nextInspectionAt: 0, standard: 'Waiting for the first inspection notice.', remedy: '' })
    )
  ),
  ...estate,
  yardWinner: Schema.NullOr(LotId).pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  nextJudgingAt: count.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
  nextSeasonAt: count.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
  season: Season.pipe(Schema.withDecodingDefaultKey(Effect.succeed('autumn'))),
  receipt: Schema.optionalKey(
    Schema.Struct({
      gross: count,
      cost: count,
      bonus: count,
      fine: Schema.optionalKey(count),
      leafDestination: Schema.optionalKey(count),
      leafAmount: Schema.optionalKey(count),
      leafCell: Schema.optionalKey(cell),
      leafSourceCell: Schema.optionalKey(cell),
    })
  ),
  weather: Weather,
  nextTickAt: count,
  player: Schema.NullOr(
    Schema.Struct({
      ...selection,
      lastDelivery,
      baggedLeaves,
      hoa: Schema.Struct({ nextFine: count, lastFine: count, failures: count }).pipe(
        Schema.withDecodingDefaultKey(Effect.succeed({ nextFine: 0, lastFine: 0, failures: 0 }))
      ),
      automaticWatering: Schema.Boolean,
      contract: Schema.Struct({ quarter, description: Schema.String, progress: count, target: count, bonus: count }),
      lot: LotId,
      energy: count,
      xp: count,
      coins: count,
      tools: Schema.Array(Tool),
    })
  ),
})
export type BlockView = typeof BlockView.Type

export const Rejection = Schema.Literals([
  'claim-taken',
  'claim-required',
  'not-owner',
  'pattern-locked',
  'no-change',
  'no-leaves',
  'lawn-full',
  'invalid-destination',
  'selection-mismatch',
  'tool-locked',
  'insufficient-coins',
  'already-owned',
])
export type Rejection = typeof Rejection.Type
