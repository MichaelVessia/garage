import type { Html } from '@effect/ui/html'
import type { AssetId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { addDays, computeDueStatus, defaultWithinMeter } from '@garage/logbook-domain/ScheduleMath'
import type { DueThresholds, IsoDate } from '@garage/logbook-domain/Values'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import * as Record from 'effect/Record'
import * as Struct from 'effect/Struct'

import { forms, secondaryButton } from './Forms.ts'
import { Editor, Message } from './Model.ts'
import type { CatalogAsset, Model } from './Model.ts'
import { pendingWorkView } from './PendingWorkView.ts'
import { assetPath } from './Route.ts'
import { appLink } from './WebLink.ts'

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

export const dueView = (h: Html.H<Message>) => (model: Model) => {
  if (model.catalog === null) {
    return h.h2.class('text-2xl font-semibold').children('Due')
  }
  const { overdue, dueSoon, warranties } = dueItems(model)
  const { completion } = forms(h)(model)
  const opened = Editor.guards.CompleteTask(model.editor) ? model.editor : undefined
  const isOpen = (task: Task) => opened?.assetId === task.assetId && opened.scheduleId === task.scheduleId
  const group = (label: string, empty: string, items: ReadonlyArray<Task>, accent: string) =>
    h.section
      .class('space-y-3')
      .attr('aria-label', label)
      .children(
        h.h3.class(`text-lg font-semibold ${accent}`).children(label),
        items.length === 0
          ? h.p.class('text-sm text-stone-600').children(empty)
          : h.ul.class('grid gap-2').children(
              Arr.map(items, (task) =>
                h.li
                  .key(`${task.assetId}/${task.scheduleId}`)
                  .class('rounded-xl border border-stone-200 bg-white p-4')
                  .children(
                    h.div.class('flex flex-wrap items-center justify-between gap-3').children(
                      h.div.children(
                        h.p.class('font-semibold').children(task.title),
                        h.p
                          .class('text-sm text-stone-600')
                          .children(
                            appLink(h)(model, assetPath(task.assetId)).class('underline').children(task.assetName),
                            ' · ',
                            thresholdText(task)
                          )
                      ),
                      isOpen(task)
                        ? undefined
                        : h.button
                            .attr('type', 'button')
                            .class(secondaryButton)
                            .disabled(model.attempt !== null || model.sessionExpired)
                            .on(
                              'click',
                              Message.OpenedCompletion({ assetId: task.assetId, scheduleId: task.scheduleId })
                            )
                            .children('Mark done')
                    ),
                    isOpen(task) ? h.div.class('mt-3').children(completion(task.meter !== undefined)) : undefined
                  )
              )
            )
      )
  return h.div.class('space-y-6').children(
    h.h2.class('text-2xl font-semibold').children('Due'),
    opened !== undefined && !Arr.some(overdue, isOpen) && !Arr.some(dueSoon, isOpen)
      ? completion(model.catalog.assets[opened.assetId]?.meter !== undefined)
      : undefined,
    group('Overdue', 'No overdue tasks.', overdue, 'text-red-800'),
    group('Due Soon', 'No tasks due soon.', dueSoon, 'text-amber-800'),
    pendingWorkView(h)(model, { assets: Record.values(model.catalog.assets) }),
    h.section
      .class('space-y-3')
      .attr('aria-label', 'Expiring Warranties')
      .children(
        h.h3.class('text-lg font-semibold').children('Expiring Warranties'),
        warranties.length === 0
          ? h.p.class('text-sm text-stone-600').children('No warranties expire in the next 60 days.')
          : h.ul.class('grid gap-2').children(
              Arr.map(warranties, (warranty) =>
                h.li
                  .key(`${warranty.assetId}/${warranty.warrantyId}`)
                  .class('rounded-xl border border-stone-200 bg-white p-4')
                  .children(
                    h.p.class('font-semibold').children(warranty.label),
                    h.p
                      .class('text-sm text-stone-600')
                      .children(
                        appLink(h)(model, assetPath(warranty.assetId)).class('underline').children(warranty.assetName),
                        ` · Expires ${warranty.expiresOn}`
                      )
                  )
              )
            )
      )
  )
}
