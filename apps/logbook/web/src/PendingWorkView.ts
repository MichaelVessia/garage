import type { Html } from '@effect/ui/html'
import type { PendingWork } from '@garage/logbook-domain/Asset/AddPendingWork.command'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import * as Record from 'effect/Record'

import { forms, secondaryButton } from './Forms.ts'
import { Editor, Message } from './Model.ts'
import type { CatalogAsset, Model } from './Model.ts'

type WorkAsset = Pick<CatalogAsset, 'id' | 'name' | 'status' | 'meter' | 'pendingWork'>
type WorkItem = { readonly asset: WorkAsset; readonly work: typeof PendingWork.Type }
const byDueDate = Order.mapInput(Order.String, ({ work }: WorkItem) => work.dueOn ?? '\uffff')

export const pendingWorkView =
  (h: Html.H<Message>) =>
  (model: Model, source: { readonly asset: WorkAsset } | { readonly assets: ReadonlyArray<WorkAsset> }) => {
    const selected = 'asset' in source ? source.asset : undefined
    const assets = 'asset' in source ? [source.asset] : source.assets
    const { addPendingWork, completion } = forms(h)(model)
    const adding = Editor.guards.AddPendingWork(model.editor)
    const opened = Editor.guards.CompletePendingWork(model.editor) ? model.editor : undefined
    const disabled = model.attempt !== null || model.sessionExpired
    const items = Arr.sort(
      Arr.flatMap(assets, (asset) =>
        asset.status === 'active' ? Arr.map(Record.values(asset.pendingWork ?? {}), (work) => ({ asset, work })) : []
      ),
      byDueDate
    )
    const isOpen = ({ asset, work }: WorkItem) => opened?.assetId === asset.id && opened.workId === work.workId

    return h.section
      .class('space-y-3 border-t border-stone-200 pt-4')
      .attr('aria-label', 'Pending Work')
      .children(
        h.h3.class('text-lg font-semibold').children('Pending Work'),
        selected === undefined
          ? undefined
          : adding
            ? addPendingWork()
            : selected.status === 'active'
              ? h.button
                  .attr('type', 'button')
                  .class(secondaryButton)
                  .disabled(disabled)
                  .on('click', Message.OpenedPendingWork())
                  .children('Add pending work')
              : undefined,
        opened !== undefined && !Arr.some(items, isOpen)
          ? completion(Arr.some(assets, (asset) => asset.id === opened.assetId && asset.meter !== undefined))
          : undefined,
        items.length === 0
          ? h.p.class('text-sm text-stone-600').children('No pending work.')
          : h.ul.class('grid gap-2').children(
              Arr.map(items, ({ asset, work }) => {
                const completing = isOpen({ asset, work })
                return h.li
                  .key(`${asset.id}/${work.workId}`)
                  .class('rounded-xl border border-stone-200 bg-white p-4')
                  .children(
                    h.div.class('flex flex-wrap items-start justify-between gap-3').children(
                      h.div
                        .class('min-w-0 break-words')
                        .children(
                          h.p.class('font-semibold').children(work.title),
                          selected === undefined ? h.p.class('text-sm text-stone-600').children(asset.name) : undefined,
                          work.dueOn === undefined
                            ? undefined
                            : h.p.class('text-sm text-stone-600').children(`Due ${work.dueOn}`),
                          work.notes === undefined
                            ? undefined
                            : h.p.class('whitespace-pre-wrap text-sm text-stone-700').children(work.notes)
                        ),
                      completing
                        ? undefined
                        : h.button
                            .attr('type', 'button')
                            .class(secondaryButton)
                            .disabled(disabled)
                            .on(
                              'click',
                              Message.OpenedPendingWorkCompletion({ assetId: asset.id, workId: work.workId })
                            )
                            .children('Mark done')
                    ),
                    completing ? h.div.class('mt-3').children(completion(asset.meter !== undefined)) : undefined
                  )
              })
            )
      )
  }
