import { AssetId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { HOME_HOUSEHOLD_ID } from '@garage/logbook-domain/Household.id'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import { computeDueStatus, isoDateFromUtc } from '@garage/logbook-domain/ScheduleMath'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import { AssetCategory, DueThresholds, IsoDate, MeterReading, MeterUnit } from '@garage/logbook-domain/Values'
import { Platform } from 'alchemy/Http'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'
import * as Layer from 'effect/Layer'
import * as Order from 'effect/Order'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'

const dayCount = Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
const DueQuery = Schema.Struct({
  withinDays: dayCount.pipe(Schema.withDecodingDefaultKey(Effect.succeed('30'))),
  withinMeter: Schema.NumberFromString.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0)).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('500'))
  ),
  warrantyDays: dayCount.pipe(Schema.withDecodingDefaultKey(Effect.succeed('60'))),
})

const DueItem = Schema.Struct({
  assetId: AssetId,
  assetName: Schema.NonEmptyString,
  category: AssetCategory,
  scheduleId: ScheduleId,
  title: Schema.NonEmptyString,
  ...DueThresholds.fields,
  currentMeter: Schema.optionalKey(MeterReading),
  meterUnit: Schema.optionalKey(MeterUnit),
})
type DueItem = typeof DueItem.Type

const WarrantyExpiry = Schema.Struct({
  assetId: AssetId,
  assetName: Schema.NonEmptyString,
  warrantyId: WarrantyId,
  label: Schema.String,
  expiresOn: IsoDate,
  daysRemaining: Schema.Int,
})
type WarrantyExpiry = typeof WarrantyExpiry.Type

const DueReport = Schema.Struct({
  generatedOn: IsoDate,
  overdue: Schema.Array(DueItem),
  dueSoon: Schema.Array(DueItem),
  warrantiesExpiring: Schema.Array(WarrantyExpiry),
})

const frame = HttpApiGroup.make('frame').add(
  HttpApiEndpoint.get('due', '/frame/due', {
    query: DueQuery,
    success: DueReport,
    error: [Unauthorized, HttpApiError.ServiceUnavailableNoContent],
  })
)
const api = HttpApi.make('FrameApi').add(frame)

const byDueDate = Order.combineAll<DueItem>([
  Order.mapInput(Order.String, (item: DueItem) => item.nextDueOn ?? '\uffff'),
  Order.mapInput(Order.String, (item: DueItem) => item.assetName),
  Order.mapInput(Order.String, (item: DueItem) => item.assetId),
  Order.mapInput(Order.String, (item: DueItem) => item.scheduleId),
])
const byWarrantyDate = Order.combineAll<WarrantyExpiry>([
  Order.mapInput(Order.String, (item: WarrantyExpiry) => item.expiresOn),
  Order.mapInput(Order.String, (item: WarrantyExpiry) => item.assetName),
  Order.mapInput(Order.String, (item: WarrantyExpiry) => item.assetId),
  Order.mapInput(Order.String, (item: WarrantyExpiry) => item.warrantyId),
])

const handlers = HttpApiBuilder.group(api, 'frame', (group) =>
  group.handle(
    'due',
    Effect.fn('logbook.frame.due')(function* ({ query, request }) {
      const client = yield* LogbookApi.clientInProcess
      const catalog = yield* client.HomeCatalog.get(HOME_HOUSEHOLD_ID, { headers: request.headers }).pipe(
        Effect.catchTags({
          ConsistencyTimeout: () => Effect.fail(HttpApiError.ServiceUnavailable.make({})),
          RpcClientError: () => Effect.fail(HttpApiError.ServiceUnavailable.make({})),
        })
      )
      const now = yield* DateTime.now
      const generatedOn = isoDateFromUtc(now)
      const today = DateTime.makeUnsafe(generatedOn)
      const overdue: Array<DueItem> = []
      const dueSoon: Array<DueItem> = []
      const warrantiesExpiring: Array<WarrantyExpiry> = []

      for (const asset of Record.values(catalog?.assets ?? {})) {
        if (asset.status === 'retired') {
          continue
        }
        const identity = { assetId: asset.id, assetName: asset.name }
        const meter =
          asset.meter === undefined ? {} : { currentMeter: asset.meter.reading, meterUnit: asset.meter.unit }
        for (const [scheduleId, schedule] of Record.toEntries(asset.schedules)) {
          const status = computeDueStatus({ ...schedule, ...meter, ...query, nowDate: generatedOn })
          const item = { ...identity, category: asset.category, scheduleId, ...schedule, ...meter }
          if (status === 'overdue') {
            overdue.push(item)
          } else if (status === 'due_soon') {
            dueSoon.push(item)
          }
        }
        for (const [warrantyId, warranty] of Record.toEntries(asset.warranties)) {
          const daysRemaining = DateTime.distance(today, DateTime.makeUnsafe(warranty.expiresOn)).pipe(Duration.toDays)
          if (warranty.expiresOn >= generatedOn && daysRemaining <= query.warrantyDays) {
            warrantiesExpiring.push({ ...identity, warrantyId, ...warranty, daysRemaining })
          }
        }
      }

      return {
        generatedOn,
        overdue: Arr.sort(overdue, byDueDate),
        dueSoon: Arr.sort(dueSoon, byDueDate),
        warrantiesExpiring: Arr.sort(warrantiesExpiring, byWarrantyDate),
      }
    }, Effect.scoped)
  )
)

export const FrameApi = HttpApiBuilder.layer(api).pipe(Layer.provide(Layer.mergeAll(handlers, Platform)))
