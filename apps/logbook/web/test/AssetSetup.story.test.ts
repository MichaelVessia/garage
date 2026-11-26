import { Subscription } from '@effect/ui'
import { HtmlLocator, HtmlScene } from '@effect/ui/html/testing'
import { Locator } from '@effect/ui/testing'
import { it } from '@effect/vitest'
import { AssetId, LinkId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { Cadence, IsoDate } from '@garage/logbook-domain/Values'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { Logbook } from '../src/Logbook.ts'
import { Message } from '../src/Model.ts'
import type { AssetDetails } from '../src/Model.ts'
import { LogbookRoutes } from '../src/Route.ts'
import { AssetChange, SaveAsset } from '../src/SaveAsset.ts'

const truck = AssetId.make('truck')
const today = IsoDate.make('2026-11-24')
const commandId = 'test-session:0'
const unknownOutcome = Schema.TaggedStruct('Unknown', {}).make({})
const props = { session: 'test-session', today, route: LogbookRoutes.Asset({ params: { assetId: truck } }) }
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

const { label, role } = HtmlLocator
const { text } = Locator
const button = (name: string | RegExp) => role('button', { name })
const detailKey = Subscription.keyOf('detail', truck)
const openAsset = (scene: HtmlScene.Steps<typeof Logbook>) =>
  scene.subscription('catalog', Message.ReceivedCatalog({ catalog: { assets: { [truck]: asset }, spendByYear: {} } }))

it.effect.each([
  {
    cadence: Cadence.cases.IntervalDays.make({ days: 30 }),
    fields: [{ name: 'Interval in days', value: '30' }],
  },
  {
    cadence: Cadence.cases.MeterInterval.make({ every: 500.5, unit: 'miles' }),
    fields: [{ name: 'Interval in miles', value: '500.5' }],
  },
  {
    cadence: Cadence.cases.Either.make({ days: 90, every: 5000, unit: 'miles' }),
    fields: [
      { name: 'Interval in days', value: '90' },
      { name: 'Interval in miles', value: '5000' },
    ],
  },
  {
    cadence: Cadence.cases.Seasonal.make({ month: 2, day: 29 }),
    fields: [
      { name: 'Month (1 to 12)', value: '2' },
      { name: 'Day of month (1 to 31)', value: '29' },
    ],
  },
])('saves a schedule with $cadence._tag cadence', ({ cadence, fields }) =>
  Effect.gen(function* () {
    const command = SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.AddSchedule({
        input: { scheduleId: ScheduleId.make(commandId), title: 'Inspect brakes', cadence },
      }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: asset }))
      .click(button('Add schedule'))
      .type(label('Schedule title'), 'Inspect brakes')
      .change(label('Cadence'), cadence._tag)
    for (const { name, value } of fields) {
      scene.type(label(name), value)
    }
    scene
      .click(button('Save schedule'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
      .expect(role('button', { name: 'Save schedule' }))
      .toBeAbsent()
  })
)

it.effect('corrects an invalid interval and saves the schedule with its last completion and estimated cost', () =>
  Effect.gen(function* () {
    const command = SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.AddSchedule({
        input: {
          scheduleId: ScheduleId.make(commandId),
          title: 'Change oil',
          cadence: Cadence.cases.Either.make({ days: 90, every: 5000, unit: 'miles' }),
          lastCompletedOn: IsoDate.make('2026-11-01'),
          lastCompletedMeter: 39_000,
          estimatedCostCents: 4250,
          notes: 'Synthetic oil',
        },
      }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: asset }))
      .click(button('Add schedule'))
      .type(label('Schedule title'), 'Change oil')
      .change(label('Cadence'), 'Either')
      .type(label('Interval in days'), '0')
      .type(label('Interval in miles'), '5000')
      .click(button('Save schedule'))
      .expect(role('alert'))
      .toHaveText(/Enter a valid interval/u)
      .type(label('Interval in days'), '90')
      .type(label('Last completion date (optional)'), '2026-11-01')
      .type(label('Meter at last completion in miles (optional)'), '39000')
      .type(label('Estimated cost in USD (optional)'), '42.50')
      .type(label('Notes (optional)'), 'Synthetic oil')
      .click(button('Save schedule'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
  })
)

it.effect('limits cadence choices for an asset without a meter', () =>
  Effect.gen(function* () {
    const { meter: _, ...unmetered } = asset
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: unmetered }))
      .click(button('Add schedule'))
      .expect(role('option', { name: 'Every set number of miles' }))
      .toBeAbsent()
      .expect(role('option', { name: 'Days or miles, whichever comes first' }))
      .toBeAbsent()
      .expect(role('option', { name: 'Annual date' }))
      .toExist()
      .click(button('Cancel'))
      .expect(role('button', { name: 'Save schedule' }))
      .toBeAbsent()
  })
)

