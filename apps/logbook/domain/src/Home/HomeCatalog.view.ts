import * as Domain from '@alchemy.run/domain'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import * as Struct from 'effect/Struct'

import { PendingWork } from '../Asset/AddPendingWork.command.ts'
import { Asset } from '../Asset/Asset.aggregate.ts'
import { AssetId, PendingWorkId, ScheduleId, WarrantyId } from '../Asset/Asset.id.ts'
import { applyAssetMetadataPatch, AssetMetadata, assetMetadataKeys } from '../Asset/AssetMetadata.ts'
import { registeredMeter, updateMeter } from '../Asset/AssetMeter.ts'
import { CurrentActor } from '../CurrentActor.context.ts'
import { HOME_HOUSEHOLD_ID, HouseholdId } from '../Household.id.ts'
import { Session } from '../Session.middleware.ts'
import { Cents, DueThresholds, IsoDate, Meter, SpecEntry } from '../Values.ts'

const CatalogAsset = Schema.Struct({
  id: AssetId,
  ...AssetMetadata.fields,
  status: Schema.Literals(['active', 'retired']),
  meter: Schema.optionalKey(Meter),
  specs: Schema.Record(Schema.String, SpecEntry),
  schedules: Schema.Record(ScheduleId, Schema.Struct({ title: Schema.NonEmptyString, ...DueThresholds.fields })),
  pendingWork: Schema.optionalKey(Schema.Record(PendingWorkId, PendingWork)),
  warranties: Schema.Record(WarrantyId, Schema.Struct({ label: Schema.String, expiresOn: IsoDate })),
})
type CatalogAsset = typeof CatalogAsset.Type

const Catalog = Schema.Struct({
  assets: Schema.Record(AssetId, CatalogAsset),
  spendByYear: Schema.Record(Schema.String, Cents),
})
type Catalog = typeof Catalog.Type

const update = (state: Catalog, id: AssetId, change: (asset: CatalogAsset) => CatalogAsset): Catalog =>
  Record.modify(state.assets, id, change).pipe(
    Option.match({ onNone: () => state, onSome: (assets) => ({ ...state, assets }) })
  )

const spend = (state: Catalog, date: IsoDate, cost?: number): Catalog => {
  if (cost === undefined) {
    return state
  }
  const year = Str.slice(0, 4)(date)
  const total = state.spendByYear[year] ?? 0
  return { ...state, spendByYear: { ...state.spendByYear, [year]: total + cost } }
}

export class HomeCatalog extends Domain.View(
  'HomeCatalog',
  {
    from: [Asset],
    key: HouseholdId,
    keyOf: { Asset: () => HOME_HOUSEHOLD_ID },
    version: 2,
    middleware: [Session],
    state: Catalog,
    initial: { assets: {}, spendByYear: {} },
    evolve: {
      AssetRegistered: (state, event, { source }) => ({
        ...state,
        assets: {
          ...state.assets,
          [source.id]: {
            ...Struct.pick(event, assetMetadataKeys),
            id: source.id,
            status: 'active',
            ...registeredMeter(event),
            specs: {},
            schedules: {},
            warranties: {},
          },
        },
      }),
      AssetUpdated: (state, patch, { source }) =>
        update(state, source.id, (asset) => applyAssetMetadataPatch({ asset, patch })),
      AssetRetired: (state, _, { source }) => update(state, source.id, (asset) => ({ ...asset, status: 'retired' })),
      MeterRecorded: (state, { reading }, { source }) =>
        update(state, source.id, (asset) => updateMeter({ asset, reading: Option.some(reading) })),
      ScheduleAdded: (state, event, { source }) =>
        update(state, source.id, (asset) => ({
          ...asset,
          schedules: {
            ...asset.schedules,
            [event.scheduleId]: Struct.pick(event, ['title', 'nextDueOn', 'nextDueMeter']),
          },
        })),
      ScheduleArchived: (state, { scheduleId }, { source }) =>
        update(state, source.id, (asset) => ({
          ...asset,
          schedules: Record.remove(asset.schedules, scheduleId),
        })),
      TaskCompleted: (state, event, { source }) => {
        const updated = update(state, source.id, (asset) => ({
          ...updateMeter({ asset, reading: Option.fromUndefinedOr(event.meterAdvancedTo) }),
          schedules: Record.modify(asset.schedules, event.scheduleId, ({ title }) => ({
            title,
            ...Struct.pick(event, ['nextDueOn', 'nextDueMeter']),
          })).pipe(Option.getOrElse(() => asset.schedules)),
        }))
        return spend(updated, event.completedOn, event.costCents)
      },
      PendingWorkAdded: (state, event, { source }) =>
        update(state, source.id, (asset) => ({
          ...asset,
          pendingWork: { ...asset.pendingWork, [event.workId]: Struct.omit(event, ['_tag']) },
        })),
      PendingWorkCompleted: (state, { workId, meterAdvancedTo, completedOn, costCents }, { source }) =>
        spend(
          update(state, source.id, (asset) => ({
            ...updateMeter({ asset, reading: Option.fromUndefinedOr(meterAdvancedTo) }),
            pendingWork: Record.remove(asset.pendingWork ?? {}, workId),
          })),
          completedOn,
          costCents
        ),
      ServiceLogged: (state, event, { source }) =>
        spend(
          update(state, source.id, (asset) =>
            updateMeter({ asset, reading: Option.fromUndefinedOr(event.meterAdvancedTo) })
          ),
          event.performedOn,
          event.costCents
        ),
      WarrantyRecorded: (state, { warrantyId, label, expiresOn }, { source }) =>
        update(state, source.id, (asset) => ({
          ...asset,
          warranties: { ...asset.warranties, [warrantyId]: { label, expiresOn } },
        })),
      WarrantyRemoved: (state, { warrantyId }, { source }) =>
        update(state, source.id, (asset) => ({
          ...asset,
          warranties: Record.remove(asset.warranties, warrantyId),
        })),
      SpecSet: (state, event, { source }) =>
        update(state, source.id, (asset) => ({
          ...asset,
          specs: { ...asset.specs, [event.key]: Struct.omit(event, ['_tag']) },
        })),
      SpecRemoved: (state, { key }, { source }) =>
        update(state, source.id, (asset) => ({ ...asset, specs: Record.remove(asset.specs, key) })),
    },
  },
  {
    description:
      'Read the household’s assets, maintenance due thresholds, pending work, warranty expirations, and annual spend.',
  }
) {}

export const HomeCatalogLive = HomeCatalog.toLayer(Effect.succeed(() => Effect.asVoid(CurrentActor)))
