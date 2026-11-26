import * as Domain from '@alchemy.run/domain'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'

import { CurrentActor } from '../CurrentActor.context.ts'
import { Session } from '../Session.middleware.ts'
import { Cents, Meter, NamedLink, RetirementReason, SpecEntry, Warranty } from '../Values.ts'
import { ScheduleAdded } from './AddSchedule.command.ts'
import { Asset } from './Asset.aggregate.ts'
import { AssetId, LinkId, ScheduleId, WarrantyId } from './Asset.id.ts'
import { applyAssetMetadataPatch, AssetMetadata, assetMetadataKeys } from './AssetMetadata.ts'
import { registeredMeter, updateMeter } from './AssetMeter.ts'

const Schedule = Schema.Struct(Struct.omit(ScheduleAdded.fields, ['_tag']))
const AssetDetails = Schema.Struct({
  ...AssetMetadata.fields,
  id: AssetId,
  status: Schema.Literals(['active', 'retired']),
  retirementReason: Schema.optionalKey(RetirementReason),
  retirementNotes: Schema.optionalKey(Schema.String),
  meter: Schema.optionalKey(Meter),
  specs: Schema.Record(Schema.String, SpecEntry),
  schedules: Schema.Record(ScheduleId, Schedule),
  warranties: Schema.Record(WarrantyId, Warranty),
  links: Schema.Record(LinkId, NamedLink),
  totalSpendCents: Cents,
})
type AssetDetails = typeof AssetDetails.Type
const State = Schema.Union([Schema.Struct({ status: Schema.Literal('unregistered') }), AssetDetails])
type State = typeof State.Type

const update = (state: State, change: (asset: AssetDetails) => AssetDetails): State =>
  state.status === 'unregistered' ? state : change(state)

const spend = (asset: AssetDetails, costCents?: number): AssetDetails => ({
  ...asset,
  totalSpendCents: asset.totalSpendCents + (costCents ?? 0),
})

export class AssetDetail extends Domain.View(
  'AssetDetail',
  {
    from: [Asset],
    key: Asset,
    version: 1,
    middleware: [Session],
    state: State,
    initial: { status: 'unregistered' },
    evolve: {
      AssetRegistered: (_, event, { key }): AssetDetails => ({
        ...Struct.pick(event, assetMetadataKeys),
        id: key.id,
        status: 'active',
        ...registeredMeter(event),
        specs: {},
        schedules: {},
        warranties: {},
        links: {},
        totalSpendCents: 0,
      }),
      AssetUpdated: (state, patch) => update(state, (asset) => applyAssetMetadataPatch({ asset, patch })),
      AssetRetired: (state, { reason, notes }) =>
        update(state, (asset) => {
          const retired: AssetDetails = { ...asset, status: 'retired', retirementReason: reason }
          return notes === undefined ? retired : { ...retired, retirementNotes: notes }
        }),
      MeterRecorded: (state, { reading }) =>
        update(state, (asset) => updateMeter({ asset, reading: Option.some(reading) })),
      ScheduleAdded: (state, event) =>
        update(state, (asset) => ({
          ...asset,
          schedules: { ...asset.schedules, [event.scheduleId]: Struct.omit(event, ['_tag']) },
        })),
      ScheduleArchived: (state, { scheduleId }) =>
        update(state, (asset) => ({
          ...asset,
          schedules: Record.remove(asset.schedules, scheduleId),
        })),
      TaskCompleted: (state, event) =>
        update(state, (asset) => {
          const meter = event.meterReading ?? asset.meter?.reading
          return {
            ...spend(updateMeter({ asset, reading: Option.fromUndefinedOr(event.meterAdvancedTo) }), event.costCents),
            schedules: Record.modify(asset.schedules, event.scheduleId, (schedule) => {
              const completed = {
                ...Struct.omit(schedule, ['lastCompletedMeter', 'nextDueOn', 'nextDueMeter']),
                lastCompletedOn: event.completedOn,
                ...Struct.pick(event, ['nextDueOn', 'nextDueMeter']),
              }
              return meter === undefined ? completed : { ...completed, lastCompletedMeter: meter }
            }).pipe(Option.getOrElse(() => asset.schedules)),
          }
        }),
      ServiceLogged: (state, { meterAdvancedTo, costCents }) =>
        update(state, (asset) =>
          spend(updateMeter({ asset, reading: Option.fromUndefinedOr(meterAdvancedTo) }), costCents)
        ),
      WarrantyRecorded: (state, event) =>
        update(state, (asset) => ({
          ...asset,
          warranties: {
            ...asset.warranties,
            [event.warrantyId]: { id: event.warrantyId, ...Struct.omit(event, ['_tag', 'warrantyId']) },
          },
        })),
      WarrantyRemoved: (state, { warrantyId }) =>
        update(state, (asset) => ({
          ...asset,
          warranties: Record.remove(asset.warranties, warrantyId),
        })),
      SpecSet: (state, event) =>
        update(state, (asset) => ({
          ...asset,
          specs: { ...asset.specs, [event.key]: Struct.omit(event, ['_tag']) },
        })),
      SpecRemoved: (state, { key }) => update(state, (asset) => ({ ...asset, specs: Record.remove(asset.specs, key) })),
      LinkAttached: (state, { linkId, label, url }) =>
        update(state, (asset) => ({
          ...asset,
          links: { ...asset.links, [linkId]: { id: linkId, label, url } },
        })),
      LinkRemoved: (state, { linkId }) =>
        update(state, (asset) => ({
          ...asset,
          links: Record.remove(asset.links, linkId),
        })),
    },
  },
  { description: 'Read one asset with its meter, schedules, specifications, warranties, links, and maintenance spend.' }
) {}

export const AssetDetailLive = AssetDetail.toLayer(Effect.succeed(() => Effect.asVoid(CurrentActor)))
