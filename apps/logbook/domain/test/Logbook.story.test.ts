import * as Domain from '@alchemy.run/domain'
import { Story } from '@alchemy.run/domain/Story'
import { assert, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Stream from 'effect/Stream'
import * as Struct from 'effect/Struct'

import { owner, system } from '../src/Actor.ts'
import { AddPendingWork, PendingWorkAdded, PendingWorkAlreadyExists } from '../src/Asset/AddPendingWork.command.ts'
import { AddSchedule, ScheduleAdded, ScheduleAlreadyExists } from '../src/Asset/AddSchedule.command.ts'
import { ArchiveSchedule, ScheduleArchived } from '../src/Asset/ArchiveSchedule.command.ts'
import { Asset } from '../src/Asset/Asset.aggregate.ts'
import { LinkId, PendingWorkId, ScheduleId, WarrantyId } from '../src/Asset/Asset.id.ts'
import { ActivityEntry, AssetActivity } from '../src/Asset/AssetActivity.view.ts'
import { AssetDetail } from '../src/Asset/AssetDetail.view.ts'
import { AssetNotActive } from '../src/Asset/AssetNotActive.rejection.ts'
import { AttachLink, LinkAlreadyExists, LinkAttached } from '../src/Asset/AttachLink.command.ts'
import {
  CompletePendingWork,
  PendingWorkCompleted,
  PendingWorkNotOpen,
} from '../src/Asset/CompletePendingWork.command.ts'
import { CompleteTask, TaskCompleted } from '../src/Asset/CompleteTask.command.ts'
import { LogService, ServiceLogged } from '../src/Asset/LogService.command.ts'
import { MeterRollback } from '../src/Asset/MeterRollback.rejection.ts'
import { MeterUnitMismatch } from '../src/Asset/MeterUnitMismatch.rejection.ts'
import { NoMeterConfigured } from '../src/Asset/NoMeterConfigured.rejection.ts'
import { MeterRecorded, RecordMeter } from '../src/Asset/RecordMeter.command.ts'
import { RecordWarranty, WarrantyAlreadyExists, WarrantyRecorded } from '../src/Asset/RecordWarranty.command.ts'
import { AssetAlreadyRegistered, AssetRegistered, RegisterAsset } from '../src/Asset/RegisterAsset.command.ts'
import { LinkNotFound, LinkRemoved, RemoveLink } from '../src/Asset/RemoveLink.command.ts'
import { RemoveSpec, SpecNotFound, SpecRemoved } from '../src/Asset/RemoveSpec.command.ts'
import { RemoveWarranty, WarrantyNotFound, WarrantyRemoved } from '../src/Asset/RemoveWarranty.command.ts'
import { AssetRetired, RetireAsset } from '../src/Asset/RetireAsset.command.ts'
import { ScheduleNotFound } from '../src/Asset/ScheduleNotFound.rejection.ts'
import { SetSpec, SpecAlreadyExists, SpecSet } from '../src/Asset/SetSpec.command.ts'
import { AssetUpdated, UpdateAsset } from '../src/Asset/UpdateAsset.command.ts'
import { CurrentActor } from '../src/CurrentActor.context.ts'
import { HomeCatalog } from '../src/Home/HomeCatalog.view.ts'
import { HOME_HOUSEHOLD_ID } from '../src/Household.id.ts'
import { Logbook, LogbookHandlers } from '../src/Logbook.model.ts'
import { LogbookApi } from '../src/LogbookApi.api.ts'
import { Session, Unauthorized } from '../src/Session.middleware.ts'
import { Cadence, IsoDate } from '../src/Values.ts'

const story = Story.make(Logbook, { layer: LogbookHandlers })
const signedIn = Story.provide(CurrentActor, owner('owner@example.com'))
const truck = Asset.ref('truck')
const furnace = Asset.ref('furnace')
const jan1 = '2025-01-01T09:00:00Z'
const truckInput = {
  name: 'Truck',
  category: 'vehicle',
  meterUnit: 'miles',
  initialMeter: 100,
  make: 'Example',
  model: 'Pickup',
  serialNumber: 'A100',
  location: 'Garage',
  purchasedOn: IsoDate.make('2024-02-10'),
  purchasePriceCents: 500_000,
  notes: 'Used',
} satisfies Parameters<typeof RegisterAsset.make>[0]

const furnaceInput = { name: 'Furnace', category: 'home' } satisfies Parameters<typeof RegisterAsset.make>[0]
const truckRegistered = AssetRegistered.make(truckInput)
const furnaceRegistered = AssetRegistered.make(furnaceInput)
const days = Cadence.cases.IntervalDays.make({ days: 10 })
const miles = Cadence.cases.MeterInterval.make({ every: 500, unit: 'miles' })
const either = Cadence.cases.Either.make({ days: 30, every: 300, unit: 'miles' })
const seasonal = Cadence.cases.Seasonal.make({ month: 2, day: 28 })
const annual = { scheduleId: ScheduleId.make('annual'), title: 'Annual inspection', cadence: seasonal }
const oil = { scheduleId: ScheduleId.make('oil'), title: 'Oil change', cadence: either }
const filter = { scheduleId: ScheduleId.make('filter'), title: 'Filter', cadence: days }
const rotation = { scheduleId: ScheduleId.make('rotation'), title: 'Tire rotation', cadence: miles }
const warranty = { warrantyId: WarrantyId.make('parts'), label: 'Parts', expiresOn: IsoDate.make('2027-01-01') }
const spec = { key: 'oil', value: '5W-30', url: 'https://example.com/oil' }
const link = { linkId: LinkId.make('manual'), label: 'Manual', url: 'https://example.com/manual' }

it('defines the model and exposes its full command and view set', () => {
  expect(Domain.verify(Logbook)).toEqual([])
  expect(LogbookApi.commands).toEqual(Asset.definition.commands)
  expect(LogbookApi.serves).toEqual([...Asset.definition.commands, AssetDetail, AssetActivity, HomeCatalog])
})

it.effect('registers two assets, retires one, and refuses all commands after retirement', () => {
  const retired = AssetRetired.make({ reason: 'sold', notes: 'Sold locally' })
  const inactive = AssetNotActive.make({ status: 'retired' })
  return story(
    Story.clock(jan1),
    signedIn,
    Story.when(furnace, RetireAsset.make({ reason: 'retired' })),
    Story.rejected(AssetNotActive.make({ status: 'unregistered' })),
    Story.when(truck, RegisterAsset.make(truckInput)),
    Story.then(truck, truckRegistered),
    Story.when(furnace, RegisterAsset.make(furnaceInput)),
    Story.then(furnace, furnaceRegistered),
    Story.view(AssetDetail, truck, {
      id: truck.id,
      name: 'Truck',
      status: 'active',
      meter: { unit: 'miles', reading: 100 },
      make: 'Example',
      model: 'Pickup',
      serialNumber: 'A100',
      purchasedOn: IsoDate.make('2024-02-10'),
      purchasePriceCents: 500_000,
      totalSpendCents: 0,
      location: 'Garage',
      notes: 'Used',
    }),
    Story.view(AssetDetail, furnace, {
      id: furnace.id,
      name: 'Furnace',
      status: 'active',
      totalSpendCents: 0,
    }),
    Story.when(truck, RegisterAsset.make(truckInput)),
    Story.rejected(AssetAlreadyRegistered.make({ assetId: truck.id })),
    Story.when(truck, RetireAsset.make({ reason: 'sold', notes: 'Sold locally' })),
    Story.then(truck, retired),
    Story.when(truck, RegisterAsset.make(truckInput)),
    Story.rejected(AssetAlreadyRegistered.make({ assetId: truck.id })),
    Story.when(truck, RetireAsset.make({ reason: 'sold' })),
    Story.rejected(inactive),
    Story.when(truck, RecordMeter.make({ reading: 120 })),
    Story.rejected(inactive),
    Story.when(truck, AddSchedule.make(oil)),
    Story.rejected(inactive),
    Story.when(truck, ArchiveSchedule.make({ scheduleId: oil.scheduleId })),
    Story.rejected(inactive),
    Story.when(truck, CompleteTask.make({ scheduleId: oil.scheduleId, performedBy: 'diy' })),
    Story.rejected(inactive),
    Story.when(truck, LogService.make({ title: 'Repair', performedBy: 'shop' })),
    Story.rejected(inactive),
    Story.when(truck, RecordWarranty.make(warranty)),
    Story.rejected(inactive),
    Story.when(truck, RemoveWarranty.make({ warrantyId: warranty.warrantyId })),
    Story.rejected(inactive),
    Story.when(truck, SetSpec.make(spec)),
    Story.rejected(inactive),
    Story.when(truck, RemoveSpec.make({ key: spec.key })),
    Story.rejected(inactive),
    Story.when(truck, AttachLink.make(link)),
    Story.rejected(inactive),
    Story.when(truck, RemoveLink.make({ linkId: link.linkId })),
    Story.rejected(inactive),
    Story.then(truck),
    Story.view(AssetDetail, truck, { status: 'retired', retirementReason: 'sold', retirementNotes: 'Sold locally' }),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets, spendByYear }) => {
      assert.deepStrictEqual(assets[truck.id], {
        id: truck.id,
        name: 'Truck',
        category: 'vehicle',
        status: 'retired',
        make: 'Example',
        model: 'Pickup',
        serialNumber: 'A100',
        purchasedOn: IsoDate.make('2024-02-10'),
        purchasePriceCents: 500_000,
        location: 'Garage',
        notes: 'Used',
        meter: { unit: 'miles', reading: 100 },
        specs: {},
        schedules: {},
        warranties: {},
      })
      assert.deepStrictEqual(assets[furnace.id], {
        id: furnace.id,
        name: 'Furnace',
        category: 'home',
        status: 'active',
        specs: {},
        schedules: {},
        warranties: {},
      })
      assert.deepStrictEqual(spendByYear, {})
    }),
    Story.emitted(AssetActivity, truck, [
      ActivityEntry.make({ assetId: truck.id, at: DateTime.makeUnsafe(jan1), event: truckRegistered }),
      ActivityEntry.make({ assetId: truck.id, at: DateTime.makeUnsafe(jan1), event: retired }),
    ])
  )
})

