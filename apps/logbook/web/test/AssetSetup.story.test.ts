import { it } from '@effect/vitest'
import { AssetId, LinkId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { Cadence, IsoDate } from '@garage/logbook-domain/Values'
import * as Schema from 'effect/Schema'
import { Scene } from 'foldkit'

import { update } from '../src/Logbook.ts'
import { client, init, Message } from '../src/Model.ts'
import type { AssetDetails } from '../src/Model.ts'
import { view } from '../src/View.ts'

const truck = AssetId.make('truck')
const today = IsoDate.make('2026-11-24')
const commandId = 'test-session:0'
const receipt = { stream: 'Asset/truck', version: 4 }
const unknown = Schema.TaggedStruct('Unknown', {}).make({})
const initial = init({ session: 'test-session', today }).model
const asset: AssetDetails = {
  id: truck,
  name: 'Truck',
  category: 'vehicle',
  status: 'active',
  meter: { unit: 'miles', reading: 40_000 },
  specs: {},
  schedules: {},
  warranties: {},
  links: {},
  totalSpendCents: 0,
}

const { click, label, role, text } = Scene
const press = (name: string | RegExp) => click(role('button', { name }))
const enter = (name: string, value: string) => Scene.type(label(name), value)
const detail = (asset: AssetDetails) => Scene.Subscription.emit(Message.ReceivedDetail({ detail: asset }))
const saved = Scene.expect(text('Saved.')).toExist()
const assetPage = [
  Scene.given(initial),
  Scene.Subscription.emit(Message.ReceivedCatalog({ catalog: { assets: { [truck]: asset }, spendByYear: {} } })),
  press('Assets'),
  press(/Truck/u),
] as const
const app = { update, view }

it.each([
  {
    cadence: Cadence.cases.IntervalDays.make({ days: 30 }),
    fields: [enter('Interval in days', '30')],
  },
  {
    cadence: Cadence.cases.MeterInterval.make({ every: 500.5, unit: 'miles' }),
    fields: [enter('Interval in miles', '500.5')],
  },
  {
    cadence: Cadence.cases.Either.make({ days: 90, every: 5000, unit: 'miles' }),
    fields: [enter('Interval in days', '90'), enter('Interval in miles', '5000')],
  },
  {
    cadence: Cadence.cases.Seasonal.make({ month: 2, day: 29 }),
    fields: [enter('Month (1 to 12)', '2'), enter('Day of month (1 to 31)', '29')],
  },
])('saves a schedule with $cadence._tag cadence', ({ cadence, fields }) => {
  const command = client.AddSchedule({
    target: truck,
    commandId,
    input: { scheduleId: ScheduleId.make(commandId), title: 'Inspect brakes', cadence },
  })
  Scene.scene(
    app,
    ...assetPage,
    detail(asset),
    press('Add schedule'),
    enter('Schedule title', 'Inspect brakes'),
    Scene.change(label('Cadence'), cadence._tag),
    ...fields,
    press('Save schedule'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.SucceededAddSchedule({ commandId, reply: undefined, receipt })),
    saved,
    Scene.expect(role('button', { name: 'Save schedule' })).toBeAbsent()
  )
})

it('corrects an invalid interval and saves the schedule with its last completion and estimated cost', () => {
  const command = client.AddSchedule({
    target: truck,
    commandId,
    input: {
      scheduleId: ScheduleId.make(commandId),
      title: 'Change oil',
      cadence: Cadence.cases.Either.make({ days: 90, every: 5000, unit: 'miles' }),
      lastCompletedOn: IsoDate.make('2026-11-01'),
      lastCompletedMeter: 39_000,
      estimatedCostCents: 4250,
      notes: 'Synthetic oil',
    },
  })
  Scene.scene(
    app,
    ...assetPage,
    detail(asset),
    press('Add schedule'),
    enter('Schedule title', 'Change oil'),
    Scene.change(label('Cadence'), 'Either'),
    enter('Interval in days', '0'),
    enter('Interval in miles', '5000'),
    press('Save schedule'),
    Scene.expect(role('alert')).toContainText('Enter a valid interval'),
    enter('Interval in days', '90'),
    enter('Last completion date (optional)', '2026-11-01'),
    enter('Meter at last completion in miles (optional)', '39000'),
    enter('Estimated cost in USD (optional)', '42.50'),
    enter('Notes (optional)', 'Synthetic oil'),
    press('Save schedule'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.SucceededAddSchedule({ commandId, reply: undefined, receipt })),
    saved
  )
})

it('limits cadence choices for an asset without a meter', () => {
  const { meter: _, ...unmetered } = asset
  Scene.scene(
    app,
    ...assetPage,
    detail(unmetered),
    press('Add schedule'),
    Scene.expect(role('option', { name: 'Every set number of miles' })).toBeAbsent(),
    Scene.expect(role('option', { name: 'Days or miles, whichever comes first' })).toBeAbsent(),
    Scene.expect(role('option', { name: 'Annual date' })).toExist(),
    press('Cancel'),
    Scene.expect(role('button', { name: 'Save schedule' })).toBeAbsent()
  )
})

it('records a warranty from the asset page', () => {
  const command = client.RecordWarranty({
    target: truck,
    commandId,
    input: {
      warrantyId: WarrantyId.make(commandId),
      label: 'Powertrain',
      expiresOn: IsoDate.make('2029-11-24'),
      coverage: 'Engine and transmission',
      notes: 'Keep receipts',
      url: 'https://dealer.example/warranty',
    },
  })
  Scene.scene(
    app,
    ...assetPage,
    detail(asset),
    press('Record warranty'),
    enter('Warranty name', 'Powertrain'),
    enter('Expiration date', '2029-11-24'),
    enter('Coverage (optional)', 'Engine and transmission'),
    enter('Notes (optional)', 'Keep receipts'),
    enter('Warranty URL (optional)', 'https://dealer.example/warranty'),
    press('Save warranty'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.SucceededRecordWarranty({ commandId, reply: undefined, receipt })),
    saved,
    Scene.expect(role('button', { name: 'Save warranty' })).toBeAbsent()
  )
})

it('sets a specification from the asset page', () => {
  const command = client.SetSpec({
    target: truck,
    commandId,
    input: { key: 'Oil filter', value: 'FL-500S', url: 'https://parts.example/filter' },
  })
  Scene.scene(
    app,
    ...assetPage,
    detail(asset),
    press('Set spec'),
    enter('Specification name', 'Oil filter'),
    enter('Specification value', 'FL-500S'),
    enter('Reorder URL (optional)', 'https://parts.example/filter'),
    press('Save spec'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.SucceededSetSpec({ commandId, reply: undefined, receipt })),
    saved,
    Scene.expect(role('button', { name: 'Save spec' })).toBeAbsent()
  )
})

it('attaches a web link and retries with the same command and link IDs', () => {
  const linkId = LinkId.make(commandId)
  const command = client.AttachLink({
    target: truck,
    commandId,
    input: { linkId, label: 'Manual', url: 'https://maker.example/manual' },
  })
  Scene.scene(
    app,
    ...assetPage,
    detail(asset),
    press('Attach link'),
    enter('Link name', 'Manual'),
    enter('Link URL', 'file:///manual'),
    press('Save link'),
    Scene.expect(role('alert')).toContainText('Enter a link that starts with https:// or http://.'),
    enter('Link URL', 'https://maker.example/manual'),
    press('Save link'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.FailedAttachLink({ commandId, failure: unknown })),
    Scene.expect(role('button', { name: 'Cancel' })).toBeDisabled(),
    press('Retry save'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.SucceededAttachLink({ commandId, reply: undefined, receipt })),
    saved,
    Scene.expect(role('button', { name: 'Save link' })).toBeAbsent(),
    detail({
      ...asset,
      links: { [linkId]: { id: linkId, label: 'Manual', url: 'https://maker.example/manual' } },
    }),
    Scene.expect(role('link', { name: 'Manual' })).toHaveAttr('href', 'https://maker.example/manual')
  )
})

it('hides all setup actions for a retired asset', () => {
  Scene.scene(
    app,
    ...assetPage,
    detail({ ...asset, status: 'retired' }),
    Scene.expect(role('button', { name: 'Add schedule' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Record warranty' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Set spec' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Attach link' })).toBeAbsent()
  )
})
