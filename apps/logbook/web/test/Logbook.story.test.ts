import { it } from '@effect/vitest'
import { AssetId, LinkId, PendingWorkId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { ActivityEntry } from '@garage/logbook-domain/Asset/AssetActivity.view'
import { PendingWorkCompleted } from '@garage/logbook-domain/Asset/CompletePendingWork.command'
import { TaskCompleted } from '@garage/logbook-domain/Asset/CompleteTask.command'
import { ServiceLogged } from '@garage/logbook-domain/Asset/LogService.command'
import { MeterRollback } from '@garage/logbook-domain/Asset/MeterRollback.rejection'
import { MeterRecorded } from '@garage/logbook-domain/Asset/RecordMeter.command'
import { ScheduleNotFound } from '@garage/logbook-domain/Asset/ScheduleNotFound.rejection'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import { IsoDate } from '@garage/logbook-domain/Values'
import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'
import { Scene } from 'foldkit'
import { Command, given, message, story } from 'foldkit/story'

import { update } from '../src/Logbook.ts'
import { client, init, Message } from '../src/Model.ts'
import type { CatalogAsset, Model } from '../src/Model.ts'
import { view } from '../src/View.ts'

const truck = AssetId.make('truck')
const furnace = AssetId.make('furnace')
const oil = ScheduleId.make('oil-change')
const rotation = ScheduleId.make('rotate')
const inspection = ScheduleId.make('inspection')
const warranty = WarrantyId.make('powertrain')
const today = IsoDate.make('2026-11-24')
const initial = init({ session: 'test-session', today }, { pathname: '/' }).model
const Failure = Schema.TaggedUnion({
  Denied: { error: Unauthorized },
  Unknown: {},
})
const RejectedCompletion = Schema.TaggedStruct('Rejected', { rejection: ScheduleNotFound })
const RejectedMeter = Schema.TaggedStruct('Rejected', { rejection: MeterRollback })
const receipt = { stream: 'Asset/truck', version: 4 }

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
const completion = client.CompleteTask({
  target: truck,
  commandId: 'test-session:0',
  input: { scheduleId: oil, performedBy: 'diy' },
})

const { click, label, role, text, within } = Scene
const press = (name: string) => click(role('button', { name }))
const navigate = (pathname: string) => Scene.Subscription.emit(Message.ChangedPath({ pathname }))
const shows = (content: string) => Scene.expect(text(content)).toExist()
const catalogLoaded = Scene.Subscription.emit(catalogReceived)
const app = { update, view }

it('places tasks and warranties in the correct groups when the catalog arrives', () => {
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    Scene.expect(within(role('region', { name: 'Overdue' }), text('Change oil'))).toExist(),
    Scene.expect(within(role('region', { name: 'Due Soon' }), text('Rotate tires'))).toExist(),
    Scene.expect(within(role('region', { name: 'Expiring Warranties' }), text('Powertrain warranty'))).toExist(),
    Scene.expect(text('Annual inspection')).toBeAbsent()
  )
})

it('shows only hours-metered tasks within the due window', () => {
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

  Scene.scene(
    app,
    Scene.given(initial),
    Scene.Subscription.emit(
      Message.ReceivedCatalog({ catalog: { ...catalog, assets: { [generator]: generatorAsset } } })
    ),
    Scene.expect(within(dueSoon, text('Inspect generator'))).toExist(),
    Scene.expect(within(dueSoon, text('Change generator oil'))).toBeAbsent()
  )
})

it('finds spec keys and values and opens live asset detail and activity', () => {
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    navigate('/assets'),
    Scene.type(label('Search assets'), 'filter'),
    Scene.expect(role('link', { name: /Furnace/u })).toBeAbsent(),
    Scene.expect(role('link', { name: /Truck/u })).toHaveAttr('href', '/assets/truck'),
    Scene.type(label('Search assets'), 'FL-500S'),
    navigate('/assets/truck'),
    shows('Loading asset…'),
    Scene.Subscription.emit(
      Message.ReceivedDetail({
        detail: { ...truckAsset, schedules: {}, warranties: {}, links: {}, totalSpendCents: 0 },
      })
    ),
    Scene.expect(role('heading', { name: 'Specs & Consumables' })).toExist(),
    Scene.expect(role('link', { name: 'Reorder Oil filter' })).toHaveAttr('href', 'https://parts.example/filter'),
    shows('40000 miles'),
    Scene.Subscription.emit(
      Message.ReceivedActivity({
        cursor: 5,
        entry: ActivityEntry.make({
          assetId: truck,
          at: DateTime.makeUnsafe(today),
          event: MeterRecorded.make({ reading: 40_000, recordedOn: today, previousReading: 39_500, correction: false }),
        }),
      })
    ),
    shows('Meter recorded at 40000')
  )
})

