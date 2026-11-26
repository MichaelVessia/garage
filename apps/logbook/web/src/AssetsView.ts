import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import * as Record from 'effect/Record'
import * as Str from 'effect/String'

import { activityRows } from './ActivityView.ts'
import { thresholdText } from './DueView.ts'
import { forms, secondaryButton } from './Forms.ts'
import { AssetSetupAction, dollarsFromCents, Editor, Message } from './Model.ts'
import type { AssetDetails, CatalogAsset, Model } from './Model.ts'
import { pendingWorkView } from './PendingWorkView.ts'
import { assetPath, selectedAsset } from './Route.ts'
import { appLink, webLink } from './WebLink.ts'

const byName = Order.mapInput(Order.String, (asset: CatalogAsset) => Str.toLowerCase(asset.name))
const searchableText = (asset: CatalogAsset): string =>
  Str.toLowerCase(
    Arr.join(
      [
        asset.name,
        asset.category,
        asset.make ?? '',
        asset.model ?? '',
        asset.serialNumber ?? '',
        asset.location ?? '',
        ...Arr.flatMap(Record.values(asset.specs), ({ key, value }) => [key, value]),
      ],
      ' '
    )
  )

const detailView = (h: Html.H<Message>) => (model: Model, asset: AssetDetails) => {
  const section = (
    title: string,
    items: View.Children<Message, never>,
    empty: string,
    action?: View.Content<Message>
  ) =>
    h.section
      .attr('aria-label', title)
      .class('space-y-2 border-t border-stone-200 pt-4')
      .children(
        h.h3.class('text-base font-semibold').children(title),
        items.length === 0
          ? h.p.class('text-sm text-stone-600').children(empty)
          : h.ul.class('space-y-2 text-sm').children(items),
        action
      )

  const renderLink = webLink(h)
  const activity = activityRows(h)(model.activity, asset.meter)
  const opened = Editor.guards.CompleteTask(model.editor) ? model.editor : undefined
  const { completion, assetSetup, assetEdit } = forms(h)(model)
  const setupButton = (action: AssetSetupAction, label: string, subject?: string) =>
    asset.status !== 'active'
      ? undefined
      : h.button
          .attr('type', 'button')
          .class(secondaryButton)
          .disabled(model.attempt !== null || model.sessionExpired)
          .attr('aria-label', subject === undefined ? undefined : `${label} ${subject}`)
          .on('click', Message.OpenedAssetSetup({ action }))
          .children(label)
  const setup = (add: AssetSetupAction, label: string, remove: AssetSetupAction['_tag']) => {
    const editor = model.editor
    return Editor.guards.AssetSetup(editor) && (editor.action._tag === add._tag || editor.action._tag === remove)
      ? assetSetup(editor)
      : setupButton(add, label)
  }
  const editing = Editor.guards.UpdateAsset(model.editor)
  const metadata = [
    ['Category', asset.category],
    ['Make', asset.make],
    ['Model', asset.model],
    ['Serial number', asset.serialNumber],
    ['Purchase date', asset.purchasedOn],
    [
      'Purchase price',
      asset.purchasePriceCents === undefined ? undefined : `$${dollarsFromCents(asset.purchasePriceCents)}`,
    ],
    ['Location', asset.location],
    ['Notes', asset.notes],
  ] as const
  return h.article.class('min-w-0 space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-5').children(
    h.div.class('flex flex-wrap items-center justify-between gap-2').children(
      h.h2.class('text-xl font-semibold break-words').children(asset.name),
      editing || asset.status !== 'active'
        ? undefined
        : h.button
            .attr('type', 'button')
            .class(secondaryButton)
            .disabled(model.attempt !== null || model.sessionExpired)
            .on('click', Message.OpenedAssetEdit())
            .children('Edit asset')
    ),
    editing
      ? assetEdit()
      : h.dl
          .class('grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2')
          .children(
            Arr.map(metadata, ([label, value]) =>
              value === undefined || value === ''
                ? undefined
                : h.div
                    .key(label)
                    .children(
                      h.dt.class('font-medium').children(label),
                      h.dd.class('whitespace-pre-wrap break-words text-stone-700').children(value)
                    )
            )
          ),
    section(
      'Specs & Consumables',
      Arr.map(Record.values(asset.specs), (spec) =>
        h.li
          .key(spec.key)
          .class('space-y-1 break-words')
          .children(
            h.p.children(h.strong.children(spec.key), ' · ', spec.value),
            h.div
              .class('flex flex-wrap items-center gap-2')
              .children(
                renderLink(`Reorder ${spec.key}`, spec.url),
                setupButton(AssetSetupAction.cases.SetSpec.make({ previousKey: spec.key }), 'Edit spec', spec.key),
                setupButton(AssetSetupAction.cases.RemoveSpec.make({ key: spec.key }), 'Remove spec', spec.key)
              )
          )
      ),
      'No specs or consumables recorded.',
      setup(AssetSetupAction.cases.SetSpec.make({}), 'Set spec', 'RemoveSpec')
    ),
    h.p
      .class('text-sm')
      .children(
        h.strong.children('Current meter'),
        ' · ',
        asset.meter === undefined ? 'No meter' : `${asset.meter.reading} ${asset.meter.unit}`
      ),
    opened !== undefined && asset.schedules[opened.scheduleId] === undefined
      ? completion(asset.meter !== undefined)
      : undefined,
    section(
      'Schedules',
      Arr.map(Record.values(asset.schedules), (schedule) =>
        h.li.key(schedule.scheduleId).children(
          h.div.class('flex flex-wrap items-center justify-between gap-2').children(
            h.div.children(
              h.p.class('font-medium').children(schedule.title),
              h.p.class('text-stone-600').children(thresholdText({ ...schedule, meter: asset.meter }))
            ),
            h.div.class('flex flex-wrap gap-2').children(
              setupButton(
                AssetSetupAction.cases.AddSchedule.make({ replacesScheduleId: schedule.scheduleId }),
                'Edit schedule',
                schedule.title
              ),
              setupButton(
                AssetSetupAction.cases.ArchiveSchedule.make({ scheduleId: schedule.scheduleId }),
                'Stop schedule',
                schedule.title
              ),
              opened?.scheduleId === schedule.scheduleId || asset.status !== 'active'
                ? undefined
                : h.button
                    .attr('type', 'button')
                    .class(secondaryButton)
                    .disabled(model.attempt !== null || model.sessionExpired)
                    .on('click', Message.OpenedCompletion({ assetId: asset.id, scheduleId: schedule.scheduleId }))
                    .children('Mark done')
            )
          ),
          opened?.scheduleId === schedule.scheduleId ? completion(asset.meter !== undefined) : undefined
        )
      ),
      'No active schedules.',
      setup(AssetSetupAction.cases.AddSchedule.make({}), 'Add schedule', 'ArchiveSchedule')
    ),
    pendingWorkView(h)(model, { asset }),
    section(
      'Warranties',
      Arr.map(Record.values(asset.warranties), (warranty) =>
        h.li
          .key(warranty.id)
          .children(
            h.p.children(h.strong.children(warranty.label), ` · Expires ${warranty.expiresOn}`),
            warranty.coverage === undefined ? undefined : h.p.children(warranty.coverage),
            warranty.notes === undefined ? undefined : h.p.children(warranty.notes),
            h.div
              .class('flex flex-wrap items-center gap-2')
              .children(
                renderLink(`Open ${warranty.label}`, warranty.url),
                setupButton(
                  AssetSetupAction.cases.RecordWarranty.make({ replacesWarrantyId: warranty.id }),
                  'Edit warranty',
                  warranty.label
                ),
                setupButton(
                  AssetSetupAction.cases.RemoveWarranty.make({ warrantyId: warranty.id }),
                  'Remove warranty',
                  warranty.label
                )
              )
          )
      ),
      'No warranties recorded.',
      setup(AssetSetupAction.cases.RecordWarranty.make({}), 'Record warranty', 'RemoveWarranty')
    ),
    section(
      'Links',
      Arr.map(Record.values(asset.links), (link) =>
        h.li
          .key(link.id)
          .class('flex flex-wrap items-center gap-2')
          .children(
            renderLink(link.label, link.url) ?? link.label,
            setupButton(
              AssetSetupAction.cases.AttachLink.make({ replacesLinkId: link.id }),
              'Replace link',
              link.label
            ),
            setupButton(AssetSetupAction.cases.RemoveLink.make({ linkId: link.id }), 'Remove link', link.label)
          )
      ),
      'No links recorded.',
      setup(AssetSetupAction.cases.AttachLink.make({}), 'Attach link', 'RemoveLink')
    ),
    section(
      'Service history',
      activity.history,
      model.readFailures.activity
        ? 'Service history unavailable.'
        : model.activityCaughtUp
          ? 'No service recorded.'
          : 'Loading service history…'
    ),
    section('Activity', activity.activity, model.activityCaughtUp ? 'No activity recorded.' : '')
  )
}

