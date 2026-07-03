import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import {
  buildDosageHistoryStats,
  buildInjectionDayOfWeekStats,
  buildObservedInjectionFrequency,
  calculateWeightTrajectory,
  Count,
  DrugBreakdownStats,
  DrugCount,
  DrugName,
  InjectionSiteCount,
  InjectionSiteStats,
  InjectionSite,
  TrendLine,
  Weight,
  WeightRateOfChange,
  WeightStats,
  WeightTrendPoint,
  WeightTrendStats,
} from '#shared'
import type { DosageHistoryStats, InjectionDayOfWeekStats, InjectionFrequencyStats, StatsParams } from '#shared'

// ============================================
// Raw SQL Result Schema
// ============================================

// Weight stats row schema (combined query with points as JSON)
const WeightStatsRow = Schema.Struct({
  min_weight: Schema.NullOr(Schema.Number),
  max_weight: Schema.NullOr(Schema.Number),
  avg_weight: Schema.NullOr(Schema.Number),
  entry_count: Schema.Number,
  points_json: Schema.String,
})
const decodeWeightStatsRow = Schema.decodeUnknownEffect(WeightStatsRow)

// Schema for parsing points from JSON
const WeightPointJson = Schema.Struct({
  datetime: Schema.String,
  weight: Schema.Number,
})
const decodeWeightPointsJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(WeightPointJson)))

// Weight trend row schema - decode ISO8601 string to Date
const WeightTrendRow = Schema.Struct({
  datetime: Schema.DateFromString,
  weight: Schema.Number,
})
const decodeWeightTrendRow = Schema.decodeUnknownEffect(WeightTrendRow)

// Injection site count row schema
const InjectionSiteRow = Schema.Struct({
  injection_site: Schema.NullOr(Schema.String),
  count: Schema.Number,
})
const decodeInjectionSiteRow = Schema.decodeUnknownEffect(InjectionSiteRow)

// Dosage history row schema - decode ISO8601 string to Date
const DosageHistoryRow = Schema.Struct({
  datetime: Schema.DateFromString,
  drug: Schema.String,
  dosage: Schema.String,
})
const decodeDosageHistoryRow = Schema.decodeUnknownEffect(DosageHistoryRow)

// Drug count row schema
const DrugCountRow = Schema.Struct({
  drug: Schema.String,
  count: Schema.Number,
})
const decodeDrugCountRow = Schema.decodeUnknownEffect(DrugCountRow)

// Datetime-only row schema (for timezone-aware day of week calculation)
const DatetimeRow = Schema.Struct({
  datetime: Schema.DateFromString,
})
const decodeDatetimeRows = Schema.decodeUnknownEffect(Schema.Array(DatetimeRow))

// ============================================
// Stats Service Definition
// ============================================

export class StatsService extends Context.Service<
  StatsService,
  {
    readonly getWeightStats: (params: StatsParams, userId: string) => Effect.Effect<Option.Option<WeightStats>>
    readonly getWeightTrend: (params: StatsParams, userId: string) => Effect.Effect<WeightTrendStats>
    readonly getInjectionSiteStats: (params: StatsParams, userId: string) => Effect.Effect<InjectionSiteStats>
    readonly getDosageHistory: (params: StatsParams, userId: string) => Effect.Effect<DosageHistoryStats>
    readonly getInjectionFrequency: (
      params: StatsParams,
      userId: string
    ) => Effect.Effect<Option.Option<InjectionFrequencyStats>>
    readonly getDrugBreakdown: (params: StatsParams, userId: string) => Effect.Effect<DrugBreakdownStats>
    readonly getInjectionByDayOfWeek: (params: StatsParams, userId: string) => Effect.Effect<InjectionDayOfWeekStats>
  }
>()('@garage/subq/stats/stats-service/StatsService') {}

// ============================================
// Stats Service Implementation
// ============================================

