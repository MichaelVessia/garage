import type { ActivityEntry } from '@garage/logbook-domain/Asset/AssetActivity.view'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'
import * as Str from 'effect/String'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { dollarsFromCents } from './Model.ts'
import type { AssetDetails, Message } from './Model.ts'
import { webLink } from './WebLink.ts'

const describe = ({ event, at, scheduleTitle }: ActivityEntry) =>
  Match.valueTags(event, {
    AssetRegistered: ({ name }) => ({ title: `Registered ${name}`, at }),
    AssetRetired: ({ reason }) => ({ title: `Retired asset (${reason})`, at }),
    MeterRecorded: ({ reading, correction }) => ({
      title: `Meter ${correction ? 'corrected to' : 'recorded at'} ${reading}`,
      at,
    }),
    WarrantyRecorded: ({ label }) => ({ title: `Recorded warranty for ${label}`, at }),
    TaskCompleted: (work) => ({
      title: scheduleTitle ?? `Completed task ${work.scheduleId}`,
      date: work.completedOn,
      work,
    }),
    PendingWorkCompleted: (work) => ({ title: work.title, date: work.completedOn, work }),
    ServiceLogged: (work) => ({ title: work.title, date: work.performedOn, work }),
  })

type Work = Extract<ReturnType<typeof describe>, { work: unknown }>
const newestFirst = Order.mapInput(Order.flip(Order.String), (row: Work) => row.date)

const workDetails =
  (h: HtmlBuilder<Message>) =>
  ({ work }: Work, meter: AssetDetails['meter']): Html => {
    const fields = [
      ['Performed by', work.performedBy === 'diy' ? 'DIY' : 'Shop'],
      ['Vendor', work.vendor],
      ['Parts', Arr.join(work.parts ?? [], '\n')],
      ['Cost', work.costCents === undefined ? undefined : `$${dollarsFromCents(work.costCents)}`],
      ['Meter', work.meterReading === undefined ? undefined : Str.trim(`${work.meterReading} ${meter?.unit ?? ''}`)],
      ['Notes', work.notes],
    ] as const
    const link = webLink(h)
    const links = Arr.map(work.links ?? [], ({ label, url }) => link(label, url))

    return h.div(
      [h.Class('space-y-1')],
      [
        h.dl(
          [h.Class('grid gap-x-4 gap-y-1 sm:grid-cols-2')],
          Arr.map(fields, ([label, value]) =>
            value === undefined || value === ''
              ? null
              : h.div(
                  [h.Key(label)],
                  [
                    h.dt([h.Class('font-medium text-stone-700')], [label]),
                    h.dd([h.Class('whitespace-pre-wrap break-words')], [value]),
                  ]
                )
          )
        ),
        h.div([h.Class('flex flex-wrap gap-x-3 break-words')], links),
      ]
    )
  }

export const activityRows =
  (h: HtmlBuilder<Message>) => (activity: ReadonlyArray<ActivityEntry>, meter: AssetDetails['meter']) => {
    const rows = Arr.map(activity, (entry, index) => ({ ...describe(entry), key: String(activity.length - index) }))
    const [history, other] = Arr.partition(rows, (row) => ('work' in row ? Result.succeed(row) : Result.fail(row)))
    const item = (key: string, title: string, date: string, datetime: string, details: Html = null): Html =>
      h.li(
        [h.Key(key), h.Class('space-y-1 border-l-2 border-teal-200 pl-3')],
        [
          h.time([h.Datetime(datetime), h.Class('text-stone-600')], [date]),
          h.p([h.Class('font-medium break-words')], [title]),
          details,
        ]
      )
    const details = workDetails(h)
    return {
      history: Arr.map(Arr.sort(history, newestFirst), (row) =>
        item(row.key, row.title, row.date, row.date, details(row, meter))
      ),
      activity: Arr.map(other, ({ key, title, at }) =>
        item(key, title, DateTime.formatIsoDateUtc(at), DateTime.formatIso(at))
      ),
    }
  }