it.effect('completes one-time work from existing asset history and records the work and spend once', () => {
  const workId = PendingWorkId.make('door-seal')
  const work = { workId, title: 'Replace door seal', notes: 'Spare seal in garage cabinet.' }
  const dated = { workId: PendingWorkId.make('latch'), title: 'Adjust latch', dueOn: IsoDate.make('2025-01-03') }
  const details = {
    workId,
    completedOn: IsoDate.make('2024-12-31'),
    meterReading: 105,
    performedBy: 'shop',
    vendor: 'Local shop',
    costCents: 4525,
    parts: ['Door seal'],
    notes: 'Checked for leaks.',
    links: [{ id: LinkId.make('invoice'), label: 'Invoice', url: 'https://example.com/invoice' }],
  } satisfies Parameters<typeof CompletePendingWork.make>[0]
  const completed = PendingWorkCompleted.make({ ...details, title: work.title, meterAdvancedTo: 105 })
  const notOpen = PendingWorkNotOpen.make({ workId })
  const alreadyExists = PendingWorkAlreadyExists.make({ workId })
  return story(
    Story.clock(jan1),
    signedIn,
    Story.when(truck, AddPendingWork.make(work)),
    Story.rejected(AssetNotActive.make({ status: 'unregistered' })),
    Story.given(truck, truckRegistered),
    Story.when(truck, CompletePendingWork.make(details)),
    Story.rejected(notOpen),
    Story.when(truck, AddPendingWork.make(work)),
    Story.then(truck, PendingWorkAdded.make(work)),
    Story.when(truck, AddPendingWork.make(dated)),
    Story.then(truck, PendingWorkAdded.make(dated)),
    Story.when(truck, AddPendingWork.make(work)),
    Story.rejected(alreadyExists),
    Story.view(AssetDetail, truck, { pendingWork: { [workId]: work, [dated.workId]: dated }, totalSpendCents: 0 }),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets, spendByYear }) => {
      assert.deepStrictEqual(assets[truck.id]?.pendingWork, { [workId]: work, [dated.workId]: dated })
      assert.deepStrictEqual(spendByYear, {})
    }),
    Story.when(truck, CompletePendingWork.make({ ...details, meterReading: 95 })),
    Story.rejected(MeterRollback.make({ current: 100, submitted: 95 })),
    Story.when(truck, CompletePendingWork.make(details)),
    Story.then(truck, completed),
    Story.when(truck, CompletePendingWork.make(details)),
    Story.rejected(notOpen),
    Story.when(truck, AddPendingWork.make(work)),
    Story.rejected(alreadyExists),
    Story.view(AssetDetail, truck, (asset) => {
      assert.deepInclude(asset, { totalSpendCents: 4525, meter: { unit: 'miles', reading: 105 }, schedules: {} })
      assert.deepPropertyVal(asset, 'pendingWork', { [dated.workId]: dated })
    }),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets, spendByYear }) => {
      assert.deepStrictEqual(assets[truck.id]?.pendingWork, { [dated.workId]: dated })
      assert.deepStrictEqual(spendByYear, { '2024': 4525 })
    }),
    Story.emitted(AssetActivity, truck, [
      ActivityEntry.make({ assetId: truck.id, at: DateTime.makeUnsafe(jan1), event: truckRegistered }),
      ActivityEntry.make({ assetId: truck.id, at: DateTime.makeUnsafe(jan1), event: completed }),
    ]),
    Story.when(truck, RetireAsset.make({ reason: 'sold' })),
    Story.then(truck, AssetRetired.make({ reason: 'sold' })),
    Story.when(truck, AddPendingWork.make({ ...work, workId: PendingWorkId.make('new') })),
    Story.rejected(AssetNotActive.make({ status: 'retired' })),
    Story.when(truck, CompletePendingWork.make({ ...details, workId: dated.workId })),
    Story.rejected(AssetNotActive.make({ status: 'retired' }))
  )
})