it('finds assets by make, model, and serial number', () => {
  const truckResult = role('link', { name: /Truck/u })
  const furnaceResult = role('link', { name: /Furnace/u })
  const search = label('Search assets')
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    navigate('/assets'),
    Scene.expect(furnaceResult).toExist(),
    Scene.type(search, 'FORD'),
    Scene.expect(truckResult).toExist(),
    Scene.expect(furnaceResult).toBeAbsent(),
    Scene.type(search, 'ranger'),
    Scene.expect(truckResult).toExist(),
    Scene.type(search, 'trk-482'),
    Scene.expect(truckResult).toExist(),
    Scene.type(search, 'trk-999'),
    Scene.expect(truckResult).toBeAbsent()
  )
})

it('opens an encoded asset URL on load and when the browser changes location', () => {
  const assetId = AssetId.make('shop/door?part#50% é')
  const pathname = '/assets/shop%2Fdoor%3Fpart%2350%25%20%C3%A9'
  const asset = { ...truckAsset, id: assetId, name: 'Shop door' }
  const detail = { ...asset, links: {}, totalSpendCents: 0, schedules: {}, warranties: {} }
  const loaded = Scene.Subscription.emit(Message.ReceivedDetail({ detail }))
  Scene.scene(
    app,
    Scene.given(init({ session: 'test-session', today }, { pathname }).model),
    Scene.Subscription.emit(Message.ReceivedCatalog({ catalog: { ...catalog, assets: { [assetId]: asset } } })),
    Scene.expect(role('link', { name: /Shop door/u })).toHaveAttr('href', pathname),
    loaded,
    Scene.expect(role('heading', { name: 'Shop door' })).toExist(),
    navigate('/assets/missing'),
    shows('Asset not found.'),
    Scene.expect(role('heading', { name: 'Shop door' })).toBeAbsent(),
    navigate(pathname),
    loaded,
    Scene.expect(role('heading', { name: 'Shop door' })).toExist(),
    navigate('/assets/%ZZ'),
    Scene.expect(role('heading', { name: 'Assets' })).toExist(),
    Scene.expect(text('Loading asset…')).toBeAbsent()
  )
})

it('shows past service and task details in performed date order as they arrive', () => {
  const history = role('region', { name: 'Service history' })
  const latest = within(history, role('listitem'))
  const received = (cursor: number, event: ActivityEntry['event'], scheduleTitle?: string) => {
    const entry = { assetId: truck, at: DateTime.makeUnsafe(today), event }
    return Scene.Subscription.emit(
      Message.ReceivedActivity({
        cursor,
        entry: ActivityEntry.make(scheduleTitle === undefined ? entry : { ...entry, scheduleTitle }),
      })
    )
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

  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    navigate('/assets'),
    navigate('/assets/truck'),
    Scene.Subscription.emit(
      Message.ReceivedDetail({
        detail: { ...truckAsset, schedules: {}, warranties: {}, links: {}, totalSpendCents: 0 },
      })
    ),
    shows('Loading service history…'),
    received(2, completion, 'Archived oil change'),
    Scene.Subscription.emit(Message.ActivityCaughtUp()),
    Scene.expect(latest).toContainText('Archived oil change'),
    Scene.expect(within(latest, Scene.selector('time'))).toHaveText('2026-11-12'),
    Scene.expect(within(history, text(today))).toBeAbsent(),
    shows('Local garage'),
    shows('Shop'),
    shows('FL-500S'),
    shows('$0.00'),
    shows('Used the spare filter.'),
    shows('40000 miles'),
    Scene.expect(role('link', { name: 'Oil change receipt' })).toHaveAttr('href', 'https://parts.example/receipt'),
    Scene.expect(role('link', { name: 'Unsafe link' })).toBeAbsent(),
    received(3, service),
    Scene.expect(latest).toContainText('FL-500S'),
    shows('Replace battery'),
    shows('Group 65 battery'),
    shows('DIY'),
    Scene.expect(role('link', { name: 'Battery manual' })).toHaveAttr('href', 'http://parts.example/manual')
  )
})

