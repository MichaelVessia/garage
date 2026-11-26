import { Subscription } from '@effect/ui'
import { HtmlLocator, HtmlPlay, HtmlScene } from '@effect/ui/html/testing'
import { Locator, Story, TestHost } from '@effect/ui/testing'
import { assert, it } from '@effect/vitest'
import { AssetId, LinkId, PendingWorkId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { ActivityEntry } from '@garage/logbook-domain/Asset/AssetActivity.view'
import { PendingWorkCompleted } from '@garage/logbook-domain/Asset/CompletePendingWork.command'
import { TaskCompleted } from '@garage/logbook-domain/Asset/CompleteTask.command'
import { ServiceLogged } from '@garage/logbook-domain/Asset/LogService.command'
import { MeterRollback } from '@garage/logbook-domain/Asset/MeterRollback.rejection'
import { MeterRecorded } from '@garage/logbook-domain/Asset/RecordMeter.command'
import { ScheduleNotFound } from '@garage/logbook-domain/Asset/ScheduleNotFound.rejection'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import { IsoDate } from '@garage/logbook-domain/Values'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as Struct from 'effect/Struct'
import * as TestClock from 'effect/testing/TestClock'

import { Logbook } from '../src/Logbook.ts'
import { Message } from '../src/Model.ts'
import type { CatalogAsset, Model } from '../src/Model.ts'
import { AssetChange, SaveAsset } from '../src/SaveAsset.ts'

const truck = AssetId.make('truck')
const furnace = AssetId.make('furnace')
const oil = ScheduleId.make('oil-change')
const rotation = ScheduleId.make('rotate')
const inspection = ScheduleId.make('inspection')
const warranty = WarrantyId.make('powertrain')
const today = IsoDate.make('2026-11-24')
const props = { session: 'test-session', today }
const Failure = Schema.TaggedUnion({
  Denied: { error: Unauthorized },
  Unknown: {},
})
const RejectedCompletion = Schema.TaggedStruct('Rejected', { rejection: ScheduleNotFound })
const RejectedMeter = Schema.TaggedStruct('Rejected', { rejection: MeterRollback })

const truckAsset: CatalogAsset = {
  id: truck,
  name: 'Truck',
  category: 'vehicle',
  make: 'Ford',
  model: 'Ranger',
  serialNumber: 'TRK-482',
  purchasedOn: IsoDate.make('2024-06-07'),
  purchasePriceCents: 1_234_567,
  location: 'Driveway',
  status: 'active',
  meter: { unit: 'miles', reading: 40_000 },
  specs: { 'Oil filter': { key: 'Oil filter', value: 'FL-500S', url: 'https://parts.example/filter' } },
  schedules: {
    [oil]: { title: 'Change oil', nextDueOn: IsoDate.make('2026-11-20') },
    [rotation]: { title: 'Rotate tires', nextDueMeter: 40_300 },
    [inspection]: { title: 'Annual inspection', nextDueOn: IsoDate.make('2027-03-01') },
  },
  warranties: { [warranty]: { label: 'Powertrain warranty', expiresOn: IsoDate.make('2026-12-18') } },
}
const catalog: NonNullable<Model['catalog']> = {
  assets: {
    [truck]: truckAsset,
    [furnace]: {
      id: furnace,
      name: 'Furnace',
      category: 'home',
      status: 'active',
      specs: {},
      schedules: {},
      warranties: {},
    },
  },
  spendByYear: {},
}
const catalogReceived = Message.ReceivedCatalog({ catalog })
const completion = SaveAsset.make({
  target: truck,
  commandId: 'test-session:0',
  change: AssetChange.CompleteTask({ input: { scheduleId: oil, performedBy: 'diy' } }),
})

const { label, role } = HtmlLocator
const { inside, tag, text } = Locator
const button = (name: string | RegExp) => role('button', { name })
const detailKey = Subscription.keyOf('detail', truck)
const activityKey = Subscription.keyOf('activity', truck)

it.effect('places tasks and warranties in the correct groups when the catalog arrives', () =>
  Effect.gen(function* () {
    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .expect(inside(role('region', { name: 'Overdue' }), text('Change oil')))
      .toExist()
      .expect(inside(role('region', { name: 'Due Soon' }), text('Rotate tires')))
      .toExist()
      .expect(inside(role('region', { name: 'Expiring Warranties' }), text('Powertrain warranty')))
      .toExist()
      .expect(text('Annual inspection'))
      .toBeAbsent()
  })
)

it.effect('shows only hours-metered tasks within the due window', () =>
  Effect.gen(function* () {
    const generator = AssetId.make('generator')
    const nextDueOn = IsoDate.make('2028-11-24')
    const generatorAsset: CatalogAsset = {
      id: generator,
      name: 'Generator',
      category: 'equipment',
      status: 'active',
      meter: { unit: 'hours', reading: 0 },
      specs: {},
      schedules: {
        [oil]: { title: 'Change generator oil', nextDueOn, nextDueMeter: 200 },
        [inspection]: { title: 'Inspect generator', nextDueOn, nextDueMeter: 25 },
      },
      warranties: {},
    }
    const dueSoon = role('region', { name: 'Due Soon' })

    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription(
        'catalog',
        Message.ReceivedCatalog({ catalog: { ...catalog, assets: { [generator]: generatorAsset } } })
      )
      .expect(inside(dueSoon, text('Inspect generator')))
      .toExist()
      .expect(inside(dueSoon, text('Change generator oil')))
      .toBeAbsent()
  })
)

it.effect('finds spec keys and values and opens live asset detail and activity', () =>
  Effect.gen(function* () {
    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(button('Assets'))
      .type(label('Search assets'), 'filter')
      .expect(role('button', { name: /Furnace/u }))
      .toBeAbsent()
      .expect(role('button', { name: /Truck/u }))
      .toExist()
      .type(label('Search assets'), 'FL-500S')
      .click(role('button', { name: /Truck/u }))
      .expect(text('Loading asset…'))
      .toExist()
      .subscription(
        detailKey,
        Message.ReceivedDetail({
          detail: { ...truckAsset, schedules: {}, warranties: {}, links: {}, totalSpendCents: 0 },
        })
      )
      .expect(role('heading', { name: 'Specs & Consumables' }))
      .toExist()
      .expect(role('link', { name: 'Reorder Oil filter' }))
      .toHaveAttribute('href', 'https://parts.example/filter')
      .expect(text('40000 miles'))
      .toExist()
      .subscription(
        activityKey,
        Message.ReceivedActivity({
          cursor: 5,
          entry: ActivityEntry.make({
            assetId: truck,
            at: DateTime.makeUnsafe(today),
            event: MeterRecorded.make({
              reading: 40_000,
              recordedOn: today,
              previousReading: 39_500,
              correction: false,
            }),
          }),
        })
      )
      .expect(text('Meter recorded at 40000'))
      .toExist()
  })
)

it.effect('finds assets by make, model, and serial number', () =>
  Effect.gen(function* () {
    const truckResult = role('button', { name: /Truck/u })
    const furnaceResult = role('button', { name: /Furnace/u })
    const search = label('Search assets')
    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(button('Assets'))
      .expect(furnaceResult)
      .toExist()
      .type(search, 'FORD')
      .expect(truckResult)
      .toExist()
      .expect(furnaceResult)
      .toBeAbsent()
      .type(search, 'ranger')
      .expect(truckResult)
      .toExist()
      .type(search, 'trk-482')
      .expect(truckResult)
      .toExist()
      .type(search, 'trk-999')
      .expect(truckResult)
      .toBeAbsent()
  })
)

it.effect('shows past service and task details in performed date order as they arrive', () =>
  Effect.gen(function* () {
    const history = role('region', { name: 'Service history' })
    const latest = inside(history, role('listitem'))
    const received = (cursor: number, event: ActivityEntry['event'], scheduleTitle?: string) => {
      const entry = { assetId: truck, at: DateTime.makeUnsafe(today), event }
      return Message.ReceivedActivity({
        cursor,
        entry: ActivityEntry.make(scheduleTitle === undefined ? entry : { ...entry, scheduleTitle }),
      })
    }
    const completion = TaskCompleted.make({
      scheduleId: oil,
      performedBy: 'shop',
      completedOn: IsoDate.make('2026-11-12'),
      vendor: 'Local garage',
      parts: ['FL-500S'],
      costCents: 0,
      meterReading: 40_000,
      notes: 'Used the spare filter.',
      links: [
        { id: LinkId.make('receipt'), label: 'Oil change receipt', url: 'https://parts.example/receipt' },
        { id: LinkId.make('unsafe'), label: 'Unsafe link', url: 'javascript:void(0)' },
      ],
    })
    const service = ServiceLogged.make({
      title: 'Replace battery',
      performedBy: 'diy',
      performedOn: IsoDate.make('2026-10-02'),
      parts: ['Group 65 battery'],
      links: [{ id: LinkId.make('manual'), label: 'Battery manual', url: 'http://parts.example/manual' }],
    })

    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(button('Assets'))
      .click(role('button', { name: /Truck/u }))
      .subscription(
        detailKey,
        Message.ReceivedDetail({
          detail: { ...truckAsset, schedules: {}, warranties: {}, links: {}, totalSpendCents: 0 },
        })
      )
      .expect(text('Loading service history…'))
      .toExist()
      .subscription(activityKey, received(2, completion, 'Archived oil change'))
      .subscription(activityKey, Message.ActivityCaughtUp())
      .expect(latest)
      .toHaveText(/Archived oil change/u)
      .expect(inside(latest, tag('time')))
      .toHaveText('2026-11-12')
      .expect(inside(history, text(today)))
      .toBeAbsent()
      .expect(text('Local garage'))
      .toExist()
      .expect(text('Shop'))
      .toExist()
      .expect(text('FL-500S'))
      .toExist()
      .expect(text('$0.00'))
      .toExist()
      .expect(text('Used the spare filter.'))
      .toExist()
      .expect(text('40000 miles'))
      .toExist()
      .expect(role('link', { name: 'Oil change receipt' }))
      .toHaveAttribute('href', 'https://parts.example/receipt')
      .expect(role('link', { name: 'Unsafe link' }))
      .toBeAbsent()
      .subscription(activityKey, received(3, service))
      .expect(inside(history, text('FL-500S')))
      .toHaveText(/FL-500S/u)
      .expect(text('Replace battery'))
      .toExist()
      .expect(text('Group 65 battery'))
      .toExist()
      .expect(text('DIY'))
      .toExist()
      .expect(role('link', { name: 'Battery manual' }))
      .toHaveAttribute('href', 'http://parts.example/manual')
  })
)

it.effect('shows asset metadata and saves only the fields changed in the edit form', () =>
  Effect.gen(function* () {
    const detail = {
      ...truckAsset,
      notes: 'Keep the spare key in the garage.',
      schedules: {},
      warranties: {},
      links: {},
      totalSpendCents: 0,
    }
    const command = SaveAsset.make({
      target: truck,
      commandId: 'test-session:0',
      change: AssetChange.UpdateAsset({ input: { serialNumber: null, purchasePriceCents: 0, location: 'Garage' } }),
    })

    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(button('Assets'))
      .click(role('button', { name: /Truck/u }))
      .subscription(detailKey, Message.ReceivedDetail({ detail }))
      .expect(text('Ford'))
      .toExist()
      .expect(text('Ranger'))
      .toExist()
      .expect(text('TRK-482'))
      .toExist()
      .expect(text('2024-06-07'))
      .toExist()
      .expect(text('$12345.67'))
      .toExist()
      .expect(text('Driveway'))
      .toExist()
      .expect(text('Keep the spare key in the garage.'))
      .toExist()
      .click(button('Edit asset'))
      .expect(label('Asset name'))
      .toHaveValue('Truck')
      .expect(label('Category'))
      .toHaveValue('vehicle')
      .expect(label('Make (optional)'))
      .toHaveValue('Ford')
      .expect(label('Model (optional)'))
      .toHaveValue('Ranger')
      .expect(label('Serial number (optional)'))
      .toHaveValue('TRK-482')
      .expect(label('Purchase date (optional, YYYY-MM-DD)'))
      .toHaveValue('2024-06-07')
      .expect(label('Purchase price in USD (optional)'))
      .toHaveValue('12345.67')
      .expect(label('Location (optional)'))
      .toHaveValue('Driveway')
      .expect(label('Notes (optional)'))
      .toHaveValue('Keep the spare key in the garage.')
      .subscription(detailKey, Message.ReceivedDetail({ detail: { ...detail, notes: 'New spare key location.' } }))
      .type(label('Serial number (optional)'), '')
      .type(label('Purchase price in USD (optional)'), '0')
      .type(label('Location (optional)'), 'Garage')
      .click(button('Save asset'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId: 'test-session:0' } }))
      .expect(text('Saved.'))
      .toExist()
      .expect(role('button', { name: 'Save asset' }))
      .toBeAbsent()
      .subscription(
        detailKey,
        Message.ReceivedDetail({
          detail: {
            ...Struct.omit(detail, ['serialNumber']),
            purchasePriceCents: 0,
            location: 'Garage',
            notes: 'New spare key location.',
          },
        })
      )
      .expect(text('TRK-482'))
      .toBeAbsent()
      .expect(text('$0.00'))
      .toExist()
      .expect(text('Garage'))
      .toExist()
      .expect(text('New spare key location.'))
      .toExist()
  })
)

