import type { PendingWork } from '@garage/logbook-domain/Asset/AddPendingWork.command'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import * as Record from 'effect/Record'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { forms, secondaryButton } from './Forms.ts'
import { Editor, Message } from './Model.ts'
import type { CatalogAsset, Model } from './Model.ts'

type WorkAsset = Pick<CatalogAsset, 'id' | 'name' | 'status' | 'meter' | 'pendingWork'>
type WorkItem = { readonly asset: WorkAsset; readonly work: typeof PendingWork.Type }
const byDueDate = Order.mapInput(Order.String, ({ work }: WorkItem) => work.dueOn ?? '\uffff')

export const pendingWorkView =
  (h: HtmlBuilder<Message>) =>
  (model: Model, source: { readonly asset: WorkAsset } | { readonly assets: ReadonlyArray<WorkAsset> }): Html => {
    const selected = 'asset' in source ? source.asset : undefined
    const assets = 'asset' in source ? [source.asset] : source.assets
    const { addPendingWork, completion } = forms(h)(model)
    const adding = Editor.guards.AddPendingWork(model.editor)
    const opened = Editor.guards.CompletePendingWork(model.editor) ? model.editor : null
    const disabled = model.attempt !== null || model.sessionExpired
    const items = Arr.sort(
      Arr.flatMap(assets, (asset) =>
        asset.status === 'active' ? Arr.map(Record.values(asset.pendingWork ?? {}), (work) => ({ asset, work })) : []
      ),
      byDueDate
    )
    const isOpen = ({ asset, work }: WorkItem) => opened?.assetId === asset.id && opened.workId === work.workId

    return h.section(
      [h.Class('space-y-3 border-t border-stone-200 pt-4'), h.AriaLabel('Pending Work')],
      [
        h.h3([h.Class('text-lg font-semibold')], ['Pending Work']),
        selected === undefined
          ? null
          : adding
            ? addPendingWork()
            : selected.status === 'active'
              ? h.button(
                  [
                    h.Type('button'),
                    h.Class(secondaryButton),
                    h.Disabled(disabled),
                    h.OnClick(Message.OpenedPendingWork()),
                  ],
                  ['Add pending work']
                )
              : null,
        opened !== null && !Arr.some(items, isOpen)
          ? completion(Arr.some(assets, (asset) => asset.id === opened.assetId && asset.meter !== undefined))
          : null,
        items.length === 0
          ? h.p([h.Class('text-sm text-stone-600')], ['No pending work.'])
          : h.ul(
              [h.Class('grid gap-2')],
              Arr.map(items, ({ asset, work }) => {
                const completing = isOpen({ asset, work })
                return h.li(
                  [h.Key(`${asset.id}/${work.workId}`), h.Class('rounded-xl border border-stone-200 bg-white p-4')],
                  [
                    h.div(
                      [h.Class('flex flex-wrap items-start justify-between gap-3')],
                      [
                        h.div(
                          [h.Class('min-w-0 break-words')],
                          [
                            h.p([h.Class('font-semibold')], [work.title]),
                            selected === undefined ? h.p([h.Class('text-sm text-stone-600')], [asset.name]) : null,
                            work.dueOn === undefined
                              ? null
                              : h.p([h.Class('text-sm text-stone-600')], [`Due ${work.dueOn}`]),
                            work.notes === undefined
                              ? null
                              : h.p([h.Class('whitespace-pre-wrap text-sm text-stone-700')], [work.notes]),
                          ]
                        ),
                        completing
                          ? null
                          : h.button(
                              [
                                h.Type('button'),
                                h.Class(secondaryButton),
                                h.Disabled(disabled),
                                h.OnClick(
                                  Message.OpenedPendingWorkCompletion({ assetId: asset.id, workId: work.workId })
                                ),
                              ],
                              ['Mark done']
                            ),
                      ]
                    ),
                    completing ? h.div([h.Class('mt-3')], [completion(asset.meter !== undefined)]) : null,
                  ]
                )
              })
            ),
      ]
    )
  }