export const StatsServiceLive = Layer.effect(
  StatsService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const listInjectionDatetimes = Effect.fn('StatsService.listInjectionDatetimes')(function* (
      params: StatsParams,
      userId: string
    ) {
      const startDateStr = params.startDate?.toISOString()
      const endDateStr = params.endDate?.toISOString()
      const rows = yield* sql`
          SELECT datetime
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
          ORDER BY datetime ASC
        `
      const decoded = yield* decodeDatetimeRows(rows)
      return Arr.map(decoded, (row) => row.datetime)
    })

    const getWeightStats = Effect.fn('StatsService.getWeightStats')(function* (params: StatsParams, userId: string) {
      yield* Effect.annotateCurrentSpan('userId', userId)
      const startDateStr = params.startDate?.toISOString()
      const endDateStr = params.endDate?.toISOString()

      // Combined query: get summary stats and all points in a single D1 roundtrip
      const rows = yield* sql`
          SELECT
            MIN(weight) as min_weight,
            MAX(weight) as max_weight,
            AVG(weight) as avg_weight,
            COUNT(*) as entry_count,
            (
              SELECT json_group_array(json_object('datetime', datetime, 'weight', weight))
              FROM (
                SELECT datetime, weight
                FROM weight_logs
                WHERE user_id = ${userId}
                ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
                ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
                ORDER BY datetime ASC
              )
            ) as points_json
          FROM weight_logs
          WHERE user_id = ${userId}
          ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
        `
      if (Arr.isReadonlyArrayEmpty(rows)) {
        return Option.none()
      }

      const decoded = yield* decodeWeightStatsRow(rows[0])
      if (decoded.min_weight === null || decoded.max_weight === null || decoded.avg_weight === null) {
        return Option.none()
      }

      // Parse points from JSON
      const pointsRaw = yield* decodeWeightPointsJson(decoded.points_json)
      const points: { date: Date; weight: number }[] = Arr.map(pointsRaw, (p) => ({
        date: DateTime.toDate(DateTime.makeUnsafe(p.datetime)),
        weight: p.weight,
      }))

      const trajectory = calculateWeightTrajectory(points)
      yield* Effect.annotateCurrentSpan('entryCount', decoded.entry_count)

      return Option.some(
        new WeightStats({
          minWeight: Weight.make(decoded.min_weight),
          maxWeight: Weight.make(decoded.max_weight),
          avgWeight: Weight.make(decoded.avg_weight),
          rateOfChange: WeightRateOfChange.make(trajectory.rateOfChange),
          entryCount: Count.make(decoded.entry_count),
        })
      )
    }, Effect.orDie)

    const getWeightTrend = Effect.fn('StatsService.getWeightTrend')(function* (params: StatsParams, userId: string) {
      yield* Effect.annotateCurrentSpan('userId', userId)
      const startDateStr = params.startDate?.toISOString()
      const endDateStr = params.endDate?.toISOString()
      const rows = yield* sql`
          SELECT datetime, weight
          FROM weight_logs
          WHERE user_id = ${userId}
          ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
          ORDER BY datetime ASC
        `
      const points = yield* Effect.forEach(
        rows,
        (row) =>
          Effect.map(
            decodeWeightTrendRow(row),
            (decoded) => new WeightTrendPoint({ date: decoded.datetime, weight: Weight.make(decoded.weight) })
          ),
        { concurrency: 1 }
      )

      const trajectory = calculateWeightTrajectory(points)
      const trendLine = Option.match(trajectory.trendLine, {
        onNone: () => null,
        onSome: (trendLineData) =>
          new TrendLine({
            slope: trendLineData.slope,
            intercept: trendLineData.intercept,
            startDate: trendLineData.startDate,
            startWeight: Weight.make(trendLineData.startWeight),
            endDate: trendLineData.endDate,
            endWeight: Weight.make(trendLineData.endWeight),
          }),
      })
      yield* Effect.annotateCurrentSpan('pointCount', points.length)

      return new WeightTrendStats({ points, trendLine })
    }, Effect.orDie)

    const getInjectionSiteStats = Effect.fn('StatsService.getInjectionSiteStats')(function* (
      params: StatsParams,
      userId: string
    ) {
      yield* Effect.annotateCurrentSpan('userId', userId)
      const startDateStr = params.startDate?.toISOString()
      const endDateStr = params.endDate?.toISOString()
      const rows = yield* sql`
          SELECT
            COALESCE(injection_site, 'Unknown') as injection_site,
            COUNT(*) as count
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
          GROUP BY injection_site
          ORDER BY count DESC
        `
      const decodedRows = yield* Effect.forEach(rows, (row) => decodeInjectionSiteRow(row), { concurrency: 1 })
      const sites = Arr.map(
        decodedRows,
        (decoded) =>
          new InjectionSiteCount({
            site: InjectionSite.make(decoded.injection_site ?? 'Unknown'),
            count: Count.make(decoded.count),
          })
      )
      const total = Arr.reduce(decodedRows, 0, (sum, decoded) => sum + decoded.count)
      yield* Effect.annotateCurrentSpan('totalInjections', total)
      return new InjectionSiteStats({ sites, totalInjections: Count.make(total) })
    }, Effect.orDie)

    const getDosageHistory = Effect.fn('StatsService.getDosageHistory')(function* (
      params: StatsParams,
      userId: string
    ) {
      yield* Effect.annotateCurrentSpan('userId', userId)
      const startDateStr = params.startDate?.toISOString()
      const endDateStr = params.endDate?.toISOString()
      const rows = yield* sql`
          SELECT datetime, drug, dosage
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
          ORDER BY datetime ASC
        `
      const inputs = yield* Effect.forEach(
        rows,
        (row) =>
          Effect.map(decodeDosageHistoryRow(row), (decoded) => ({
            date: decoded.datetime,
            drug: decoded.drug,
            dosage: decoded.dosage,
          })),
        { concurrency: 1 }
      )
      yield* Effect.annotateCurrentSpan('pointCount', inputs.length)
      return buildDosageHistoryStats(inputs)
    }, Effect.orDie)

    const getInjectionFrequency = Effect.fn('StatsService.getInjectionFrequency')(function* (
      params: StatsParams,
      userId: string
    ) {
      yield* Effect.annotateCurrentSpan('userId', userId)
      const timezone = params.timezone ?? 'UTC'
      const datetimes = yield* listInjectionDatetimes(params, userId)
      const result = buildObservedInjectionFrequency(datetimes, timezone)

      yield* Effect.annotateCurrentSpan(
        'totalInjections',
        Option.match(result, { onNone: () => 0, onSome: ({ totalInjections }) => totalInjections })
      )
      yield* Effect.annotateCurrentSpan('timezone', timezone)
      return result
    }, Effect.orDie)

    const getDrugBreakdown = Effect.fn('StatsService.getDrugBreakdown')(function* (
      params: StatsParams,
      userId: string
    ) {
      yield* Effect.annotateCurrentSpan('userId', userId)
      const startDateStr = params.startDate?.toISOString()
      const endDateStr = params.endDate?.toISOString()
      const rows = yield* sql`
          SELECT drug, COUNT(*) as count
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
          GROUP BY drug
          ORDER BY count DESC
        `
      const decodedRows = yield* Effect.forEach(rows, (row) => decodeDrugCountRow(row), { concurrency: 1 })
      const drugs = Arr.map(
        decodedRows,
        (decoded) => new DrugCount({ drug: DrugName.make(decoded.drug), count: Count.make(decoded.count) })
      )
      const total = Arr.reduce(decodedRows, 0, (sum, decoded) => sum + decoded.count)
      yield* Effect.annotateCurrentSpan('totalInjections', total)
      return new DrugBreakdownStats({ drugs, totalInjections: Count.make(total) })
    }, Effect.orDie)

    const getInjectionByDayOfWeek = Effect.fn('StatsService.getInjectionByDayOfWeek')(function* (
      params: StatsParams,
      userId: string
    ) {
      yield* Effect.annotateCurrentSpan('userId', userId)
      const timezone = params.timezone ?? 'UTC'
      const datetimes = yield* listInjectionDatetimes(params, userId)
      const result = buildInjectionDayOfWeekStats(datetimes, timezone)

      yield* Effect.annotateCurrentSpan('totalInjections', result.totalInjections)
      yield* Effect.annotateCurrentSpan('timezone', timezone)
      return result
    }, Effect.orDie)

    return {
      getWeightStats,
      getWeightTrend,
      getInjectionSiteStats,
      getDosageHistory,
      getInjectionFrequency,
      getDrugBreakdown,
      getInjectionByDayOfWeek,
    }
  })
)