it.effect('corrects stored asset metadata in detail and catalog views', () => {
  const correction = {
    name: 'Work truck',
    category: 'equipment',
    make: 'Corrected make',
    serialNumber: 'B200',
    purchasePriceCents: 0,
  } satisfies Parameters<typeof UpdateAsset.make>[0]
  const patch = { ...correction, notes: null }
  const corrected = {
    ...correction,
    model: 'Pickup',
    purchasedOn: truckInput.purchasedOn,
    location: 'Garage',
    meter: { unit: truckInput.meterUnit, reading: truckInput.initialMeter },
  }
  const cleared = {
    make: null,
    model: null,
    serialNumber: null,
    purchasedOn: null,
    purchasePriceCents: null,
    location: null,
  }
  return story(
    Story.clock(jan1),
    signedIn,
    Story.given(truck, truckRegistered),
    Story.when(truck, UpdateAsset.make(patch)),
    Story.then(truck, AssetUpdated.make(patch)),
    Story.view(AssetDetail, truck, (asset) => {
      assert.deepInclude(asset, corrected)
      assert.notProperty(asset, 'notes')
    }),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets }) => {
      assert.deepInclude(assets[truck.id], corrected)
      assert.notProperty(assets[truck.id], 'notes')
    }),
    Story.when(truck, UpdateAsset.make(cleared)),
    Story.then(truck, AssetUpdated.make(cleared)),
    Story.view(AssetDetail, truck, (asset) => {
      for (const field of Struct.keys(cleared)) {
        assert.notProperty(asset, field)
      }
    }),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets }) => {
      for (const field of Struct.keys(cleared)) {
        assert.notProperty(assets[truck.id], field)
      }
    })
  )
})