it.effect('records a warranty from the asset page', () =>
  Effect.gen(function* () {
    const command = SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.RecordWarranty({
        input: {
          warrantyId: WarrantyId.make(commandId),
          label: 'Powertrain',
          expiresOn: IsoDate.make('2029-11-24'),
          coverage: 'Engine and transmission',
          notes: 'Keep receipts',
          url: 'https://dealer.example/warranty',
        },
      }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: asset }))
      .click(button('Record warranty'))
      .type(label('Warranty name'), 'Powertrain')
      .type(label('Expiration date'), '2029-11-24')
      .type(label('Coverage (optional)'), 'Engine and transmission')
      .type(label('Notes (optional)'), 'Keep receipts')
      .type(label('Warranty URL (optional)'), 'https://dealer.example/warranty')
      .click(button('Save warranty'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
      .expect(role('button', { name: 'Save warranty' }))
      .toBeAbsent()
  })
)

it.effect('sets a specification from the asset page', () =>
  Effect.gen(function* () {
    const command = SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.SetSpec({
        input: { key: 'Oil filter', value: 'FL-500S', url: 'https://parts.example/filter' },
      }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: asset }))
      .click(button('Set spec'))
      .type(label('Specification name'), 'Oil filter')
      .type(label('Specification value'), 'FL-500S')
      .type(label('Reorder URL (optional)'), 'https://parts.example/filter')
      .click(button('Save spec'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
      .expect(role('button', { name: 'Save spec' }))
      .toBeAbsent()
  })
)

it.effect('attaches a web link and retries with the same command and link IDs', () =>
  Effect.gen(function* () {
    const linkId = LinkId.make(commandId)
    const command = SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.AttachLink({ input: { linkId, label: 'Manual', url: 'https://maker.example/manual' } }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: asset }))
      .click(button('Attach link'))
      .type(label('Link name'), 'Manual')
      .type(label('Link URL'), 'file:///manual')
      .click(button('Save link'))
      .expect(role('alert'))
      .toHaveText(/Enter a link that starts with https:\/\/ or http:\/\/\./u)
      .type(label('Link URL'), 'https://maker.example/manual')
      .click(button('Save link'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId, failure: unknownOutcome } }))
      .expect(role('button', { name: 'Cancel' }))
      .toBeDisabled()
      .click(button('Retry save'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
      .expect(role('button', { name: 'Save link' }))
      .toBeAbsent()
      .subscription(
        detailKey,
        Message.ReceivedDetail({
          detail: {
            ...asset,
            links: { [linkId]: { id: linkId, label: 'Manual', url: 'https://maker.example/manual' } },
          },
        })
      )
      .expect(role('link', { name: 'Manual' }))
      .toHaveAttribute('href', 'https://maker.example/manual')
  })
)

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

it.effect('replaces the selected link and retries after a live update removes the old row', () =>
  Effect.gen(function* () {
    const replacementId = LinkId.make(commandId)
    const replacement = { label: 'Manual', url: 'https://maker.example/new-manual' }
    const command = SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.AttachLink({ input: { ...replacement, linkId: replacementId, replacesLinkId: linkId } }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: configured }))
      .click(button('Replace link Manual'))
      .expect(label('Link name'))
      .toHaveValue('Manual')
      .expect(label('Link URL'))
      .toHaveValue('https://maker.example/manual')
      .type(label('Link URL'), replacement.url)
      .click(button('Replace link'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId, failure: unknownOutcome } }))
      .subscription(
        detailKey,
        Message.ReceivedDetail({
          detail: { ...configured, links: { [replacementId]: { ...replacement, id: replacementId } } },
        })
      )
      .expect(label('Link URL'))
      .toHaveValue(replacement.url)
      .expect(role('button', { name: 'Cancel' }))
      .toBeDisabled()
      .click(button('Retry save'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
      .expect(role('link', { name: 'Manual' }))
      .toHaveAttribute('href', replacement.url)
  })
)

