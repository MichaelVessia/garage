import * as DomainFoldkit from '@alchemy.run/domain/Foldkit'
import { AssetId, ScheduleId } from '@garage/logbook-domain/Asset/Asset.id'
import { ActivityEntry } from '@garage/logbook-domain/Asset/AssetActivity.view'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import { IsoDate } from '@garage/logbook-domain/Values'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

export const client = DomainFoldkit.make(LogbookApi)
export type Client = typeof LogbookApi.Client.Identifier
export type CatalogAsset = NonNullable<Model['catalog']>['assets'][AssetId]
export type AssetDetails = Exclude<NonNullable<Model['detail']>, { readonly status: 'unregistered' }>

export const Screen = Schema.Literals(['Due', 'Assets', 'Quick Log'])
export const QuickMode = Schema.Literals(['RecordMeter', 'LogService', 'RegisterAsset'])
const Field = Schema.Literals([
  'asset',
  'name',
  'category',
  'location',
  'title',
  'reading',
  'cost',
  'performedBy',
  'vendor',
  'notes',
  'unit',
  'correction',
])
export type Field = typeof Field.Type
export const Editor = Schema.TaggedUnion({
  CompleteTask: { assetId: AssetId, scheduleId: ScheduleId },
  RecordMeter: {},
  LogService: {},
  RegisterAsset: {},
})
export type Editor = typeof Editor.Type

const Catalog = Schema.toType(client.HomeCatalog.SnapshotFlags.fields.state.from)
const Detail = Schema.toType(client.AssetDetail.SnapshotFlags.fields.state.from)
const Activity = Schema.toType(ActivityEntry)
const Read = Schema.Literals(['catalog', 'detail', 'activity'])
export const Flags = Schema.Struct({ session: Schema.String, today: IsoDate })
export const Model = Schema.Struct({
  screen: Screen,
  today: IsoDate,
  catalog: Catalog,
  query: Schema.String,
  selected: Schema.NullOr(AssetId),
  detail: Detail,
  activity: Schema.Array(Activity),
  activityCursor: Schema.Option(Schema.Int),
  readFailures: Schema.Record(Read, Schema.Boolean),
  editor: Schema.NullOr(Editor),
  fields: Schema.Record(Field, Schema.optionalKey(Schema.String)),
  attempt: Schema.NullOr(Schema.Struct({ id: Schema.String, status: Schema.Literals(['saving', 'unknown']) })),
  problem: Schema.NullOr(Schema.String),
  correctionOffered: Schema.Boolean,
  notice: Schema.NullOr(Schema.String),
  sessionExpired: Schema.Boolean,
  commandIds: DomainFoldkit.CommandIds,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChoseScreen: { screen: Screen },
  SearchedAssets: { query: Schema.String },
  SelectedAsset: { assetId: Schema.NullOr(AssetId) },
  OpenedCompletion: { assetId: AssetId, scheduleId: ScheduleId },
  ChoseQuickMode: { mode: QuickMode },
  ClosedCompletion: {},
  EditedField: { field: Field, value: Schema.String },
  Submitted: {},
  ReceivedResult: { result: client.Message },
  ReceivedCatalog: { catalog: Catalog },
  ReceivedDetail: { detail: Detail },
  ReceivedActivity: { entry: Activity, cursor: Schema.Int },
  ActivityCaughtUp: {},
  ReadFailed: { read: Read },
  SessionExpired: {},
  ChangedDate: { today: IsoDate },
})
export type Message = typeof Message.Type

export const init = ({ session, today }: typeof Flags.Type): Update.Return<Model, Message, Client> => ({
  model: {
    screen: 'Due',
    today,
    catalog: null,
    query: '',
    selected: null,
    detail: null,
    activity: [],
    activityCursor: Option.none(),
    readFailures: { catalog: false, detail: false, activity: false },
    editor: null,
    fields: {},
    attempt: null,
    problem: null,
    correctionOffered: false,
    notice: null,
    sessionExpired: false,
    commandIds: { session, sent: 0 },
  },
})