it.effect('rejects metadata changes before registration and after retirement', () =>
  story(
    Story.clock(jan1),
    signedIn,
    Story.when(truck, UpdateAsset.make({ name: 'Work truck' })),
    Story.rejected(AssetNotActive.make({ status: 'unregistered' })),
    Story.given(truck, truckRegistered, AssetRetired.make({ reason: 'sold' })),
    Story.when(truck, UpdateAsset.make({ name: 'Work truck' })),
    Story.rejected(AssetNotActive.make({ status: 'retired' })),
    Story.then(truck)
  )
)

it.effect('records and corrects meter readings, with explicit rollback evidence', () => {
  const recorded = MeterRecorded.make({
    reading: 125,
    previousReading: 100,
    recordedOn: IsoDate.make('2025-01-01'),
    correction: false,
  })
  const corrected = MeterRecorded.make({
    reading: 110,
    previousReading: 125,
    recordedOn: IsoDate.make('2024-12-31'),
    correction: true,
  })
  return story(
    Story.clock(jan1),
    Story.provide(CurrentActor, system('maintenance import')),
    Story.given(truck, truckRegistered),
    Story.given(furnace, furnaceRegistered),
    Story.when(furnace, RecordMeter.make({ reading: 125 })),
    Story.rejected(NoMeterConfigured.make({ assetId: furnace.id })),
    Story.when(truck, RecordMeter.make({ reading: 125 })),
    Story.then(truck, recorded),
    Story.when(truck, RecordMeter.make({ reading: 110 })),
    Story.rejected(MeterRollback.make({ current: 125, submitted: 110 })),
    Story.when(truck, RecordMeter.make({ reading: 110, recordedOn: corrected.recordedOn, correction: true })),
    Story.then(truck, corrected),
    Story.view(AssetDetail, truck, { meter: { unit: 'miles', reading: 110 } }),
    Story.emitted(AssetActivity, truck, [{ event: truckRegistered }, { event: recorded }, { event: corrected }])
  )
})