export const assetsView = (h: Html.H<Message>) => (model: Model) => {
  const terms = Str.split(/\s+/u)(Str.toLowerCase(Str.trim(model.query)))
  const assets = Arr.sort(Record.values(model.catalog?.assets ?? {}), byName)
  const matches = Arr.filter(assets, (asset) => {
    const text = searchableText(asset)
    return Arr.every(terms, (term) => Str.includes(term)(text))
  })
  const { detail } = model
  const selected = selectedAsset(model.route)
  const missing = selected !== null && model.catalog !== null && !Record.has(model.catalog.assets, selected)
  return h.section.class('space-y-4').children(
    h.h2.class('text-2xl font-semibold').children('Assets'),
    h.label.class('block max-w-md text-sm font-medium').children(
      'Search assets',
      h.input
        .class('mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base')
        .attr('type', 'search')
        .value(model.query)
        .on('input', ({ value: query }) => Message.SearchedAssets({ query }))
        .attr('placeholder', 'Name, make, model, serial number, location, or spec')
    ),
    h.div.class('grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]').children(
      matches.length === 0
        ? h.p
            .class('text-sm text-stone-600')
            .children(
              model.catalog === null
                ? ''
                : assets.length === 0
                  ? 'No assets registered.'
                  : 'No assets match your search.'
            )
        : h.ul.class('space-y-2').children(
            Arr.map(matches, (asset) =>
              h.li.key(asset.id).children(
                appLink(h)(model, assetPath(asset.id))
                  .class(
                    'block rounded-xl border border-stone-200 bg-white p-3 hover:border-teal-700 aria-current:border-teal-700 aria-current:bg-teal-50 aria-disabled:opacity-50'
                  )
                  .attr('aria-current', selected === asset.id ? 'page' : 'false')
                  .children(
                    h.span.class('block break-words font-semibold').children(asset.name),
                    h.span.class('block text-sm text-stone-600').children(
                      Arr.join(
                        Arr.filter(
                          [asset.category, asset.location, asset.status === 'retired' ? 'retired' : undefined],
                          (text) => text !== undefined
                        ),
                        ' · '
                      )
                    )
                  )
              )
            )
          ),
      detail === null || detail.status === 'unregistered'
        ? selected === null || model.readFailures.detail || model.sessionExpired
          ? undefined
          : h.p.attr('role', 'status').children(missing ? 'Asset not found.' : 'Loading asset…')
        : detailView(h)(model, detail)
    )
  )
}