it('shows asset metadata and saves only the fields changed in the edit form', () => {
  const detail = {
    ...truckAsset,
    notes: 'Keep the spare key in the garage.',
    schedules: {},
    warranties: {},
    links: {},
    totalSpendCents: 0,
  }
  const command = client.UpdateAsset({
    target: truck,
    commandId: 'test-session:0',
    input: { serialNumber: null, purchasePriceCents: 0, location: 'Garage' },
  })

  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    navigate('/assets'),
    navigate('/assets/truck'),
    Scene.Subscription.emit(Message.ReceivedDetail({ detail })),
    shows('Ford'),
    shows('Ranger'),
    shows('TRK-482'),
    shows('2024-06-07'),
    shows('$12345.67'),
    shows('Driveway'),
    shows('Keep the spare key in the garage.'),
    press('Edit asset'),
    Scene.expect(label('Asset name')).toHaveValue('Truck'),
    Scene.expect(label('Category')).toHaveValue('vehicle'),
    Scene.expect(label('Make (optional)')).toHaveValue('Ford'),
    Scene.expect(label('Model (optional)')).toHaveValue('Ranger'),
    Scene.expect(label('Serial number (optional)')).toHaveValue('TRK-482'),
    Scene.expect(label('Purchase date (optional, YYYY-MM-DD)')).toHaveValue('2024-06-07'),
    Scene.expect(label('Purchase price in USD (optional)')).toHaveValue('12345.67'),
    Scene.expect(label('Location (optional)')).toHaveValue('Driveway'),
    Scene.expect(label('Notes (optional)')).toHaveValue('Keep the spare key in the garage.'),
    Scene.Subscription.emit(Message.ReceivedDetail({ detail: { ...detail, notes: 'New spare key location.' } })),
    Scene.type(label('Serial number (optional)'), ''),
    Scene.type(label('Purchase price in USD (optional)'), '0'),
    Scene.type(label('Location (optional)'), 'Garage'),
    press('Save asset'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(
      command,
      client.Message.SucceededUpdateAsset({ commandId: 'test-session:0', reply: undefined, receipt })
    ),
    shows('Saved.'),
    Scene.expect(role('button', { name: 'Save asset' })).toBeAbsent(),
    Scene.Subscription.emit(
      Message.ReceivedDetail({
        detail: {
          ...Struct.omit(detail, ['serialNumber']),
          purchasePriceCents: 0,
          location: 'Garage',
          notes: 'New spare key location.',
        },
      })
    ),
    Scene.expect(text('TRK-482')).toBeAbsent(),
    shows('$0.00'),
    shows('Garage'),
    shows('New spare key location.')
  )
})

it('saves a due task and closes the inline form on success', () => {
  const command = client.CompleteTask({
    target: truck,
    commandId: 'test-session:0',
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
  })
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    click(Scene.first(Scene.all.role('button', { name: 'Mark done' }))),
    Scene.type(label('Performed date (optional, YYYY-MM-DD)'), '2026-11-06'),
    Scene.change(label('Performed by'), 'shop'),
    Scene.type(label('Cost in USD (optional)'), '45.25'),
    Scene.type(label('Meter reading (optional)'), '40100'),
    Scene.type(label('Vendor (optional)'), 'Local shop'),
    Scene.type(label('Notes (optional)'), 'New filter'),
    Scene.type(label('Parts (optional, one per line)'), '  FL-500S  \n\n 5W-30 oil'),
    press('Save completion'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(
      command,
      client.Message.SucceededCompleteTask({ commandId: 'test-session:0', reply: undefined, receipt })
    ),
    shows('Saved.'),
    Scene.expect(role('button', { name: 'Save completion' })).toBeAbsent()
  )
})

it('keeps the inline form open and explains a rejected completion', () => {
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    click(Scene.first(Scene.all.role('button', { name: 'Mark done' }))),
    press('Save completion'),
    Scene.Command.expectExact(completion),
    Scene.Command.resolve(
      completion,
      client.Message.FailedCompleteTask({
        commandId: 'test-session:0',
        failure: RejectedCompletion.make({ rejection: ScheduleNotFound.make({ scheduleId: oil }) }),
      })
    ),
    Scene.expect(role('alert')).toHaveText('This schedule is no longer active.'),
    Scene.expect(role('button', { name: 'Save completion' })).toBeEnabled()
  )
})