it.effect('records precomputed thresholds for every cadence and updates them on completion', () => {
  const filterAdded = ScheduleAdded.make({ ...filter, nextDueOn: IsoDate.make('2025-01-11') })
  const rotationAdded = ScheduleAdded.make({ ...rotation, lastCompletedMeter: 20, nextDueMeter: 520 })
  const oilAdded = ScheduleAdded.make({ ...oil, nextDueOn: IsoDate.make('2025-01-31'), nextDueMeter: 400 })
  const annualAdded = ScheduleAdded.make({
    ...annual,
    lastCompletedOn: IsoDate.make('2025-02-28'),
    nextDueOn: IsoDate.make('2026-02-28'),
  })
  const work = { scheduleId: oil.scheduleId, performedBy: 'diy', costCents: 2000 } as const
  const completed = TaskCompleted.make({
    ...work,
    completedOn: IsoDate.make('2025-01-04'),
    meterReading: 180,
    meterAdvancedTo: 180,
    nextDueOn: IsoDate.make('2025-02-03'),
    nextDueMeter: 480,
  })
  const replacement = { ...oil, title: 'New oil service' }
  const thresholds = Struct.pick(completed, ['nextDueOn', 'nextDueMeter'])
  const laterWork = { ...work, parts: ['Filter'] }
  const laterCompletion = TaskCompleted.make({ ...laterWork, completedOn: completed.completedOn, ...thresholds })
  return story(
    Story.clock(jan1),
    signedIn,
    Story.given(truck, truckRegistered),
    Story.given(furnace, furnaceRegistered),
    Story.when(furnace, AddSchedule.make(rotation)),
    Story.rejected(NoMeterConfigured.make({ assetId: furnace.id })),
    Story.when(
      truck,
      AddSchedule.make({ ...rotation, cadence: Cadence.cases.MeterInterval.make({ every: 25, unit: 'hours' }) })
    ),
    Story.rejected(MeterUnitMismatch.make({ configured: 'miles', requested: 'hours' })),
    Story.when(truck, AddSchedule.make(filter)),
    Story.then(truck, filterAdded),
    Story.when(truck, AddSchedule.make({ ...rotation, lastCompletedMeter: 20 })),
    Story.then(truck, rotationAdded),
    Story.when(truck, AddSchedule.make(oil)),
    Story.then(truck, oilAdded),
    Story.when(
      truck,
      AddSchedule.make({ ...annual, lastCompletedOn: annualAdded.lastCompletedOn ?? IsoDate.make('2025-02-28') })
    ),
    Story.then(truck, annualAdded),
    Story.when(truck, AddSchedule.make(oil)),
    Story.rejected(ScheduleAlreadyExists.make({ scheduleId: oil.scheduleId })),
    Story.view(AssetDetail, truck, (state) => {
      assert.propertyVal(state, 'status', 'active')
      if (state.status === 'active') {
        const { _tag: _filter, ...filterFields } = filterAdded
        const { _tag: _rotation, ...rotationFields } = rotationAdded
        const { _tag: _oil, ...oilFields } = oilAdded
        const { _tag: _annual, ...annualFields } = annualAdded
        assert.deepStrictEqual(state.schedules, {
          [filter.scheduleId]: filterFields,
          [rotation.scheduleId]: rotationFields,
          [oil.scheduleId]: oilFields,
          [annual.scheduleId]: annualFields,
        })
      }
    }),
    Story.advance('3 days'),
    Story.when(truck, CompleteTask.make({ ...work, meterReading: 90 })),
    Story.rejected(MeterRollback.make({ current: 100, submitted: 90 })),
    Story.when(truck, CompleteTask.make({ ...work, meterReading: 180 })),
    Story.then(truck, completed),
    Story.view(AssetDetail, truck, (state) => {
      assert(state.status === 'active')
      assert.deepStrictEqual(state.meter, { unit: 'miles', reading: 180 })
      assert.strictEqual(state.totalSpendCents, 2000)
      assert.deepInclude(state.schedules[oil.scheduleId], {
        lastCompletedOn: IsoDate.make('2025-01-04'),
        lastCompletedMeter: 180,
        nextDueOn: IsoDate.make('2025-02-03'),
        nextDueMeter: 480,
      })
    }),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets, spendByYear }) => {
      assert.deepStrictEqual(assets[truck.id]?.schedules[oil.scheduleId], {
        title: oil.title,
        nextDueOn: IsoDate.make('2025-02-03'),
        nextDueMeter: 480,
      })
      assert.deepStrictEqual(spendByYear, { '2025': 2000 })
    }),
    Story.when(truck, ArchiveSchedule.make({ scheduleId: oil.scheduleId })),
    Story.then(truck, ScheduleArchived.make({ scheduleId: oil.scheduleId })),
    Story.when(truck, ArchiveSchedule.make({ scheduleId: oil.scheduleId })),
    Story.rejected(ScheduleNotFound.make({ scheduleId: oil.scheduleId })),
    Story.when(truck, CompleteTask.make(work)),
    Story.rejected(ScheduleNotFound.make({ scheduleId: oil.scheduleId })),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets }) => {
      assert.isUndefined(assets[truck.id]?.schedules[oil.scheduleId])
    }),
    Story.when(truck, AddSchedule.make(replacement)),
    Story.then(truck, ScheduleAdded.make({ ...replacement, ...thresholds })),
    Story.when(truck, CompleteTask.make(laterWork)),
    Story.then(truck, laterCompletion),
    Story.emitted(AssetActivity, truck, [
      { event: truckRegistered },
      { event: completed, scheduleTitle: oil.title },
      { event: laterCompletion, scheduleTitle: replacement.title },
    ])
  )
})

