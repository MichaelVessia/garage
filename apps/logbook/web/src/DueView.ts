import type { AssetId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { addDays, computeDueStatus, defaultWithinMeter } from '@garage/logbook-domain/ScheduleMath'
import type { DueThresholds, IsoDate } from '@garage/logbook-domain/Values'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import * as Record from 'effect/Record'
import * as Struct from 'effect/Struct'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { forms, secondaryButton } from './Forms.ts'
import { Editor, Message } from './Model.ts'
import type { CatalogAsset, Model } from './Model.ts'
import { pendingWorkView } from './PendingWorkView.ts'
import { assetPath } from './Route.ts'

type Task = DueThresholds & {
  readonly assetId: AssetId
  readonly assetName: string
  readonly scheduleId: ScheduleId
  readonly title: string
  readonly meter: CatalogAsset['meter']
}

type Expiry = Readonly<{
  assetName: string
  assetId: AssetId
  warrantyId: WarrantyId
  label: string
  expiresOn: IsoDate
}>
const byDueDate = Order.mapInput(Order.String, (item: Task) => item.nextDueOn ?? '\uffff')
const byExpiry = Order.mapInput(Order.String, (item: Expiry) => item.expiresOn)

const dueItems = (model: Model) => {
  const overdue: Array<Task> = []
  const dueSoon: Array<Task> = []
  const warranties: Array<Expiry> = []
  const warrantyHorizon = addDays(model.today, 60)
  for (const asset of Record.values(model.catalog?.assets ?? {})) {
    if (asset.status !== 'active') {
      continue
    }
    const identity = { assetId: asset.id, assetName: asset.name }
    const withinMeter = defaultWithinMeter(asset.meter?.unit)
    for (const [scheduleId, schedule] of Record.toEntries(asset.schedules)) {
      const input = {
        ...schedule,
        currentMeter: asset.meter?.reading,
        nowDate: model.today,
        withinDays: 30,
        withinMeter,
      }
      const status = computeDueStatus(
        input.currentMeter === undefined
          ? Struct.omit(input, ['currentMeter'])
          : { ...input, currentMeter: input.currentMeter }
      )
      const task = { ...identity, ...schedule, scheduleId, meter: asset.meter }
      if (status === 'overdue') {
        overdue.push(task)
      } else if (status === 'due_soon') {
        dueSoon.push(task)
      }
    }
    for (const [warrantyId, warranty] of Record.toEntries(asset.warranties)) {
      if (warranty.expiresOn >= model.today && warranty.expiresOn <= warrantyHorizon) {
        warranties.push({ ...identity, ...warranty, warrantyId })
      }
    }
  }
  return {
    overdue: Arr.sort(overdue, byDueDate),
    dueSoon: Arr.sort(dueSoon, byDueDate),
    warranties: Arr.sort(warranties, byExpiry),
  }
}

export const thresholdText = (item: DueThresholds & { readonly meter: CatalogAsset['meter'] }): string =>
  Arr.join(
    Arr.filter(
      [
        item.nextDueOn === undefined ? '' : `Due ${item.nextDueOn}`,
        item.nextDueMeter === undefined ? '' : `Due at ${item.nextDueMeter} ${item.meter?.unit ?? 'meter units'}`,
      ],
      (text) => text !== ''
    ),
    ' · '
  )

export const dueView =
  (h: HtmlBuilder<Message>) =>
  (model: Model): Html => {
    if (model.catalog === null) {
      return h.h2([h.Class('text-2xl font-semibold')], ['Due'])
    }
    const { overdue, dueSoon, warranties } = dueItems(model)
    const { completion } = forms(h)(model)
    const opened = Editor.guards.CompleteTask(model.editor) ? model.editor : null
    const isOpen = (task: Task) => opened?.assetId === task.assetId && opened.scheduleId === task.scheduleId
    const group = (label: string, empty: string, items: ReadonlyArray<Task>, accent: string) =>
      h.section(
        [h.Class('space-y-3'), h.AriaLabel(label)],
        [
          h.h3([h.Class(`text-lg font-semibold ${accent}`)], [label]),
          items.length === 0
            ? h.p([h.Class('text-sm text-stone-600')], [empty])
            : h.ul(
                [h.Class('grid gap-2')],
                Arr.map(items, (task) =>
                  h.li(
                    [
                      h.Key(`${task.assetId}/${task.scheduleId}`),
                      h.Class('rounded-xl border border-stone-200 bg-white p-4'),
                    ],
                    [
                      h.div(
                        [h.Class('flex flex-wrap items-center justify-between gap-3')],
                        [
                          h.div(
                            [],
                            [
                              h.p([h.Class('font-semibold')], [task.title]),
                              h.p(
                                [h.Class('text-sm text-stone-600')],
                                [
                                  h.a([h.Href(assetPath(task.assetId)), h.Class('underline')], [task.assetName]),
                                  ' · ',
                                  thresholdText(task),
                                ]
                              ),
                            ]
                          ),
                          isOpen(task)
                            ? null
                            : h.button(
                                [
                                  h.Type('button'),
                                  h.Class(secondaryButton),
                                  h.Disabled(model.attempt !== null || model.sessionExpired),
                                  h.OnClick(
                                    Message.OpenedCompletion({ assetId: task.assetId, scheduleId: task.scheduleId })
                                  ),
                                ],
                                ['Mark done']
                              ),
                        ]
                      ),
                      isOpen(task) ? h.div([h.Class('mt-3')], [completion(task.meter !== undefined)]) : null,
                    ]
                  )
                )
              ),
        ]
      )
    return h.div(
      [h.Class('space-y-6')],
      [
        h.h2([h.Class('text-2xl font-semibold')], ['Due']),
        opened !== null && !Arr.some(overdue, isOpen) && !Arr.some(dueSoon, isOpen)
          ? completion(model.catalog.assets[opened.assetId]?.meter !== undefined)
          : null,
        group('Overdue', 'No overdue tasks.', overdue, 'text-red-800'),
        group('Due Soon', 'No tasks due soon.', dueSoon, 'text-amber-800'),
        pendingWorkView(h)(model, { assets: Record.values(model.catalog.assets) }),
        h.section(
          [h.Class('space-y-3'), h.AriaLabel('Expiring Warranties')],
          [
            h.h3([h.Class('text-lg font-semibold')], ['Expiring Warranties']),
            warranties.length === 0
              ? h.p([h.Class('text-sm text-stone-600')], ['No warranties expire in the next 60 days.'])
              : h.ul(
                  [h.Class('grid gap-2')],
                  Arr.map(warranties, (warranty) =>
                    h.li(
                      [
                        h.Key(`${warranty.assetId}/${warranty.warrantyId}`),
                        h.Class('rounded-xl border border-stone-200 bg-white p-4'),
                      ],
                      [
                        h.p([h.Class('font-semibold')], [warranty.label]),
                        h.p(
                          [h.Class('text-sm text-stone-600')],
                          [
                            h.a([h.Href(assetPath(warranty.assetId)), h.Class('underline')], [warranty.assetName]),
                            ` · Expires ${warranty.expiresOn}`,
                          ]
                        ),
                      ]
                    )
                  )
                ),
          ]
        ),
      ]
    )
  }