it('adds undated work in asset detail and completes it from the household due screen', () => {
  const workId = PendingWorkId.make('test-session:0')
  const work = { workId, title: 'Replace door seal', notes: 'Spare seal in garage cabinet.' }
  const detail = { ...truckAsset, schedules: {}, warranties: {}, links: {}, totalSpendCents: 0 }
  const pendingWork = { [workId]: work }
  const updatedCatalog = Message.ReceivedCatalog({
    catalog: { ...catalog, assets: { [truck]: { ...truckAsset, pendingWork } } },
  })
  const added = client.AddPendingWork({ target: truck, commandId: 'test-session:0', input: work })
  const details = {
    workId,
    performedBy: 'diy',
    completedOn: today,
    costCents: 4599,
    parts: ['Door seal', 'Clips'],
  } as const
  const completed = client.CompletePendingWork({ target: truck, commandId: 'test-session:1', input: details })
  const pending = role('region', { name: 'Pending Work' })
  const activity = Message.ReceivedActivity({
    cursor: 5,
    entry: ActivityEntry.make({
      assetId: truck,
      at: DateTime.makeUnsafe(today),
      event: PendingWorkCompleted.make({ ...details, title: work.title }),
    }),
  })

  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    navigate('/assets'),
    navigate('/assets/truck'),
    Scene.Subscription.emit(Message.ReceivedDetail({ detail })),
    press('Add pending work'),
    Scene.type(label('Work title'), work.title),
    Scene.type(label('Notes for parts or location (optional)'), work.notes),
    press('Save pending work'),
    Scene.Command.expectExact(added),
    Scene.Command.resolve(
      added,
      client.Message.SucceededAddPendingWork({ commandId: 'test-session:0', reply: undefined, receipt })
    ),
    Scene.Subscription.emit(Message.ReceivedDetail({ detail: { ...detail, pendingWork } })),
    Scene.expect(within(pending, text(work.title))).toExist(),
    Scene.expect(within(pending, text(work.notes))).toExist(),
    navigate('/'),
    Scene.Subscription.emit(updatedCatalog),
    Scene.expect(within(pending, text(work.title))).toExist(),
    Scene.expect(within(pending, role('link', { name: 'Truck' }))).toHaveAttr('href', '/assets/truck'),
    click(within(pending, role('button', { name: 'Mark done' }))),
    Scene.type(label('Performed date (optional, YYYY-MM-DD)'), today),
    Scene.type(label('Cost in USD (optional)'), '45.99'),
    Scene.type(label('Parts (optional, one per line)'), 'Door seal\nClips'),
    press('Save completion'),
    Scene.Command.expectExact(completed),
    Scene.Command.resolve(
      completed,
      client.Message.FailedCompletePendingWork({
        commandId: 'test-session:1',
        failure: Failure.cases.Unknown.make({}),
      })
    ),
    catalogLoaded,
    Scene.expect(within(pending, text(work.title))).toBeAbsent(),
    press('Retry save'),
    Scene.Command.expectExact(completed),
    Scene.Command.resolve(
      completed,
      client.Message.SucceededCompletePendingWork({ commandId: 'test-session:1', reply: undefined, receipt })
    ),
    shows('No pending work.'),
    navigate('/assets/truck'),
    Scene.Subscription.emit(Message.ReceivedDetail({ detail: { ...detail, totalSpendCents: 4599 } })),
    Scene.Subscription.emit(activity),
    Scene.expect(within(pending, text(work.title))).toBeAbsent(),
    shows('Replace door seal'),
    shows('$45.99')
  )
})

it('uses the same command ID and input when the save outcome is unknown', () => {
  story(
    update,
    given(initial),
    message(catalogReceived),
    message(Message.OpenedCompletion({ assetId: truck, scheduleId: oil })),
    message(Message.Submitted()),
    Command.expectExact(completion),
    Command.resolve(
      completion,
      client.Message.FailedCompleteTask({
        commandId: 'test-session:0',
        failure: Failure.cases.Unknown.make({}),
      })
    ),
    message(Message.EditedField({ field: 'notes', value: 'A different request' })),
    message(Message.Submitted()),
    Command.expectExact(completion),
    Command.resolve(
      completion,
      client.Message.SucceededCompleteTask({ commandId: 'test-session:0', reply: undefined, receipt })
    )
  )
})