it.effect('rejects service readings without a meter and accepts explicit corrections', () => {
  const work = { title: 'Repair', performedBy: 'shop', meterReading: 80 } as const
  const noMeter = NoMeterConfigured.make({ assetId: furnace.id })
  const completedOn = IsoDate.make('2025-01-01')
  return story(
    Story.clock(jan1),
    signedIn,
    Story.given(truck, truckRegistered, ScheduleAdded.make(oil)),
    Story.given(furnace, furnaceRegistered, ScheduleAdded.make(filter)),
    Story.when(furnace, CompleteTask.make({ ...work, scheduleId: filter.scheduleId })),
    Story.rejected(noMeter),
    Story.when(furnace, LogService.make(work)),
    Story.rejected(noMeter),
    Story.when(truck, LogService.make(work)),
    Story.rejected(MeterRollback.make({ current: 100, submitted: 80 })),
    Story.when(truck, LogService.make({ ...work, correction: true })),
    Story.then(truck, ServiceLogged.make({ ...work, performedOn: completedOn, meterAdvancedTo: 80 })),
    Story.when(
      truck,
      CompleteTask.make({ scheduleId: oil.scheduleId, performedBy: 'shop', meterReading: 75, correction: true })
    ),
    Story.then(
      truck,
      TaskCompleted.make({
        scheduleId: oil.scheduleId,
        performedBy: 'shop',
        completedOn,
        meterReading: 75,
        meterAdvancedTo: 75,
        nextDueOn: IsoDate.make('2025-01-31'),
        nextDueMeter: 375,
      })
    ),
    Story.view(AssetDetail, truck, { meter: { unit: 'miles', reading: 75 } })
  )
})

it.effect('replaces a schedule once and keeps its past completions and costs', () => {
  const lastCompletedOn = IsoDate.make('2025-01-01')
  const work = TaskCompleted.make({
    scheduleId: oil.scheduleId,
    performedBy: 'diy',
    completedOn: lastCompletedOn,
    meterReading: 100,
    costCents: 2000,
  })
  const replacement = {
    scheduleId: ScheduleId.make('new-oil'),
    title: 'Oil change',
    cadence: Cadence.cases.IntervalDays.make({ days: 60 }),
    lastCompletedOn,
  }
  const replace = AddSchedule.make({ ...replacement, replacesScheduleId: oil.scheduleId })
  const nextDueOn = IsoDate.make('2025-03-02')
  const archived = ScheduleArchived.make({ scheduleId: oil.scheduleId })
  const options = { commandId: 'replace-oil' }

  return story(
    Story.clock(jan1),
    signedIn,
    Story.given(truck, truckRegistered, ScheduleAdded.make(oil), work),
    Story.when(
      truck,
      AddSchedule.make({
        ...replace,
        cadence: Cadence.cases.MeterInterval.make({ every: 500, unit: 'hours' }),
      })
    ),
    Story.rejected(MeterUnitMismatch.make({ configured: 'miles', requested: 'hours' })),
    Story.when(truck, replace, options),
    Story.then(truck, archived, ScheduleAdded.make({ ...replacement, nextDueOn })),
    Story.when(truck, replace, options),
    Story.then(truck),
    Story.when(truck, AddSchedule.make({ ...replace, scheduleId: ScheduleId.make('stale-replacement') })),
    Story.rejected(ScheduleNotFound.make({ scheduleId: oil.scheduleId })),
    Story.view(AssetDetail, truck, {
      schedules: { [replacement.scheduleId]: { ...replacement, nextDueOn } },
      totalSpendCents: 2000,
    }),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets }) => {
      assert.deepStrictEqual(assets[truck.id]?.schedules, {
        [replacement.scheduleId]: { title: 'Oil change', nextDueOn },
      })
    }),
    Story.emitted(AssetActivity, truck, [{ event: truckRegistered }, { event: work }])
  )
})

