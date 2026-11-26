import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'
import * as Record from 'effect/Record'
import * as Str from 'effect/String'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { thresholdText } from './DueView.ts'
import { forms, secondaryButton } from './Forms.ts'
import { Editor, Message } from './Model.ts'
import type { AssetSetupMode } from './Model.ts'
import type { AssetDetails, CatalogAsset, Model } from './Model.ts'

const byName = Order.mapInput(Order.String, (asset: CatalogAsset) => Str.toLowerCase(asset.name))
const searchableText = (asset: CatalogAsset): string =>
  Str.toLowerCase(
    Arr.join(
      [
        asset.name,
        asset.category,
        asset.location ?? '',
        ...Arr.flatMap(Record.values(asset.specs), ({ key, value }) => [key, value]),
      ],
      ' '
    )
  )

const activityLabel = (event: Model['activity'][number]['event']): string =>
  Match.valueTags(event, {
    AssetRegistered: ({ name }) => `Registered ${name}`,
    AssetRetired: ({ reason }) => `Retired asset (${reason})`,
    TaskCompleted: ({ scheduleId }) => `Completed task ${scheduleId}`,
    ServiceLogged: ({ title }) => title,
    MeterRecorded: ({ reading, correction }) => `Meter ${correction ? 'corrected to' : 'recorded at'} ${reading}`,
    WarrantyRecorded: ({ label }) => `Recorded warranty for ${label}`,
  })

const detailView =
  (h: HtmlBuilder<Message>) =>
  (model: Model, asset: AssetDetails): Html => {
    const section = (title: string, items: ReadonlyArray<Html>, empty: string, action: Html = null) =>
      h.section(
        [h.Class('space-y-2 border-t border-stone-200 pt-4')],
        [
          h.h3([h.Class('text-base font-semibold')], [title]),
          items.length === 0
            ? h.p([h.Class('text-sm text-stone-600')], [empty])
            : h.ul([h.Class('space-y-2 text-sm')], items),
          action,
        ]
      )

    const webLink = (label: string, url?: string) => {
      if (url === undefined || !URL.canParse(url)) {
        return null
      }
      const target = new URL(url)
      return target.protocol === 'https:' || target.protocol === 'http:'
        ? h.a([h.Href(target.href), h.Class('font-medium text-teal-800 underline underline-offset-2')], [label])
        : null
    }
    const opened = Editor.guards.CompleteTask(model.editor) ? model.editor : null
    const { completion, assetSetup } = forms(h)(model)
    const setup = (mode: typeof AssetSetupMode.Type, label: string): Html => {
      if (Editor.guards.AssetSetup(model.editor) && model.editor.mode === mode) {
        return assetSetup(model.editor)
      }
      return asset.status !== 'active'
        ? null
        : h.button(
            [
              h.Type('button'),
              h.Class(secondaryButton),
              h.Disabled(model.attempt !== null || model.sessionExpired),
              h.OnClick(Message.OpenedAssetSetup({ mode })),
            ],
            [label]
          )
    }
    return h.article(
      [h.Class('min-w-0 space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-5')],
      [
        h.h2([h.Class('text-xl font-semibold break-words')], [asset.name]),
        section(
          'Specs & Consumables',
          Arr.map(Record.values(asset.specs), (spec) =>
            h.li(
              [h.Key(spec.key), h.Class('flex flex-wrap items-baseline justify-between gap-x-3 break-words')],
              [h.span([], [h.strong([], [spec.key]), ' · ', spec.value]), webLink(`Reorder ${spec.key}`, spec.url)]
            )
          ),
          'No specs or consumables recorded.',
          setup('SetSpec', 'Set spec')
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
                    opened?.scheduleId === schedule.scheduleId || asset.status !== 'active'
                      ? null
                      : h.button(
                          [
                            h.Type('button'),
                            h.Class(secondaryButton),
                            h.Disabled(model.attempt !== null || model.sessionExpired),
                            h.OnClick(Message.OpenedCompletion({ assetId: asset.id, scheduleId: schedule.scheduleId })),
                          ],
                          ['Mark done']
                        ),
                  ]
                ),
                opened?.scheduleId === schedule.scheduleId ? completion(asset.meter !== undefined) : null,
              ]
            )
          ),
          'No active schedules.',
          setup('AddSchedule', 'Add schedule')
        ),
        section(
          'Warranties',
          Arr.map(Record.values(asset.warranties), (warranty) =>
            h.li(
              [h.Key(warranty.id)],
              [
                h.p([], [h.strong([], [warranty.label]), ` · Expires ${warranty.expiresOn}`]),
                warranty.coverage === undefined ? null : h.p([], [warranty.coverage]),
                warranty.notes === undefined ? null : h.p([], [warranty.notes]),
                webLink(`Open ${warranty.label}`, warranty.url),
              ]
            )
          ),
          'No warranties recorded.',
          setup('RecordWarranty', 'Record warranty')
        ),
        section(
          'Links',
          Arr.map(Record.values(asset.links), (link) =>
            h.li([h.Key(link.id)], [webLink(link.label, link.url) ?? link.label])
          ),
          'No links recorded.',
          setup('AttachLink', 'Attach link')
        ),
        section(
          'Activity',
          Arr.map(model.activity, ({ event, at }, index) =>
            h.li(
              [h.Key(String(model.activity.length - index)), h.Class('border-l-2 border-teal-200 pl-3')],
              [
                h.time(
                  [h.Datetime(DateTime.formatIso(at)), h.Class('text-stone-600')],
                  [DateTime.formatIsoDateUtc(at)]
                ),
                h.p([h.Class('font-medium')], [activityLabel(event)]),
              ]
            )
          ),
          'No activity recorded.'
        ),
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
              h.Placeholder('Name, location, category, or spec'),
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
