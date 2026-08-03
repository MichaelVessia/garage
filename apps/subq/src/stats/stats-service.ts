import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import {
  buildDoseHistoryStats,
  buildInjectionDayOfWeekStats,
  buildObservedInjectionFrequency,
  calculateWeightTrajectory,
  Count,
  DrugBreakdownStats,
  DrugCount,
  DoseMg,
  MedicationCompound,
  InjectionSiteCount,
  InjectionSiteStats,
  InjectionSite,
  StatsDatabaseError,
  TrendLine,
  Weight,
  WeightRateOfChange,
  WeightStats,
  WeightTrendPoint,
  WeightTrendStats,
} from '#shared'
import type { DoseHistoryStats, InjectionDayOfWeekStats, InjectionFrequencyStats, StatsParams } from '#shared'

import { mapDbError } from '../shared/common/db-error.js'

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
  datetime: Schema.DateFromString.check(Schema.isDateValid()),
  weight: Schema.Number,
})
const decodeWeightTrendRows = Schema.decodeUnknownEffect(Schema.Array(WeightTrendRow))

// Injection site count row schema
const InjectionSiteRow = Schema.Struct({
  injection_site: Schema.NullOr(Schema.String),
  count: Schema.Number,
})
const decodeInjectionSiteRows = Schema.decodeUnknownEffect(Schema.Array(InjectionSiteRow))

// Dose history row schema - decode ISO8601 string to Date
const DoseHistoryRow = Schema.Struct({
  datetime: Schema.DateFromString.check(Schema.isDateValid()),
  drug: MedicationCompound,
  dose_mg: DoseMg,
})
const decodeDoseHistoryRows = Schema.decodeUnknownEffect(Schema.Array(DoseHistoryRow))

// Drug count row schema
const DrugCountRow = Schema.Struct({
  drug: MedicationCompound,
  count: Schema.Number,
})
const decodeDrugCountRows = Schema.decodeUnknownEffect(Schema.Array(DrugCountRow))

// Datetime-only row schema (for timezone-aware day of week calculation)
const DatetimeRow = Schema.Struct({
  datetime: Schema.DateFromString.check(Schema.isDateValid()),
})
const decodeDatetimeRows = Schema.decodeUnknownEffect(Schema.Array(DatetimeRow))

// ============================================
// Stats Service Definition
// ============================================

export class StatsService extends Context.Service<
  StatsService,
  {
    readonly getWeightStats: (
      params: StatsParams,
      userId: string
    ) => Effect.Effect<Option.Option<WeightStats>, StatsDatabaseError>
    readonly getWeightTrend: (
      params: StatsParams,
      userId: string
    ) => Effect.Effect<WeightTrendStats, StatsDatabaseError>
    readonly getInjectionSiteStats: (
      params: StatsParams,
      userId: string
    ) => Effect.Effect<InjectionSiteStats, StatsDatabaseError>
    readonly getDoseHistory: (
      params: StatsParams,
      userId: string
    ) => Effect.Effect<DoseHistoryStats, StatsDatabaseError>
    readonly getInjectionFrequency: (
      params: StatsParams,
      userId: string
    ) => Effect.Effect<Option.Option<InjectionFrequencyStats>, StatsDatabaseError>
    readonly getDrugBreakdown: (
      params: StatsParams,
      userId: string
    ) => Effect.Effect<DrugBreakdownStats, StatsDatabaseError>
    readonly getInjectionByDayOfWeek: (
      params: StatsParams,
      userId: string
    ) => Effect.Effect<InjectionDayOfWeekStats, StatsDatabaseError>
  }
>()('@garage/subq/stats/stats-service/StatsService') {}

// ============================================
// Stats Service Implementation
// ============================================

