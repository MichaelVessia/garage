import { AssetId } from '@garage/logbook-domain/Asset/Asset.id'
import { assetMetadataKeys } from '@garage/logbook-domain/Asset/AssetMetadata'
import { HOME_HOUSEHOLD_ID } from '@garage/logbook-domain/Household.id'
import { isoDateFromUtc } from '@garage/logbook-domain/ScheduleMath'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as Struct from 'effect/Struct'
import { Subscription } from 'foldkit'
import type { Update } from 'foldkit'

import { AssetSetupAction, client, dollarsFromCents, Editor, Message } from './Model.ts'
import type { AssetDetails, Client, Model } from './Model.ts'
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
    OpenedPendingWork: () => {
      const asset = model.detail
      if (model.attempt !== null || model.sessionExpired || model.screen !== 'Assets' || asset?.status !== 'active') {
        return noCommands(model)
      }
      return noCommands(edit(model, Editor.cases.AddPendingWork.make({ assetId: asset.id })))
    },
    OpenedPendingWorkCompletion: ({ assetId, workId }) => {
      const asset = model.screen === 'Assets' ? model.detail : model.catalog?.assets[assetId]
      if (
        model.attempt !== null ||
        model.sessionExpired ||
        model.screen === 'Quick Log' ||
        asset?.status !== 'active' ||
        asset.id !== assetId ||
        asset.pendingWork?.[workId] === undefined
      ) {
        return noCommands(model)
      }
      return noCommands(edit(model, Editor.cases.CompletePendingWork.make({ assetId, workId })))
    },
    OpenedAssetSetup: ({ action }) => {
      const asset = model.detail
      if (model.attempt !== null || model.sessionExpired || model.screen !== 'Assets' || asset?.status !== 'active') {
        return noCommands(model)
      }
      const draft = setupDraft(asset, action)
      if (Option.isNone(draft)) {
        return noCommands(model)
      }
      const setup = { assetId: asset.id, action, ...Struct.pick(draft.value, ['subject']) }
      const editor = Editor.cases.AssetSetup.make(
        asset.meter === undefined ? setup : { ...setup, meterUnit: asset.meter.unit }
      )
      return noCommands({ ...edit(model, editor), fields: draft.value.fields })
    },
    OpenedAssetEdit: () => noCommands(openAssetEdit(model)),
    ChoseQuickMode: ({ mode }) => noCommands(model.attempt === null ? edit(model, Editor.cases[mode].make({})) : model),
    ClosedEditor: () => noCommands(model.attempt === null ? edit(model, null) : model),
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
    ActivityCaughtUp: () =>
      noCommands({ ...model, activityCaughtUp: true, readFailures: { ...model.readFailures, activity: false } }),
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

const setupDraft = (
  asset: AssetDetails,
  action: AssetSetupAction
): Option.Option<{ readonly fields: Model['fields']; readonly subject?: string }> =>
  AssetSetupAction.match(action, {
    AddSchedule: ({ replacesScheduleId }) => {
      if (replacesScheduleId === undefined) {
        return Option.some({ fields: {} })
      }
      return Option.map(Record.get(asset.schedules, replacesScheduleId), (schedule) => {
        const { cadence } = schedule
        return {
          subject: schedule.title,
          fields: {
            title: schedule.title,
            cadence: cadence._tag,
            days: 'days' in cadence ? String(cadence.days) : '',
            every: 'every' in cadence ? String(cadence.every) : '',
            month: 'month' in cadence ? String(cadence.month) : '',
            day: 'day' in cadence ? String(cadence.day) : '',
            lastCompletedOn: schedule.lastCompletedOn ?? '',
            lastCompletedMeter: schedule.lastCompletedMeter === undefined ? '' : String(schedule.lastCompletedMeter),
            cost: schedule.estimatedCostCents === undefined ? '' : dollarsFromCents(schedule.estimatedCostCents),
            notes: schedule.notes ?? '',
          },
        }
      })
    },
    ArchiveSchedule: ({ scheduleId }) =>
      Option.map(Record.get(asset.schedules, scheduleId), ({ title }) => ({ subject: title, fields: {} })),
    RecordWarranty: ({ replacesWarrantyId }) =>
      replacesWarrantyId === undefined
        ? Option.some({ fields: {} })
        : Option.map(
            Record.get(asset.warranties, replacesWarrantyId),
            ({ label, expiresOn, coverage, url, notes }) => ({
              subject: label,
              fields: { label, expiresOn, coverage: coverage ?? '', url: url ?? '', notes: notes ?? '' },
            })
          ),
    RemoveWarranty: ({ warrantyId }) =>
      Option.map(Record.get(asset.warranties, warrantyId), ({ label }) => ({ subject: label, fields: {} })),
    SetSpec: ({ previousKey }) =>
      previousKey === undefined
        ? Option.some({ fields: {} })
        : Option.map(Record.get(asset.specs, previousKey), ({ key, value, url }) => ({
            subject: key,
            fields: { key, value, url: url ?? '' },
          })),
    RemoveSpec: ({ key }) => Option.map(Record.get(asset.specs, key), () => ({ subject: key, fields: {} })),
    AttachLink: ({ replacesLinkId }) =>
      replacesLinkId === undefined
        ? Option.some({ fields: {} })
        : Option.map(Record.get(asset.links, replacesLinkId), ({ label, url }) => ({
            subject: label,
            fields: { label, url },
          })),
    RemoveLink: ({ linkId }) =>
      Option.map(Record.get(asset.links, linkId), ({ label }) => ({ subject: label, fields: {} })),
  })

const openAssetEdit = (model: Model): Model => {
  const asset = model.detail
  if (model.attempt !== null || model.sessionExpired || model.screen !== 'Assets' || asset?.status !== 'active') {
    return model
  }

  const original = Struct.pick(asset, assetMetadataKeys)
  return {
    ...edit(model, Editor.cases.UpdateAsset.make({ assetId: asset.id, original })),
    fields: {
      name: original.name,
      category: original.category,
      make: original.make ?? '',
      model: original.model ?? '',
      serialNumber: original.serialNumber ?? '',
      purchasedOn: original.purchasedOn ?? '',
      purchasePrice: original.purchasePriceCents === undefined ? '' : dollarsFromCents(original.purchasePriceCents),
      location: original.location ?? '',
      notes: original.notes ?? '',
    },
  }
}

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
          activityCaughtUp: false,
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