it.effect('replaces links and warranties and renames a specification without overwriting another', () => {
  const newLink = { ...link, linkId: LinkId.make('manual-v2'), url: 'https://example.com/new-manual' }
  const newWarranty = {
    ...warranty,
    warrantyId: WarrantyId.make('parts-corrected'),
    expiresOn: IsoDate.make('2028-01-01'),
  }
  const otherSpec = { key: 'filter', value: 'A1' }
  const newSpec = { key: 'engine oil', value: '0W-20' }
  return story(
    Story.clock(jan1),
    signedIn,
    Story.given(
      truck,
      truckRegistered,
      LinkAttached.make(link),
      WarrantyRecorded.make(warranty),
      SpecSet.make(spec),
      SpecSet.make(otherSpec)
    ),
    Story.when(truck, AttachLink.make({ ...newLink, replacesLinkId: link.linkId })),
    Story.then(truck, LinkRemoved.make({ linkId: link.linkId }), LinkAttached.make(newLink)),
    Story.when(truck, AttachLink.make({ ...newLink, linkId: LinkId.make('stale'), replacesLinkId: link.linkId })),
    Story.rejected(LinkNotFound.make({ linkId: link.linkId })),
    Story.when(truck, RecordWarranty.make({ ...newWarranty, replacesWarrantyId: warranty.warrantyId })),
    Story.then(truck, WarrantyRemoved.make({ warrantyId: warranty.warrantyId }), WarrantyRecorded.make(newWarranty)),
    Story.when(truck, RecordWarranty.make({ ...newWarranty, replacesWarrantyId: warranty.warrantyId })),
    Story.rejected(WarrantyNotFound.make({ warrantyId: warranty.warrantyId })),
    Story.when(truck, SetSpec.make({ key: otherSpec.key, value: '0W-20', previousKey: spec.key })),
    Story.rejected(SpecAlreadyExists.make({ key: otherSpec.key })),
    Story.when(truck, SetSpec.make({ key: spec.key, value: '0W-20', previousKey: spec.key })),
    Story.then(truck, SpecSet.make({ key: spec.key, value: '0W-20' })),
    Story.when(truck, SetSpec.make({ ...newSpec, previousKey: spec.key })),
    Story.then(truck, SpecRemoved.make({ key: spec.key }), SpecSet.make(newSpec)),
    Story.when(truck, SetSpec.make({ ...newSpec, previousKey: spec.key })),
    Story.rejected(SpecNotFound.make({ key: spec.key })),
    Story.view(AssetDetail, truck, (state) => {
      assert(state.status === 'active')
      assert.deepStrictEqual(state.links, {
        [newLink.linkId]: { id: newLink.linkId, label: newLink.label, url: newLink.url },
      })
      assert.deepStrictEqual(state.warranties, {
        [newWarranty.warrantyId]: {
          id: newWarranty.warrantyId,
          label: newWarranty.label,
          expiresOn: newWarranty.expiresOn,
        },
      })
      assert.deepStrictEqual(state.specs, { [otherSpec.key]: otherSpec, [newSpec.key]: newSpec })
    })
  )
})