it('shows both readings on rollback and permits an explicit correction', () => {
  const reading = client.RecordMeter({
    target: truck,
    commandId: 'test-session:0',
    input: { reading: 39_900, correction: false },
  })
  const correction = client.RecordMeter({
    target: truck,
    commandId: 'test-session:1',
    input: { reading: 39_900, correction: true },
  })
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    navigate('/quick-log'),
    Scene.change(label('Asset'), truck),
    Scene.type(label('Meter reading (miles)'), '39900'),
    press('Save reading'),
    Scene.Command.expectExact(reading),
    Scene.Command.resolve(
      reading,
      client.Message.FailedRecordMeter({
        commandId: 'test-session:0',
        failure: RejectedMeter.make({ rejection: MeterRollback.make({ current: 40_000, submitted: 39_900 }) }),
      })
    ),
    Scene.expect(role('alert')).toContainText('The current reading is 40000. You entered 39900.'),
    click(label('Save as a correction')),
    press('Save reading'),
    Scene.Command.expectExact(correction),
    Scene.Command.resolve(
      correction,
      client.Message.SucceededRecordMeter({ commandId: 'test-session:1', reply: undefined, receipt })
    ),
    shows('Saved.')
  )
})

it('asks for sign-in when a command is denied', () => {
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    click(Scene.first(Scene.all.role('button', { name: 'Mark done' }))),
    press('Save completion'),
    Scene.Command.resolve(
      completion,
      client.Message.FailedCompleteTask({
        commandId: 'test-session:0',
        failure: Failure.cases.Denied.make({ error: Unauthorized.make({}) }),
      })
    ),
    Scene.expect(role('alert')).toHaveText('Session expired. Reload to sign in.'),
    Scene.expect(role('button', { name: 'Save completion' })).toBeDisabled()
  )
})

it('logs unscheduled service and registers a new asset', () => {
  const service = client.LogService({
    target: furnace,
    commandId: 'test-session:0',
    input: {
      title: 'Replace igniter',
      performedBy: 'diy',
      performedOn: IsoDate.make('2026-11-10'),
      parts: ['Hot surface igniter'],
    },
  })
  const registration = client.RegisterAsset({
    target: AssetId.make('test-session:1'),
    commandId: 'test-session:1',
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
  })
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    navigate('/quick-log'),
    press('Log service'),
    Scene.change(label('Asset'), furnace),
    Scene.type(label('Service title'), 'Replace igniter'),
    Scene.type(label('Performed date (optional, YYYY-MM-DD)'), '2026-11-31'),
    press('Save service'),
    Scene.expect(role('alert')).toHaveText('Enter a valid performed date.'),
    Scene.type(label('Performed date (optional, YYYY-MM-DD)'), '2026-11-10'),
    Scene.type(label('Parts (optional, one per line)'), 'Hot surface igniter'),
    press('Save service'),
    Scene.Command.expectExact(service),
    Scene.Command.resolve(
      service,
      client.Message.SucceededLogService({ commandId: 'test-session:0', reply: undefined, receipt })
    ),
    shows('Saved.'),
    press('New asset'),
    Scene.type(label('Asset name'), 'Generator'),
    Scene.change(label('Category'), 'equipment'),
    Scene.type(label('Make (optional)'), 'Honda'),
    Scene.type(label('Model (optional)'), 'EU2200i'),
    Scene.type(label('Serial number (optional)'), 'GEN-7'),
    Scene.type(label('Purchase date (optional, YYYY-MM-DD)'), '2026-11-31'),
    press('Register asset'),
    Scene.expect(role('alert')).toHaveText('Enter a purchase date in YYYY-MM-DD format.'),
    Scene.type(label('Purchase date (optional, YYYY-MM-DD)'), '2026-11-10'),
    Scene.type(label('Purchase price in USD (optional)'), '1099.999'),
    press('Register asset'),
    Scene.expect(role('alert')).toHaveText('Enter a purchase price in dollars with up to two decimal places.'),
    Scene.type(label('Purchase price in USD (optional)'), '1099.99'),
    Scene.type(label('Location (optional)'), 'Shed'),
    Scene.type(label('Notes (optional)'), 'Store with the cover.'),
    Scene.change(label('Meter unit (optional)'), 'hours'),
    Scene.type(label('Initial meter reading (optional)'), '0'),
    press('Register asset'),
    Scene.Command.expectExact(registration),
    Scene.Command.resolve(
      registration,
      client.Message.SucceededRegisterAsset({ commandId: 'test-session:1', reply: undefined, receipt })
    ),
    shows('Saved.')
  )
})
