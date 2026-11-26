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

const scheduleId = ScheduleId.make('oil')
const linkId = LinkId.make('manual')
const warrantyId = WarrantyId.make('powertrain')
const specKey = 'Oil filter'
const schedule = {
  scheduleId,
  title: 'Change oil',
  cadence: Cadence.cases.Either.make({ days: 90, every: 5000, unit: 'miles' }),
  estimatedCostCents: 4250,
  lastCompletedOn: IsoDate.make('2026-11-01'),
  lastCompletedMeter: 39_000,
  notes: 'Synthetic oil',
}
const configured: AssetDetails = {
  ...asset,
  schedules: { [scheduleId]: schedule },
  links: { [linkId]: { id: linkId, label: 'Manual', url: 'https://maker.example/manual' } },
  warranties: {
    [warrantyId]: {
      id: warrantyId,
      label: 'Powertrain',
      expiresOn: IsoDate.make('2029-11-24'),
      coverage: 'Engine and transmission',
      url: 'https://dealer.example/warranty',
    },
  },
  specs: { [specKey]: { key: specKey, value: 'FL-500S', url: 'https://parts.example/filter' } },
}

it('replaces the selected link and retries after a live update removes the old row', () => {
  const replacementId = LinkId.make(commandId)
  const replacement = { label: 'Manual', url: 'https://maker.example/new-manual' }
  const command = client.AttachLink({
    target: truck,
    commandId,
    input: { ...replacement, linkId: replacementId, replacesLinkId: linkId },
  })
  Scene.scene(
    app,
    ...assetPage,
    detail(configured),
    press('Replace link Manual'),
    Scene.expect(label('Link name')).toHaveValue('Manual'),
    Scene.expect(label('Link URL')).toHaveValue('https://maker.example/manual'),
    enter('Link URL', replacement.url),
    press('Replace link'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.FailedAttachLink({ commandId, failure: unknown })),
    detail({ ...configured, links: { [replacementId]: { ...replacement, id: replacementId } } }),
    Scene.expect(label('Link URL')).toHaveValue(replacement.url),
    Scene.expect(role('button', { name: 'Cancel' })).toBeDisabled(),
    press('Retry save'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.SucceededAttachLink({ commandId, reply: undefined, receipt })),
    saved,
    Scene.expect(role('link', { name: 'Manual' })).toHaveAttr('href', replacement.url)
  )
})

it('replaces a schedule with the corrected cadence and prefilled completion values', () => {
  const command = client.AddSchedule({
    target: truck,
    commandId,
    input: {
      ...schedule,
      scheduleId: ScheduleId.make(commandId),
      cadence: Cadence.cases.Either.make({ days: 120, every: 5000, unit: 'miles' }),
      replacesScheduleId: scheduleId,
    },
  })
  Scene.scene(
    app,
    ...assetPage,
    detail(configured),
    press('Edit schedule Change oil'),
    Scene.expect(label('Schedule title')).toHaveValue('Change oil'),
    Scene.expect(label('Cadence')).toHaveValue('Either'),
    Scene.expect(label('Interval in days')).toHaveValue('90'),
    Scene.expect(label('Last completion date (optional)')).toHaveValue('2026-11-01'),
    Scene.expect(label('Meter at last completion in miles (optional)')).toHaveValue('39000'),
    Scene.expect(text(/keep its past completions/u)).toExist(),
    enter('Interval in days', '120'),
    press('Replace schedule'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.SucceededAddSchedule({ commandId, reply: undefined, receipt })),
    saved
  )
})

it('corrects a warranty expiration date and clears the optional URL', () => {
  const command = client.RecordWarranty({
    target: truck,
    commandId,
    input: {
      warrantyId: WarrantyId.make(commandId),
      replacesWarrantyId: warrantyId,
      label: 'Powertrain',
      expiresOn: IsoDate.make('2029-12-24'),
      coverage: 'Engine and transmission',
    },
  })
  Scene.scene(
    app,
    ...assetPage,
    detail(configured),
    press('Edit warranty Powertrain'),
    Scene.expect(label('Expiration date')).toHaveValue('2029-11-24'),
    enter('Expiration date', '2029-12-24'),
    enter('Warranty URL (optional)', ''),
    press('Save warranty'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.SucceededRecordWarranty({ commandId, reply: undefined, receipt })),
    saved
  )
})

it('corrects a specification name and value', () => {
  const command = client.SetSpec({
    target: truck,
    commandId,
    input: { key: 'Engine oil filter', previousKey: specKey, value: 'FL-910S', url: 'https://parts.example/filter' },
  })
  Scene.scene(
    app,
    ...assetPage,
    detail(configured),
    press('Edit spec Oil filter'),
    Scene.expect(label('Specification name')).toHaveValue(specKey),
    enter('Specification name', 'Engine oil filter'),
    enter('Specification value', 'FL-910S'),
    press('Save spec'),
    Scene.Command.expectExact(command),
    Scene.Command.resolve(command, client.Message.SucceededSetSpec({ commandId, reply: undefined, receipt })),
    saved
  )
})

it.each([
  {
    name: 'Stop schedule',
    subject: 'Change oil',
    command: client.ArchiveSchedule({ target: truck, commandId, input: { scheduleId } }),
    success: client.Message.SucceededArchiveSchedule({ commandId, reply: undefined, receipt }),
    after: { ...configured, schedules: {} },
  },
  {
    name: 'Remove link',
    subject: 'Manual',
    command: client.RemoveLink({ target: truck, commandId, input: { linkId } }),
    success: client.Message.SucceededRemoveLink({ commandId, reply: undefined, receipt }),
    after: { ...configured, links: {} },
  },
  {
    name: 'Remove warranty',
    subject: 'Powertrain',
    command: client.RemoveWarranty({ target: truck, commandId, input: { warrantyId } }),
    success: client.Message.SucceededRemoveWarranty({ commandId, reply: undefined, receipt }),
    after: { ...configured, warranties: {} },
  },
  {
    name: 'Remove spec',
    subject: specKey,
    command: client.RemoveSpec({ target: truck, commandId, input: { key: specKey } }),
    success: client.Message.SucceededRemoveSpec({ commandId, reply: undefined, receipt }),
    after: { ...configured, specs: {} },
  },
])('confirms $name for $subject before saving', ({ name, subject, command, success, after }) => {
  const rowAction = `${name} ${subject}`
  Scene.scene(
    app,
    ...assetPage,
    detail(configured),
    press(rowAction),
    Scene.expect(role('button', { name })).toExist(),
    press('Cancel'),
    Scene.expect(role('button', { name })).toBeAbsent(),
    press(rowAction),
    press(name),
    Scene.Command.expectExact(command),
    Scene.Command.resolve<typeof client.Message.Type>(command, success),
    saved,
    detail(after),
    Scene.expect(role('button', { name: rowAction })).toBeAbsent()
  )
})

it('hides all setup actions for a retired asset', () => {
  Scene.scene(
    app,
    ...assetPage,
    detail({ ...configured, status: 'retired' }),
    Scene.expect(role('button', { name: 'Add schedule' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Record warranty' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Set spec' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Attach link' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Edit schedule Change oil' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Stop schedule Change oil' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Edit warranty Powertrain' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Remove warranty Powertrain' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Edit spec Oil filter' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Remove spec Oil filter' })).toBeAbsent(),
    Scene.expect(role('button', { name: 'Replace link Manual' })).toBeAbsent()
  )
})