it.effect('replaces a schedule with the corrected cadence and prefilled completion values', () =>
  Effect.gen(function* () {
    const command = SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.AddSchedule({
        input: {
          ...schedule,
          scheduleId: ScheduleId.make(commandId),
          cadence: Cadence.cases.Either.make({ days: 120, every: 5000, unit: 'miles' }),
          replacesScheduleId: scheduleId,
        },
      }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: configured }))
      .click(button('Edit schedule Change oil'))
      .expect(label('Schedule title'))
      .toHaveValue('Change oil')
      .expect(label('Cadence'))
      .toHaveValue('Either')
      .expect(label('Interval in days'))
      .toHaveValue('90')
      .expect(label('Last completion date (optional)'))
      .toHaveValue('2026-11-01')
      .expect(label('Meter at last completion in miles (optional)'))
      .toHaveValue('39000')
      .expect(text('keep its past completions'))
      .toExist()
      .type(label('Interval in days'), '120')
      .click(button('Replace schedule'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
  })
)

it.effect('corrects a warranty expiration date and clears the optional URL', () =>
  Effect.gen(function* () {
    const command = SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.RecordWarranty({
        input: {
          warrantyId: WarrantyId.make(commandId),
          replacesWarrantyId: warrantyId,
          label: 'Powertrain',
          expiresOn: IsoDate.make('2029-12-24'),
          coverage: 'Engine and transmission',
        },
      }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: configured }))
      .click(button('Edit warranty Powertrain'))
      .expect(label('Expiration date'))
      .toHaveValue('2029-11-24')
      .type(label('Expiration date'), '2029-12-24')
      .type(label('Warranty URL (optional)'), '')
      .click(button('Save warranty'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
  })
)

it.effect('corrects a specification name and value', () =>
  Effect.gen(function* () {
    const command = SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.SetSpec({
        input: {
          key: 'Engine oil filter',
          previousKey: specKey,
          value: 'FL-910S',
          url: 'https://parts.example/filter',
        },
      }),
    })
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: configured }))
      .click(button('Edit spec Oil filter'))
      .expect(label('Specification name'))
      .toHaveValue(specKey)
      .type(label('Specification name'), 'Engine oil filter')
      .type(label('Specification value'), 'FL-910S')
      .click(button('Save spec'))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
  })
)

it.effect.each([
  {
    name: 'Stop schedule',
    subject: 'Change oil',
    command: SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.ArchiveSchedule({ input: { scheduleId } }),
    }),
    after: { ...configured, schedules: {} },
  },
  {
    name: 'Remove link',
    subject: 'Manual',
    command: SaveAsset.make({ target: truck, commandId, change: AssetChange.RemoveLink({ input: { linkId } }) }),
    after: { ...configured, links: {} },
  },
  {
    name: 'Remove warranty',
    subject: 'Powertrain',
    command: SaveAsset.make({
      target: truck,
      commandId,
      change: AssetChange.RemoveWarranty({ input: { warrantyId } }),
    }),
    after: { ...configured, warranties: {} },
  },
  {
    name: 'Remove spec',
    subject: specKey,
    command: SaveAsset.make({ target: truck, commandId, change: AssetChange.RemoveSpec({ input: { key: specKey } }) }),
    after: { ...configured, specs: {} },
  },
])('confirms $name for $subject before saving', ({ name, subject, command, after }) =>
  Effect.gen(function* () {
    const rowAction = `${name} ${subject}`
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: configured }))
      .click(button(rowAction))
      .expect(role('button', { name }))
      .toExist()
      .click(button('Cancel'))
      .expect(role('button', { name }))
      .toBeAbsent()
      .click(button(rowAction))
      .click(button(name))
      .expectExact(command)
      .resolve(command, Message.ReceivedResult({ result: { commandId } }))
      .expect(text('Saved.'))
      .toExist()
      .subscription(detailKey, Message.ReceivedDetail({ detail: after }))
      .expect(role('button', { name: rowAction }))
      .toBeAbsent()
  })
)

it.effect('hides all setup actions for a retired asset', () =>
  Effect.gen(function* () {
    const scene = yield* HtmlScene.make(Logbook, props)
    openAsset(scene)
      .subscription(detailKey, Message.ReceivedDetail({ detail: { ...configured, status: 'retired' } }))
      .expect(role('button', { name: 'Add schedule' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Record warranty' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Set spec' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Attach link' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Edit schedule Change oil' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Stop schedule Change oil' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Edit warranty Powertrain' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Remove warranty Powertrain' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Edit spec Oil filter' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Remove spec Oil filter' }))
      .toBeAbsent()
      .expect(role('button', { name: 'Replace link Manual' }))
      .toBeAbsent()
  })
)
