import * as Domain from '@alchemy.run/domain'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { CurrentActor } from '../CurrentActor.context.ts'
import { Session } from '../Session.middleware.ts'
import { Asset } from './Asset.aggregate.ts'
import { AssetId } from './Asset.id.ts'
import { PendingWorkCompleted } from './CompletePendingWork.command.ts'
import { TaskCompleted } from './CompleteTask.command.ts'
import { ServiceLogged } from './LogService.command.ts'
import { MeterRecorded } from './RecordMeter.command.ts'
import { WarrantyRecorded } from './RecordWarranty.command.ts'
import { AssetRegistered } from './RegisterAsset.command.ts'
import { AssetRetired } from './RetireAsset.command.ts'

const ActivityEvent = Schema.Union([
  AssetRegistered,
  AssetRetired,
  TaskCompleted,
  PendingWorkCompleted,
  ServiceLogged,
  MeterRecorded,
  WarrantyRecorded,
])

export class ActivityEntry extends Domain.Event('ActivityEntry', {
  assetId: AssetId,
  at: Schema.DateTimeUtcFromString,
  event: ActivityEvent,
}) {}

const entry = (
  event: typeof ActivityEvent.Type,
  { key, at }: { readonly key: { readonly id: AssetId }; readonly at: typeof ActivityEntry.fields.at.Type }
): ActivityEntry => ActivityEntry.make({ assetId: key.id, at, event })

export class AssetActivity extends Domain.View(
  'AssetActivity',
  {
    from: [Asset],
    key: Asset,
    version: 1,
    middleware: [Session],
    state: Schema.Struct({}),
    initial: {},
    events: [ActivityEntry],
    emit: {
      AssetRegistered: entry,
      AssetRetired: entry,
      TaskCompleted: entry,
      PendingWorkCompleted: entry,
      ServiceLogged: entry,
      MeterRecorded: entry,
      WarrantyRecorded: entry,
    },
  },
  { description: 'List or stream one asset’s registration, retirement, maintenance, meter, and warranty activity.' }
) {}

export const AssetActivityLive = AssetActivity.toLayer(Effect.succeed(() => Effect.asVoid(CurrentActor)))