export const StatsServiceLive = Layer.effect(
  StatsService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const dateRangeClause = (params: StatsParams) => {
      const startDateStr = params.startDate?.toISOString()
      const endDateStr = params.endDate?.toISOString()
      return sql`
        ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
        ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
      `
    }

    const listInjectionDatetimes = Effect.fn('StatsService.listInjectionDatetimes')(function* (
      params: StatsParams,
      userId: string
    ) {
      const rows = yield* sql`
          SELECT datetime
          FROM injection_logs
          WHERE user_id = ${userId}
          ${dateRangeClause(params)}
          ORDER BY datetime ASC
        `
      const decoded = yield* decodeDatetimeRows(rows)
      return Arr.map(decoded, (row) => row.datetime)
    })

    const getWeightStats = Effect.fn('StatsService.getWeightStats')(
      function* (params: StatsParams, userId: string) {
        yield* Effect.annotateCurrentSpan('userId', userId)

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
                ${dateRangeClause(params)}
                ORDER BY datetime ASC
              )
            ) as points_json
          FROM weight_logs
          WHERE user_id = ${userId}
          ${dateRangeClause(params)}
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
      },
      mapDbError(StatsDatabaseError, 'query')
    )

    const getWeightTrend = Effect.fn('StatsService.getWeightTrend')(
      function* (params: StatsParams, userId: string) {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const rows = yield* sql`
          SELECT datetime, weight
          FROM weight_logs
          WHERE user_id = ${userId}
          ${dateRangeClause(params)}
          ORDER BY datetime ASC
        `
        const decoded = yield* decodeWeightTrendRows(rows)
        const points = Arr.map(
          decoded,
          (row) => new WeightTrendPoint({ date: row.datetime, weight: Weight.make(row.weight) })
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
      },
      mapDbError(StatsDatabaseError, 'query')
    )

    const getInjectionSiteStats = Effect.fn('StatsService.getInjectionSiteStats')(
      function* (params: StatsParams, userId: string) {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const rows = yield* sql`
          SELECT
            COALESCE(injection_site, 'Unknown') as injection_site,
            COUNT(*) as count
          FROM injection_logs
          WHERE user_id = ${userId}
          ${dateRangeClause(params)}
          GROUP BY injection_site
          ORDER BY count DESC
        `
        const decodedRows = yield* decodeInjectionSiteRows(rows)
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
      },
      mapDbError(StatsDatabaseError, 'query')
    )

    const getDoseHistory = Effect.fn('StatsService.getDoseHistory')(
      function* (params: StatsParams, userId: string) {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const rows = yield* sql`
          SELECT datetime, drug, dose_mg
          FROM injection_logs
          WHERE user_id = ${userId}
          ${dateRangeClause(params)}
          ORDER BY datetime ASC
        `
        const decoded = yield* decodeDoseHistoryRows(rows)
        const inputs = Arr.map(decoded, (row) => ({
          date: row.datetime,
          drug: row.drug,
          doseMg: row.dose_mg,
        }))
        yield* Effect.annotateCurrentSpan('pointCount', inputs.length)
        return buildDoseHistoryStats(inputs)
      },
      mapDbError(StatsDatabaseError, 'query')
    )

    const getInjectionFrequency = Effect.fn('StatsService.getInjectionFrequency')(
      function* (params: StatsParams, userId: string) {
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
      },
      mapDbError(StatsDatabaseError, 'query')
    )

    const getDrugBreakdown = Effect.fn('StatsService.getDrugBreakdown')(
      function* (params: StatsParams, userId: string) {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const rows = yield* sql`
          SELECT drug, COUNT(*) as count
          FROM injection_logs
          WHERE user_id = ${userId}
          ${dateRangeClause(params)}
          GROUP BY drug
          ORDER BY count DESC
        `
        const decodedRows = yield* decodeDrugCountRows(rows)
        const drugs = Arr.map(
          decodedRows,
          (decoded) => new DrugCount({ drug: decoded.drug, count: Count.make(decoded.count) })
        )
        const total = Arr.reduce(decodedRows, 0, (sum, decoded) => sum + decoded.count)
        yield* Effect.annotateCurrentSpan('totalInjections', total)
        return new DrugBreakdownStats({ drugs, totalInjections: Count.make(total) })
      },
      mapDbError(StatsDatabaseError, 'query')
    )

    const getInjectionByDayOfWeek = Effect.fn('StatsService.getInjectionByDayOfWeek')(
      function* (params: StatsParams, userId: string) {
        yield* Effect.annotateCurrentSpan('userId', userId)
        const timezone = params.timezone ?? 'UTC'
        const datetimes = yield* listInjectionDatetimes(params, userId)
        const result = buildInjectionDayOfWeekStats(datetimes, timezone)

        yield* Effect.annotateCurrentSpan('totalInjections', result.totalInjections)
        yield* Effect.annotateCurrentSpan('timezone', timezone)
        return result
      },
      mapDbError(StatsDatabaseError, 'query')
    )

    return {
      getWeightStats,
      getWeightTrend,
      getInjectionSiteStats,
      getDoseHistory,
      getInjectionFrequency,
      getDrugBreakdown,
      getInjectionByDayOfWeek,
    }
  })
)