it.effect('saves a due task and closes the inline form on success', () =>
  Effect.gen(function* () {
    const command = SaveAsset.make({
      target: truck,
      commandId: 'test-session:0',
      change: AssetChange.CompleteTask({
        input: {
          scheduleId: oil,
          performedBy: 'shop',
          completedOn: IsoDate.make('2026-11-06'),
          costCents: 4525,
          meterReading: 40_100,
          vendor: 'Local shop',
          notes: 'New filter',
          parts: ['FL-500S', '5W-30 oil'],
        },
      }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(inside(role('region', { name: 'Overdue' }), button('Mark done')))
      .type(label('Performed date (optional, YYYY-MM-DD)'), '2026-11-06')
      .change(label('Performed by'), 'shop')
      .type(label('Cost in USD (optional)'), '45.25')
      .type(label('Meter reading (optional)'), '40100')
      .type(label('Vendor (optional)'), 'Local shop')
      .type(label('Notes (optional)'), 'New filter')
      .type(label('Parts (optional, one per line)'), '  FL-500S  \n\n 5W-30 oil')
      .click(button('Save completion'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId: 'test-session:0' } }))
      .expect(text('Saved.'))
      .toExist()
      .expect(role('button', { name: 'Save completion' }))
      .toBeAbsent()
  })
)

it.effect('keeps the inline form open and explains a rejected completion', () =>
  Effect.gen(function* () {
    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(inside(role('region', { name: 'Overdue' }), button('Mark done')))
      .click(button('Save completion'))
      .expectExact(completion)
      .resolve(
        completion,
        Message.ReceivedResult({
          result: {
            commandId: 'test-session:0',
            failure: RejectedCompletion.make({ rejection: ScheduleNotFound.make({ scheduleId: oil }) }),
          },
        })
      )
      .expect(role('alert'))
      .toHaveText('This schedule is no longer active.')
      .expect(role('button', { name: 'Save completion' }))
      .toBeDisabled(false)
  })
)

it.effect('adds undated work in asset detail and completes it from the household due screen', () =>
  Effect.gen(function* () {
    const workId = PendingWorkId.make('test-session:0')
    const work = { workId, title: 'Replace door seal', notes: 'Spare seal in garage cabinet.' }
    const detail = { ...truckAsset, schedules: {}, warranties: {}, links: {}, totalSpendCents: 0 }
    const pendingWork = { [workId]: work }
    const updatedCatalog = Message.ReceivedCatalog({
      catalog: { ...catalog, assets: { [truck]: { ...truckAsset, pendingWork } } },
    })
    const added = SaveAsset.make({
      target: truck,
      commandId: 'test-session:0',
      change: AssetChange.AddPendingWork({ input: work }),
    })
    const details = {
      workId,
      performedBy: 'diy',
      completedOn: today,
      costCents: 4599,
      parts: ['Door seal', 'Clips'],
    } as const
    const completed = SaveAsset.make({
      target: truck,
      commandId: 'test-session:1',
      change: AssetChange.CompletePendingWork({ input: details }),
    })
    const pending = role('region', { name: 'Pending Work' })
    const activity = Message.ReceivedActivity({
      cursor: 5,
      entry: ActivityEntry.make({
        assetId: truck,
        at: DateTime.makeUnsafe(today),
        event: PendingWorkCompleted.make({ ...details, title: work.title }),
      }),
    })

    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(button('Assets'))
      .click(role('button', { name: /Truck/u }))
      .subscription(detailKey, Message.ReceivedDetail({ detail }))
      .click(button('Add pending work'))
      .type(label('Work title'), work.title)
      .type(label('Notes for parts or location (optional)'), work.notes)
      .click(button('Save pending work'))
      .expectExact(added)
      .resolve(added, Message.ReceivedResult({ result: { commandId: 'test-session:0' } }))
      .subscription(detailKey, Message.ReceivedDetail({ detail: { ...detail, pendingWork } }))
      .expect(inside(pending, text(work.title)))
      .toExist()
      .expect(inside(pending, text(work.notes)))
      .toExist()
      .click(button('Due'))
      .subscription('catalog', updatedCatalog)
      .expect(inside(pending, text(work.title)))
      .toExist()
      .click(inside(pending, role('button', { name: 'Mark done' })))
      .type(label('Performed date (optional, YYYY-MM-DD)'), today)
      .type(label('Cost in USD (optional)'), '45.99')
      .type(label('Parts (optional, one per line)'), 'Door seal\nClips')
      .click(button('Save completion'))
      .expectExact(completed)
      .resolve(
        completed,
        Message.ReceivedResult({ result: { commandId: 'test-session:1', failure: Failure.cases.Unknown.make({}) } })
      )
      .subscription('catalog', catalogReceived)
      .expect(inside(pending, text(work.title)))
      .toBeAbsent()
      .click(button('Retry save'))
      .expectExact(completed)
      .resolve(completed, Message.ReceivedResult({ result: { commandId: 'test-session:1' } }))
      .expect(text('No pending work.'))
      .toExist()
      .click(button('Assets'))
      .subscription(detailKey, Message.ReceivedDetail({ detail: { ...detail, totalSpendCents: 4599 } }))
      .subscription(activityKey, activity)
      .expect(inside(pending, text(work.title)))
      .toBeAbsent()
      .expect(text('Replace door seal'))
      .toExist()
      .expect(text('$45.99'))
      .toExist()
  })
)

it.effect('uses the same command ID and input when the save outcome is unknown', () =>
  Effect.gen(function* () {
    const scene = yield* Story.make(Logbook, props)
    scene
      .send(catalogReceived)
      .send(Message.OpenedCompletion({ assetId: truck, scheduleId: oil }))
      .send(Message.Submitted())
      .expectExact(completion)
      .resolve(
        completion,
        Message.ReceivedResult({ result: { commandId: 'test-session:0', failure: Failure.cases.Unknown.make({}) } })
      )
      .send(Message.EditedField({ field: 'notes', value: 'A different request' }))
      .send(Message.Submitted())
      .expectExact(completion)
      .resolve(completion, Message.ReceivedResult({ result: { commandId: 'test-session:0' } }))
  })
)

it.effect('shows both readings on rollback and permits an explicit correction', () =>
  Effect.gen(function* () {
    const reading = SaveAsset.make({
      target: truck,
      commandId: 'test-session:0',
      change: AssetChange.RecordMeter({ input: { reading: 39_900, correction: false } }),
    })
    const correction = SaveAsset.make({
      target: truck,
      commandId: 'test-session:1',
      change: AssetChange.RecordMeter({ input: { reading: 39_900, correction: true } }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(button('Quick Log'))
      .change(label('Asset'), truck)
      .type(label('Meter reading (miles)'), '39900')
      .click(button('Save reading'))
      .expectExact(reading)
      .resolve(
        reading,
        Message.ReceivedResult({
          result: {
            commandId: 'test-session:0',
            failure: RejectedMeter.make({ rejection: MeterRollback.make({ current: 40_000, submitted: 39_900 }) }),
          },
        })
      )
      .expect(role('alert'))
      .toHaveText(/The current reading is 40000\. You entered 39900\./u)
      .click(label('Save as a correction'))
      .click(button('Save reading'))
      .expectExact(correction)
      .resolve(correction, Message.ReceivedResult({ result: { commandId: 'test-session:1' } }))
      .expect(text('Saved.'))
      .toExist()
  })
)

it.effect('asks for sign-in when a command is denied', () =>
  Effect.gen(function* () {
    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(inside(role('region', { name: 'Overdue' }), button('Mark done')))
      .click(button('Save completion'))
      .resolve(
        completion,
        Message.ReceivedResult({
          result: { commandId: 'test-session:0', failure: Failure.cases.Denied.make({ error: Unauthorized.make({}) }) },
        })
      )
      .expect(role('alert'))
      .toHaveText('Session expired. Reload to sign in.')
      .expect(role('button', { name: 'Save completion' }))
      .toBeDisabled()
  })
)

it.effect('logs unscheduled service and registers a new asset', () =>
  Effect.gen(function* () {
    const service = SaveAsset.make({
      target: furnace,
      commandId: 'test-session:0',
      change: AssetChange.LogService({
        input: {
          title: 'Replace igniter',
          performedBy: 'diy',
          performedOn: IsoDate.make('2026-11-10'),
          parts: ['Hot surface igniter'],
        },
      }),
    })
    const registration = SaveAsset.make({
      target: AssetId.make('test-session:1'),
      commandId: 'test-session:1',
      change: AssetChange.RegisterAsset({
        input: {
          name: 'Generator',
          category: 'equipment',
          make: 'Honda',
          model: 'EU2200i',
          serialNumber: 'GEN-7',
          purchasedOn: IsoDate.make('2026-11-10'),
          purchasePriceCents: 109_999,
          location: 'Shed',
          notes: 'Store with the cover.',
          meterUnit: 'hours',
          initialMeter: 0,
        },
      }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    scene
      .subscription('catalog', catalogReceived)
      .click(button('Quick Log'))
      .click(button('Log service'))
      .change(label('Asset'), furnace)
      .type(label('Service title'), 'Replace igniter')
      .type(label('Performed date (optional, YYYY-MM-DD)'), '2026-11-31')
      .click(button('Save service'))
      .expect(role('alert'))
      .toHaveText('Enter a valid performed date.')
      .type(label('Performed date (optional, YYYY-MM-DD)'), '2026-11-10')
      .type(label('Parts (optional, one per line)'), 'Hot surface igniter')
      .click(button('Save service'))
      .expectExact(service)
      .resolve(service, Message.ReceivedResult({ result: { commandId: 'test-session:0' } }))
      .expect(text('Saved.'))
      .toExist()
      .click(button('New asset'))
      .type(label('Asset name'), 'Generator')
      .change(label('Category'), 'equipment')
      .type(label('Make (optional)'), 'Honda')
      .type(label('Model (optional)'), 'EU2200i')
      .type(label('Serial number (optional)'), 'GEN-7')
      .type(label('Purchase date (optional, YYYY-MM-DD)'), '2026-11-31')
      .click(button('Register asset'))
      .expect(role('alert'))
      .toHaveText('Enter a purchase date in YYYY-MM-DD format.')
      .type(label('Purchase date (optional, YYYY-MM-DD)'), '2026-11-10')
      .type(label('Purchase price in USD (optional)'), '1099.999')
      .click(button('Register asset'))
      .expect(role('alert'))
      .toHaveText('Enter a purchase price in dollars with up to two decimal places.')
      .type(label('Purchase price in USD (optional)'), '1099.99')
      .type(label('Location (optional)'), 'Shed')
      .type(label('Notes (optional)'), 'Store with the cover.')
      .change(label('Meter unit (optional)'), 'hours')
      .type(label('Initial meter reading (optional)'), '0')
      .click(button('Register asset'))
      .expectExact(registration)
      .resolve(registration, Message.ReceivedResult({ result: { commandId: 'test-session:1' } }))
      .expect(text('Saved.'))
      .toExist()
  })
)

it.effect('runs the catalog watch and retries a save with the same RPC request', () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(DateTime.makeUnsafe(today).pipe(DateTime.toEpochMillis))
    const requests = yield* Ref.make<
      ReadonlyArray<{
        readonly target: AssetId
        readonly input: typeof AssetChange.cases.CompleteTask.Type.input
        readonly commandId?: string
      }>
    >([])
    const unhandledRead = {
      watch: () => Stream.die('Unexpected view watch'),
      get: () => Effect.die('Unexpected view get'),
      snapshot: () => Effect.die('Unexpected view snapshot'),
      events: () => Stream.die('Unexpected view events'),
      list: () => Effect.die('Unexpected view list'),
    }
    const api = Layer.mock(LogbookApi.Client, {
      HomeCatalog: { ...unhandledRead, watch: () => Stream.succeed({ state: catalog, cursor: 0 }) },
      AssetDetail: unhandledRead,
      AssetActivity: unhandledRead,
      CompleteTask: (target, input, options) =>
        Ref.getAndUpdate(requests, (previous) => [
          ...previous,
          { target, input, ...Struct.pick(options ?? {}, ['commandId']) },
        ]).pipe(
          Effect.flatMap((previous) =>
            previous.length === 0
              ? Effect.die('Connection closed')
              : Effect.succeed({ stream: 'Asset/truck', version: 4, reply: undefined })
          )
        ),
    })
    const runtime = Layer.merge(TestHost.layer(), api)

    yield* Effect.gen(function* () {
      const play = yield* HtmlPlay.make(Logbook, props)
      yield* play.expect(inside(role('region', { name: 'Overdue' }), text('Change oil'))).toExist()
      yield* play.click(inside(role('region', { name: 'Overdue' }), button('Mark done')))
      yield* play.click(button('Save completion'))
      yield* play.expect(button('Retry save')).toExist()
      yield* play.click(button('Retry save'))
      yield* play.expect(text('Saved.')).toExist()

      const expected = {
        target: truck,
        input: { scheduleId: oil, performedBy: 'diy' },
        commandId: 'test-session:0',
      } as const
      const recorded = yield* Ref.get(requests)
      assert.deepStrictEqual(recorded, [expected, expected])
    }).pipe(Effect.provide(runtime))
  })
)
