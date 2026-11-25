import { it } from '@effect/vitest'
import { AssetId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { ActivityEntry } from '@garage/logbook-domain/Asset/AssetActivity.view'
import { MeterRollback } from '@garage/logbook-domain/Asset/MeterRollback.rejection'
import { MeterRecorded } from '@garage/logbook-domain/Asset/RecordMeter.command'
import { ScheduleNotFound } from '@garage/logbook-domain/Asset/ScheduleNotFound.rejection'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import { IsoDate } from '@garage/logbook-domain/Values'
import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'
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
const initial = init({ session: 'test-session', today }).model
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

it('finds spec keys and values and opens live asset detail and activity', () => {
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    press('Assets'),
    Scene.type(label('Search assets'), 'filter'),
    Scene.expect(role('button', { name: /Furnace/u })).toBeAbsent(),
    Scene.expect(role('button', { name: /Truck/u })).toExist(),
    Scene.type(label('Search assets'), 'FL-500S'),
    click(role('button', { name: /Truck/u })),
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

it('saves a due task and closes the inline form on success', () => {
  const command = client.CompleteTask({
    target: truck,
    commandId: 'test-session:0',
    input: {
      scheduleId: oil,
      performedBy: 'shop',
      costCents: 4525,
      meterReading: 40_100,
      vendor: 'Local shop',
      notes: 'New filter',
    },
  })
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    click(Scene.first(Scene.all.role('button', { name: 'Mark done' }))),
    Scene.change(label('Performed by'), 'shop'),
    Scene.type(label('Cost in USD (optional)'), '45.25'),
    Scene.type(label('Meter reading (optional)'), '40100'),
    Scene.type(label('Vendor (optional)'), 'Local shop'),
    Scene.type(label('Notes (optional)'), 'New filter'),
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
    press('Quick Log'),
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
    input: { title: 'Replace igniter', performedBy: 'diy' },
  })
  const registration = client.RegisterAsset({
    target: AssetId.make('test-session:1'),
    commandId: 'test-session:1',
    input: { name: 'Generator', category: 'equipment', meterUnit: 'hours', initialMeter: 0 },
  })
  Scene.scene(
    app,
    Scene.given(initial),
    catalogLoaded,
    press('Quick Log'),
    press('Log service'),
    Scene.change(label('Asset'), furnace),
    Scene.type(label('Service title'), 'Replace igniter'),
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
