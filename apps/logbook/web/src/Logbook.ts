import { AssetId } from '@garage/logbook-domain/Asset/Asset.id'
import { HOME_HOUSEHOLD_ID } from '@garage/logbook-domain/Household.id'
import { isoDateFromUtc } from '@garage/logbook-domain/ScheduleMath'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as Struct from 'effect/Struct'
import { Subscription } from 'foldkit'
import type { Update } from 'foldkit'

import { client, Editor, Message } from './Model.ts'
import type { Client, Model } from './Model.ts'
import { receiveResult, submit } from './Submission.ts'

const noCommands = (model: Model) => ({ model })

// @effect-diagnostics-next-line missingPipeableSignature:off -- Foldkit calls update with the model and message.
export const update = (model: Model, message: Message): Update.Return<Model, Message, Client> =>
  Message.match(message, {
    ChoseScreen: ({ screen }) => {
      if (screen === model.screen || model.attempt !== null) {
        return noCommands(model)
      }

      return noCommands(
        edit({ ...model, screen, notice: null }, screen === 'Quick Log' ? Editor.cases.RecordMeter.make({}) : null)
      )
    },
    SearchedAssets: ({ query }) => noCommands({ ...model, query }),
    SelectedAsset: ({ assetId }) => noCommands(model.attempt === null ? selectAsset(model, assetId) : model),
    OpenedCompletion: ({ assetId, scheduleId }) =>
      noCommands(model.attempt === null ? edit(model, Editor.cases.CompleteTask.make({ assetId, scheduleId })) : model),
    OpenedAssetSetup: ({ mode }) => {
      const asset = model.detail
      if (model.attempt !== null || model.sessionExpired || model.screen !== 'Assets' || asset?.status !== 'active') {
        return noCommands(model)
      }
      const setup = { assetId: asset.id, mode }
      const editor = Editor.cases.AssetSetup.make(
        asset.meter === undefined ? setup : { ...setup, meterUnit: asset.meter.unit }
      )
      return noCommands(edit(model, editor))
    },
    ChoseQuickMode: ({ mode }) => noCommands(model.attempt === null ? edit(model, Editor.cases[mode].make({})) : model),
    ClosedCompletion: () => noCommands(model.attempt === null ? edit(model, null) : model),
    EditedField: ({ field, value }) => {
      if (model.attempt !== null) {
        return noCommands(model)
      }
      if (field === 'asset') {
        return noCommands({
          ...model,
          fields: { ...Struct.omit(model.fields, ['reading', 'correction']), asset: value },
          problem: null,
          correctionOffered: false,
          notice: null,
        })
      }
      return noCommands({ ...model, fields: { ...model.fields, [field]: value }, notice: null })
    },
    Submitted: () => submit(model),
    ReceivedResult: ({ result }) => noCommands(receiveResult(result)(model)),
    ReceivedCatalog: ({ catalog }) =>
      noCommands({
        ...model,
        catalog: catalog ?? { assets: {}, spendByYear: {} },
        readFailures: { ...model.readFailures, catalog: false },
      }),
    ReceivedDetail: ({ detail }) =>
      noCommands(
        detail === null || detail.status === 'unregistered' || detail.id !== model.selected
          ? model
          : { ...model, detail, readFailures: { ...model.readFailures, detail: false } }
      ),
    ReceivedActivity: ({ entry, cursor }) =>
      noCommands(
        entry.assetId !== model.selected || Option.exists(model.activityCursor, (previous) => cursor <= previous)
          ? model
          : {
              ...model,
              activity: Arr.prepend(model.activity, entry),
              activityCursor: Option.some(cursor),
              readFailures: { ...model.readFailures, activity: false },
            }
      ),
    ActivityCaughtUp: () => noCommands(model),
    ReadFailed: ({ read }) => noCommands({ ...model, readFailures: { ...model.readFailures, [read]: true } }),
    SessionExpired: () => noCommands({ ...model, sessionExpired: true }),
    ChangedDate: ({ today }) => noCommands(today === model.today ? model : { ...model, today }),
  })

const edit = (model: Model, editor: Model['editor']): Model => ({
  ...model,
  editor,
  fields: {},
  problem: null,
  correctionOffered: false,
  notice: null,
})

const selectAsset = (model: Model, selected: Model['selected']): Model =>
  selected === model.selected
    ? model
    : edit(
        {
          ...model,
          selected,
          detail: null,
          activity: [],
          activityCursor: Option.none(),
          readFailures: { ...model.readFailures, detail: false, activity: false },
        },
        null
      )

const readFailure =
  (read: 'catalog' | 'detail' | 'activity') =>
  (error: unknown): Message =>
    Schema.is(Unauthorized)(error) ? Message.SessionExpired() : Message.ReadFailed({ read })

// Disabled subscriptions still require a valid key in their dependency schema.
const inactiveKey = AssetId.make('inactive')
const selectedKey = (model: Model) => model.selected ?? inactiveKey
const hasSelection = (model: Model) => !model.sessionExpired && model.screen === 'Assets' && model.selected !== null

export const subscriptions = Subscription.make<Model, Message, Client>()((entry) => ({
  catalog: client.HomeCatalog.watch({
    key: () => HOME_HOUSEHOLD_ID,
    isEnabled: (model: Model) => !model.sessionExpired,
    toMessage: ({ state }) => Message.ReceivedCatalog({ catalog: Option.getOrNull(state) }),
    onFailure: readFailure('catalog'),
    onDefect: () => Message.ReadFailed({ read: 'catalog' }),
  }),
  detail: client.AssetDetail.watch({
    key: selectedKey,
    isEnabled: hasSelection,
    toMessage: ({ state }) => Message.ReceivedDetail({ detail: Option.getOrNull(state) }),
    onFailure: readFailure('detail'),
    onDefect: () => Message.ReadFailed({ read: 'detail' }),
  }),
  activity: client.AssetActivity.events({
    key: selectedKey,
    isEnabled: hasSelection,
    cursor: (model) => model.activityCursor,
    onEntry: ({ event, envelope }) => Message.ReceivedActivity({ entry: event, cursor: envelope.seq }),
    onCaughtUp: () => Message.ActivityCaughtUp(),
    onFailure: readFailure('activity'),
    onDefect: () => Message.ReadFailed({ read: 'activity' }),
  }),
  clock: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Stream.tick(Duration.minutes(1)).pipe(
          Stream.mapEffect(() => Effect.map(DateTime.now, (now) => Message.ChangedDate({ today: isoDateFromUtc(now) })))
        ),
    }
  ),
}))
