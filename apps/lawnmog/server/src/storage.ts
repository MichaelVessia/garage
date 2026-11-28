import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { createBlock, fillOppositeHome, migrateBlock, migrateV2, migrateV3 } from '../../src/block.ts'
import { BlockState, LegacyBlock, V2Block, V3Block } from '../../src/model.ts'

const decodeBlock = Schema.decodeUnknownOption(BlockState)
const decodeV3 = Schema.decodeUnknownOption(V3Block)
const decodeV2 = Schema.decodeUnknownOption(V2Block)
const decodeLegacy = Schema.decodeUnknownOption(LegacyBlock)
export function loadBlock({ raw, now }: { raw: unknown; now: number }) {
  if (raw === undefined) {
    return { block: createBlock(now), save: true }
  }
  const current = decodeBlock(raw)
  if (Option.isSome(current)) {
    const block = fillOppositeHome(current.value)
    return { block, save: block !== current.value }
  }
  const v3 = decodeV3(raw)
  if (Option.isSome(v3)) {
    return { block: fillOppositeHome(migrateV3(v3.value)), save: true }
  }
  const v2 = decodeV2(raw)
  if (Option.isSome(v2)) {
    return { block: fillOppositeHome(migrateV2(v2.value)), save: true }
  }
  const old = decodeLegacy(raw)
  return Option.isSome(old) ? { block: fillOppositeHome(migrateBlock(old.value)), save: true } : undefined
}
