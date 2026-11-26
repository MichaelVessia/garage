import { Read } from '@alchemy.run/domain'
import { Component, Subscription } from '@effect/ui'
import { Html } from '@effect/ui/html'
import { assetMetadataKeys } from '@garage/logbook-domain/Asset/AssetMetadata'
import { HOME_HOUSEHOLD_ID } from '@garage/logbook-domain/Household.id'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
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

import { AssetSetupAction, dollarsFromCents, Editor, init, Message, Model, Props } from './Model.ts'
import type { AssetDetails } from './Model.ts'
import { SaveAsset } from './SaveAsset.ts'
import { receiveResult, submit } from './Submission.ts'
import { view } from './View.ts'

const LogbookDefinition = Html.component({ name: 'Logbook', props: Props, model: Model, message: Message })

const update = LogbookDefinition.update(($, message) => {
  const { model } = $
  return Message.match(message, {
    ChoseScreen: ({ screen }) => {
      if (screen === model.screen || model.attempt !== null) {
        return model
      }

      return edit({ ...model, screen, notice: null }, screen === 'Quick Log' ? Editor.cases.RecordMeter.make({}) : null)
    },
    SearchedAssets: ({ query }) => ({ ...model, query }),
    SelectedAsset: ({ assetId }) => (model.attempt === null ? selectAsset(model, assetId) : model),
    OpenedCompletion: ({ assetId, scheduleId }) =>
      model.attempt === null ? edit(model, Editor.cases.CompleteTask.make({ assetId, scheduleId })) : model,
    OpenedPendingWork: () => {
      const asset = model.detail
      if (model.attempt !== null || model.sessionExpired || model.screen !== 'Assets' || asset?.status !== 'active') {
        return model
      }
      return edit(model, Editor.cases.AddPendingWork.make({ assetId: asset.id }))
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
        return model
      }
      return edit(model, Editor.cases.CompletePendingWork.make({ assetId, workId }))
    },
    OpenedAssetSetup: ({ action }) => {
      const asset = model.detail
      if (model.attempt !== null || model.sessionExpired || model.screen !== 'Assets' || asset?.status !== 'active') {
        return model
      }
      const draft = setupDraft(asset, action)
      if (Option.isNone(draft)) {
        return model
      }
      const setup = { assetId: asset.id, action, ...Struct.pick(draft.value, ['subject']) }
      const editor = Editor.cases.AssetSetup.make(
        asset.meter === undefined ? setup : { ...setup, meterUnit: asset.meter.unit }
      )
      return { ...edit(model, editor), fields: draft.value.fields }
    },
    OpenedAssetEdit: () => openAssetEdit(model),
    ChoseQuickMode: ({ mode }) => (model.attempt === null ? edit(model, Editor.cases[mode].make({})) : model),
    ClosedEditor: () => (model.attempt === null ? edit(model, null) : model),
    EditedField: ({ field, value }) => {
      if (model.attempt !== null) {
        return model
      }
      if (field === 'asset') {
        return {
          ...model,
          fields: { ...Struct.omit(model.fields, ['reading', 'correction']), asset: value },
          problem: null,
          correctionOffered: false,
          notice: null,
        }
      }
      return { ...model, fields: { ...model.fields, [field]: value }, notice: null }
    },
    Submitted: () => {
      const next = submit(model)
      return next.command === undefined ? next.model : $.set(next.model).run(next.command)
    },
    ReceivedResult: ({ result }) => receiveResult(result)(model),
    ReceivedCatalog: ({ catalog }) => ({
      ...model,
      catalog: catalog ?? { assets: {}, spendByYear: {} },
      readFailures: { ...model.readFailures, catalog: false },
    }),
    ReceivedDetail: ({ detail }) =>
      detail === null || detail.status === 'unregistered' || detail.id !== model.selected
        ? model
        : { ...model, detail, readFailures: { ...model.readFailures, detail: false } },
    ReceivedActivity: ({ entry, cursor }) =>
      entry.assetId !== model.selected || Option.exists(model.activityCursor, (previous) => cursor <= previous)
        ? model
        : {
            ...model,
            activity: Arr.prepend(model.activity, entry),
            activityCursor: Option.some(cursor),
            readFailures: { ...model.readFailures, activity: false },
          },
    ActivityCaughtUp: () => ({
      ...model,
      activityCaughtUp: true,
      readFailures: { ...model.readFailures, activity: false },
    }),
    ReadFailed: ({ read }) => ({ ...model, readFailures: { ...model.readFailures, [read]: true } }),
    SessionExpired: () => ({ ...model, sessionExpired: true }),
    ChangedDate: ({ today }) => (today === model.today ? model : { ...model, today }),
  })
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

const recoverRead =
  (read: keyof Model['readFailures']) =>
  <E, R>(stream: Stream.Stream<Message, E, R>): Stream.Stream<Message, never, R> =>
    stream.pipe(
      Stream.catch((error) =>
        Stream.succeed(Schema.is(Unauthorized)(error) ? Message.SessionExpired() : Message.ReadFailed({ read }))
      ),
      Stream.catchDefect(() => Stream.succeed(Message.ReadFailed({ read })))
    )

const subscriptions = LogbookDefinition.subscriptions(({ model }) => {
  const assetId = model.screen === 'Assets' && !model.sessionExpired ? model.selected : null
  const after = Option.getOrUndefined(model.activityCursor)

  return [
    !model.sessionExpired &&
      Subscription.make(
        'catalog',
        Stream.unwrap(LogbookApi.Client.pipe(Effect.map((api) => api.HomeCatalog.watch(HOME_HOUSEHOLD_ID)))).pipe(
          Stream.map(({ state }) => Message.ReceivedCatalog({ catalog: state })),
          recoverRead('catalog')
        )
      ),
    assetId !== null &&
      Subscription.make('detail', assetId, (id) =>
        Stream.unwrap(LogbookApi.Client.pipe(Effect.map((api) => api.AssetDetail.watch(id)))).pipe(
          Stream.map(({ state }) => Message.ReceivedDetail({ detail: state })),
          recoverRead('detail')
        )
      ),
    assetId !== null &&
      Subscription.make('activity', assetId, (id) =>
        Stream.unwrap(
          LogbookApi.Client.pipe(
            Effect.map((api) => api.AssetActivity.events(id, after === undefined ? undefined : { after }))
          )
        ).pipe(
          Stream.map((frame) =>
            Read.isCaughtUp(frame)
              ? Message.ActivityCaughtUp()
              : Message.ReceivedActivity({ entry: frame.event, cursor: frame.envelope.seq })
          ),
          recoverRead('activity')
        )
      ),
    Subscription.make(
      'clock',
      Stream.tick(Duration.minutes(1)).pipe(
        Stream.mapEffect(() => Effect.map(DateTime.now, (now) => Message.ChangedDate({ today: isoDateFromUtc(now) })))
      )
    ),
  ]
})

// @effect-diagnostics-next-line missingPipeableSignature:off -- Effect UI defines the component call signature.
export const Logbook = LogbookDefinition.make({
  init: ({ props }) => init(props),
  update,
  subscriptions,
  view: (h, model) => view(h)(model),
}).pipe(Component.provide(SaveAsset.layer))