it.effect('projects ad hoc service costs by service year and tracks specifications, warranties, and links', () => {
  const work = {
    title: 'Repair',
    performedBy: 'shop',
    performedOn: IsoDate.make('2024-12-31'),
    costCents: 12_500,
    vendor: 'Repair shop',
    parts: ['Filter'],
    notes: 'Replaced the filter',
    links: [{ id: link.linkId, label: link.label, url: link.url }],
  } as const
  const service = ServiceLogged.make(work)
  const warrantyRecorded = WarrantyRecorded.make(warranty)
  const newSpec = { key: spec.key, value: '0W-20' }
  return story(
    Story.clock(jan1),
    signedIn,
    Story.given(truck, truckRegistered),
    Story.when(truck, LogService.make(work)),
    Story.then(truck, service),
    Story.when(truck, LogService.make({ title: 'Tune up', performedBy: 'diy', costCents: 500 })),
    Story.then(
      truck,
      ServiceLogged.make({
        title: 'Tune up',
        performedBy: 'diy',
        costCents: 500,
        performedOn: IsoDate.make('2025-01-01'),
      })
    ),
    Story.when(truck, SetSpec.make(spec)),
    Story.then(truck, SpecSet.make(spec)),
    Story.when(truck, SetSpec.make(newSpec)),
    Story.then(truck, SpecSet.make(newSpec)),
    Story.when(truck, RecordWarranty.make(warranty)),
    Story.then(truck, warrantyRecorded),
    Story.when(truck, RecordWarranty.make(warranty)),
    Story.rejected(WarrantyAlreadyExists.make({ warrantyId: warranty.warrantyId })),
    Story.when(truck, AttachLink.make(link)),
    Story.then(truck, LinkAttached.make(link)),
    Story.when(truck, AttachLink.make(link)),
    Story.rejected(LinkAlreadyExists.make({ linkId: link.linkId })),
    Story.view(AssetDetail, truck, {
      totalSpendCents: 13_000,
      specs: { [spec.key]: newSpec },
      warranties: {
        [warranty.warrantyId]: { id: warranty.warrantyId, label: warranty.label, expiresOn: warranty.expiresOn },
      },
      links: { [link.linkId]: { id: link.linkId, label: link.label, url: link.url } },
    }),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets, spendByYear }) => {
      assert.deepStrictEqual(assets[truck.id]?.warranties, {
        [warranty.warrantyId]: { label: warranty.label, expiresOn: warranty.expiresOn },
      })
      assert.deepStrictEqual(assets[truck.id]?.specs, { [spec.key]: newSpec })
      assert.deepStrictEqual(spendByYear, { '2024': 12_500, '2025': 500 })
    }),
    Story.when(truck, RemoveSpec.make({ key: spec.key })),
    Story.then(truck, SpecRemoved.make({ key: spec.key })),
    Story.when(truck, RemoveSpec.make({ key: spec.key })),
    Story.rejected(SpecNotFound.make({ key: spec.key })),
    Story.when(truck, RemoveWarranty.make({ warrantyId: warranty.warrantyId })),
    Story.then(truck, WarrantyRemoved.make({ warrantyId: warranty.warrantyId })),
    Story.when(truck, RemoveWarranty.make({ warrantyId: warranty.warrantyId })),
    Story.rejected(WarrantyNotFound.make({ warrantyId: warranty.warrantyId })),
    Story.when(truck, RemoveLink.make({ linkId: link.linkId })),
    Story.then(truck, LinkRemoved.make({ linkId: link.linkId })),
    Story.when(truck, RemoveLink.make({ linkId: link.linkId })),
    Story.rejected(LinkNotFound.make({ linkId: link.linkId })),
    Story.view(AssetDetail, truck, (state) => {
      assert(state.status === 'active')
      assert.isEmpty(state.warranties)
      assert.isEmpty(state.links)
      assert.isEmpty(state.specs)
    }),
    Story.view(HomeCatalog, HOME_HOUSEHOLD_ID, ({ assets }) => {
      assert.deepStrictEqual(assets[truck.id]?.warranties, {})
      assert.deepStrictEqual(assets[truck.id]?.specs, {})
    }),
    Story.emitted(AssetActivity, truck, [
      { event: truckRegistered },
      { event: service },
      {
        event: ServiceLogged.make({
          title: 'Tune up',
          performedBy: 'diy',
          performedOn: IsoDate.make('2025-01-01'),
          costCents: 500,
        }),
      },
      { event: warrantyRecorded },
    ])
  )
})

const TestSession = Layer.succeed(Session, (effect, { headers }) =>
  headers['authorization'] === 'test-owner'
    ? Effect.provideService(effect, CurrentActor, owner('owner@example.com'))
    : Effect.fail(Unauthorized.make({}))
)
const ApiLayer = TestSession.pipe(
  Layer.provideMerge(Logbook.layer(LogbookHandlers).pipe(Layer.provide(Domain.InMemory)))
)

// The in-process API uses the runtime clock for its projection workers.
// ast-grep-ignore: no-it-live
it.live('requires a session and reads activity through a page cursor', () =>
  Effect.gen(function* () {
    const client = yield* LogbookApi.clientInProcess
    const error = yield* client.AssetActivity.list(truck.id).pipe(Effect.flip)
    assert.instanceOf(error, Unauthorized)

    const session = { headers: { authorization: 'test-owner' } }
    yield* client.RegisterAsset(truck.id, truckInput, session)
    const receipt = yield* client.RecordMeter(truck.id, { reading: 200 }, session)

    const first = yield* client.AssetActivity.list(truck.id, { ...session, atLeast: receipt, take: 1, order: 'asc' })
    assert.lengthOf(first.entries, 1)
    assert.deepStrictEqual(first.entries[0]?.event.event, truckRegistered)
    assert(first.cursor !== null)

    const second = yield* client.AssetActivity.list(truck.id, { ...session, after: first.cursor, order: 'asc' })
    assert.lengthOf(second.entries, 1)
    assert.propertyVal(second.entries[0]?.event.event, 'reading', 200)
    assert.isNull(second.cursor)

    const changes = yield* client.AssetActivity.events(truck.id, { ...session, after: first.cursor }).pipe(
      Stream.take(1),
      Stream.runCollect
    )
    assert.deepStrictEqual(changes[0], second.entries[0])
  }).pipe(Effect.provide(ApiLayer))
)
