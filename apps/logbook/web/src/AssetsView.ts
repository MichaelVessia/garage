import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import * as Record from 'effect/Record'
import * as Str from 'effect/String'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { activityRows } from './ActivityView.ts'
import { thresholdText } from './DueView.ts'
import { forms, secondaryButton } from './Forms.ts'
import { AssetSetupAction, dollarsFromCents, Editor, Message } from './Model.ts'
import type { AssetDetails, CatalogAsset, Model } from './Model.ts'
import { pendingWorkView } from './PendingWorkView.ts'
import { webLink } from './WebLink.ts'

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

const detailView =
  (h: HtmlBuilder<Message>) =>
  (model: Model, asset: AssetDetails): Html => {
    const section = (title: string, items: ReadonlyArray<Html>, empty: string, action: Html = null) =>
      h.section(
        [h.AriaLabel(title), h.Class('space-y-2 border-t border-stone-200 pt-4')],
        [
          h.h3([h.Class('text-base font-semibold')], [title]),
          items.length === 0
            ? h.p([h.Class('text-sm text-stone-600')], [empty])
            : h.ul([h.Class('space-y-2 text-sm')], items),
          action,
        ]
      )

    const renderLink = webLink(h)
    const activity = activityRows(h)(model.activity, asset.meter)
    const opened = Editor.guards.CompleteTask(model.editor) ? model.editor : null
    const { completion, assetSetup, assetEdit } = forms(h)(model)
    const setupButton = (action: AssetSetupAction, label: string, subject?: string): Html =>
      asset.status !== 'active'
        ? null
        : h.button(
            [
              h.Type('button'),
              h.Class(secondaryButton),
              h.Disabled(model.attempt !== null || model.sessionExpired),
              ...(subject === undefined ? [] : [h.AriaLabel(`${label} ${subject}`)]),
              h.OnClick(Message.OpenedAssetSetup({ action })),
            ],
            [label]
          )
    const setup = (add: AssetSetupAction, label: string, remove: AssetSetupAction['_tag']): Html => {
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
    return h.article(
      [h.Class('min-w-0 space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-5')],
      [
        h.div(
          [h.Class('flex flex-wrap items-center justify-between gap-2')],
          [
            h.h2([h.Class('text-xl font-semibold break-words')], [asset.name]),
            editing || asset.status !== 'active'
              ? null
              : h.button(
                  [
                    h.Type('button'),
                    h.Class(secondaryButton),
                    h.Disabled(model.attempt !== null || model.sessionExpired),
                    h.OnClick(Message.OpenedAssetEdit()),
                  ],
                  ['Edit asset']
                ),
          ]
        ),
        editing
          ? assetEdit()
          : h.dl(
              [h.Class('grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2')],
              Arr.map(metadata, ([label, value]) =>
                value === undefined || value === ''
                  ? null
                  : h.div(
                      [h.Key(label)],
                      [
                        h.dt([h.Class('font-medium')], [label]),
                        h.dd([h.Class('whitespace-pre-wrap break-words text-stone-700')], [value]),
                      ]
                    )
              )
            ),
        section(
          'Specs & Consumables',
          Arr.map(Record.values(asset.specs), (spec) =>
            h.li(
              [h.Key(spec.key), h.Class('space-y-1 break-words')],
              [
                h.p([], [h.strong([], [spec.key]), ' · ', spec.value]),
                h.div(
                  [h.Class('flex flex-wrap items-center gap-2')],
                  [
                    renderLink(`Reorder ${spec.key}`, spec.url),
                    setupButton(AssetSetupAction.cases.SetSpec.make({ previousKey: spec.key }), 'Edit spec', spec.key),
                    setupButton(AssetSetupAction.cases.RemoveSpec.make({ key: spec.key }), 'Remove spec', spec.key),
                  ]
                ),
              ]
            )
          ),
          'No specs or consumables recorded.',
          setup(AssetSetupAction.cases.SetSpec.make({}), 'Set spec', 'RemoveSpec')
        ),
        h.p(
          [h.Class('text-sm')],
          [
            h.strong([], ['Current meter']),
            ' · ',
            asset.meter === undefined ? 'No meter' : `${asset.meter.reading} ${asset.meter.unit}`,
          ]
        ),
        opened !== null && asset.schedules[opened.scheduleId] === undefined
          ? completion(asset.meter !== undefined)
          : null,
        section(
          'Schedules',
          Arr.map(Record.values(asset.schedules), (schedule) =>
            h.li(
              [h.Key(schedule.scheduleId)],
              [
                h.div(
                  [h.Class('flex flex-wrap items-center justify-between gap-2')],
                  [
                    h.div(
                      [],
                      [
                        h.p([h.Class('font-medium')], [schedule.title]),
                        h.p([h.Class('text-stone-600')], [thresholdText({ ...schedule, meter: asset.meter })]),
                      ]
                    ),
                    h.div(
                      [h.Class('flex flex-wrap gap-2')],
                      [
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
                          ? null
                          : h.button(
                              [
                                h.Type('button'),
                                h.Class(secondaryButton),
                                h.Disabled(model.attempt !== null || model.sessionExpired),
                                h.OnClick(
                                  Message.OpenedCompletion({ assetId: asset.id, scheduleId: schedule.scheduleId })
                                ),
                              ],
                              ['Mark done']
                            ),
                      ]
                    ),
                  ]
                ),
                opened?.scheduleId === schedule.scheduleId ? completion(asset.meter !== undefined) : null,
              ]
            )
          ),
          'No active schedules.',
          setup(AssetSetupAction.cases.AddSchedule.make({}), 'Add schedule', 'ArchiveSchedule')
        ),
        pendingWorkView(h)(model, { asset }),
        section(
          'Warranties',
          Arr.map(Record.values(asset.warranties), (warranty) =>
            h.li(
              [h.Key(warranty.id)],
              [
                h.p([], [h.strong([], [warranty.label]), ` · Expires ${warranty.expiresOn}`]),
                warranty.coverage === undefined ? null : h.p([], [warranty.coverage]),
                warranty.notes === undefined ? null : h.p([], [warranty.notes]),
                h.div(
                  [h.Class('flex flex-wrap items-center gap-2')],
                  [
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
                    ),
                  ]
                ),
              ]
            )
          ),
          'No warranties recorded.',
          setup(AssetSetupAction.cases.RecordWarranty.make({}), 'Record warranty', 'RemoveWarranty')
        ),
        section(
          'Links',
          Arr.map(Record.values(asset.links), (link) =>
            h.li(
              [h.Key(link.id), h.Class('flex flex-wrap items-center gap-2')],
              [
                renderLink(link.label, link.url) ?? link.label,
                setupButton(
                  AssetSetupAction.cases.AttachLink.make({ replacesLinkId: link.id }),
                  'Replace link',
                  link.label
                ),
                setupButton(AssetSetupAction.cases.RemoveLink.make({ linkId: link.id }), 'Remove link', link.label),
              ]
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
        section('Activity', activity.activity, model.activityCaughtUp ? 'No activity recorded.' : ''),
      ]
    )
  }

export const assetsView =
  (h: HtmlBuilder<Message>) =>
  (model: Model): Html => {
    const terms = Str.split(/\s+/u)(Str.toLowerCase(Str.trim(model.query)))
    const assets = Arr.sort(Record.values(model.catalog?.assets ?? {}), byName)
    const matches = Arr.filter(assets, (asset) => {
      const text = searchableText(asset)
      return Arr.every(terms, (term) => Str.includes(term)(text))
    })
    const detail = model.detail?.status === 'unregistered' ? null : model.detail
    return h.section(
      [h.Class('space-y-4')],
      [
        h.h2([h.Class('text-2xl font-semibold')], ['Assets']),
        h.label(
          [h.Class('block max-w-md text-sm font-medium')],
          [
            'Search assets',
            h.input([
              h.Class('mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base'),
              h.Type('search'),
              h.Value(model.query),
              h.OnInput((query) => Message.SearchedAssets({ query })),
              h.Placeholder('Name, make, model, serial number, location, or spec'),
            ]),
          ]
        ),
        h.div(
          [h.Class('grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')],
          [
            matches.length === 0
              ? h.p(
                  [h.Class('text-sm text-stone-600')],
                  [
                    model.catalog === null
                      ? ''
                      : assets.length === 0
                        ? 'No assets registered.'
                        : 'No assets match your search.',
                  ]
                )
              : h.ul(
                  [h.Class('space-y-2')],
                  Arr.map(matches, (asset) =>
                    h.li(
                      [h.Key(asset.id)],
                      [
                        h.button(
                          [
                            h.Type('button'),
                            h.Class(
                              'w-full rounded-xl border border-stone-200 bg-white p-3 text-left hover:border-teal-700 aria-pressed:border-teal-700 aria-pressed:bg-teal-50 disabled:opacity-50'
                            ),
                            h.AriaPressed(model.selected === asset.id ? 'true' : 'false'),
                            h.Disabled(model.attempt !== null),
                            h.OnClick(Message.SelectedAsset({ assetId: asset.id })),
                          ],
                          [
                            h.span([h.Class('block break-words font-semibold')], [asset.name]),
                            h.span(
                              [h.Class('block text-sm text-stone-600')],
                              [
                                Arr.join(
                                  Arr.filter(
                                    [
                                      asset.category,
                                      asset.location,
                                      asset.status === 'retired' ? 'retired' : undefined,
                                    ],
                                    (text) => text !== undefined
                                  ),
                                  ' · '
                                ),
                              ]
                            ),
                          ]
                        ),
                      ]
                    )
                  )
                ),
            detail === null
              ? model.selected === null || model.readFailures.detail
                ? null
                : h.p([h.Role('status')], ['Loading asset…'])
              : detailView(h)(model, detail),
          ]
        ),
      ]
    )
  }
