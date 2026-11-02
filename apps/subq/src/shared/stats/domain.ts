import * as Schema from 'effect/Schema'

import { CalendarDate } from '../calendar/domain.js'
import { Count, DayOfWeek, DaysBetween, DbOperation, DoseMg, MedicationCompound } from '../common/domain.js'
import { InjectionSite, InjectionsPerWeek } from '../injection/domain.js'
import { Weight, WeightRateOfChange } from '../weight/domain.js'

// ============================================
// Stats Request Params (shared across stats endpoints)
// ============================================

export class StatsParams extends Schema.Class<StatsParams, { readonly brand: unique symbol }>('StatsParams')({
  startDate: Schema.optional(CalendarDate),
  endDate: Schema.optional(CalendarDate),
}) {}

// ============================================
// Weight Stats Response
// ============================================

export class WeightStats extends Schema.Class<WeightStats, { readonly brand: unique symbol }>('WeightStats')({
  /** Minimum weight in period */
  minWeight: Weight,
  /** Maximum weight in period */
  maxWeight: Weight,
  /** Average weight in period */
  avgWeight: Weight,
  /** Rate of change in lbs per week (negative = losing weight) */
  rateOfChange: WeightRateOfChange,
  /** Total number of weight entries */
  entryCount: Count,
}) {}

// ============================================
// Weight Trend Data Point (for line chart)
// ============================================

export class WeightTrendPoint extends Schema.Class<WeightTrendPoint, { readonly brand: unique symbol }>(
  'WeightTrendPoint'
)({
  date: Schema.Date,
  weight: Weight,
}) {}

/** Linear regression trend line data */
export class TrendLine extends Schema.Class<TrendLine, { readonly brand: unique symbol }>('TrendLine')({
  /** Slope in lbs per millisecond */
  slope: Schema.Finite,
  /** Y-intercept (weight at epoch) */
  intercept: Schema.Finite,
  /** Start point for rendering */
  startDate: Schema.Date,
  startWeight: Weight,
  /** End point for rendering */
  endDate: Schema.Date,
  endWeight: Weight,
}) {}

export class WeightTrendStats extends Schema.Class<WeightTrendStats, { readonly brand: unique symbol }>(
  'WeightTrendStats'
)({
  points: Schema.Array(WeightTrendPoint),
  /** Linear regression trend line, null if < 2 points */
  trendLine: Schema.NullOr(TrendLine),
}) {}

// ============================================
// Injection Site Distribution (for pie chart)
// ============================================

export class InjectionSiteCount extends Schema.Class<InjectionSiteCount, { readonly brand: unique symbol }>(
  'InjectionSiteCount'
)({
  site: InjectionSite,
  count: Count,
}) {}

export class InjectionSiteStats extends Schema.Class<InjectionSiteStats, { readonly brand: unique symbol }>(
  'InjectionSiteStats'
)({
  sites: Schema.Array(InjectionSiteCount),
  totalInjections: Count,
}) {}

// ============================================
// Dose History (for line/step chart)
// ============================================

export class DoseHistoryPoint extends Schema.Class<DoseHistoryPoint, { readonly brand: unique symbol }>(
  'DoseHistoryPoint'
)({
  date: Schema.Date,
  drug: MedicationCompound,
  doseMg: DoseMg,
}) {}

export class DoseHistoryStats extends Schema.Class<DoseHistoryStats, { readonly brand: unique symbol }>(
  'DoseHistoryStats'
)({
  points: Schema.Array(DoseHistoryPoint),
}) {}

// ============================================
// Injection Frequency Stats
// ============================================

export class InjectionFrequencyStats extends Schema.Class<InjectionFrequencyStats, { readonly brand: unique symbol }>(
  'InjectionFrequencyStats'
)({
  /** Total injections in period */
  totalInjections: Count,
  /** Average days between injections */
  avgDaysBetween: DaysBetween,
  /** Most frequent day of week (0=Sun, 6=Sat) */
  mostFrequentDayOfWeek: Schema.NullOr(DayOfWeek),
  /** Injections per week average */
  injectionsPerWeek: InjectionsPerWeek,
}) {}

// ============================================
// Drug Breakdown (for pie chart)
// ============================================

export class DrugCount extends Schema.Class<DrugCount, { readonly brand: unique symbol }>('DrugCount')({
  drug: MedicationCompound,
  count: Count,
}) {}

export class DrugBreakdownStats extends Schema.Class<DrugBreakdownStats, { readonly brand: unique symbol }>(
  'DrugBreakdownStats'
)({
  drugs: Schema.Array(DrugCount),
  totalInjections: Count,
}) {}

// ============================================
// Injection By Day of Week (for pie chart)
// ============================================

export class DayOfWeekCount extends Schema.Class<DayOfWeekCount, { readonly brand: unique symbol }>('DayOfWeekCount')({
  /** 0=Sunday, 1=Monday, ..., 6=Saturday */
  dayOfWeek: DayOfWeek,
  count: Count,
}) {}

export class InjectionDayOfWeekStats extends Schema.Class<InjectionDayOfWeekStats, { readonly brand: unique symbol }>(
  'InjectionDayOfWeekStats'
)({
  days: Schema.Array(DayOfWeekCount),
  totalInjections: Count,
}) {}

// ============================================
// Stats Domain Errors
// ============================================

export class StatsDatabaseError extends Schema.TaggedClass<StatsDatabaseError, { readonly brand: unique symbol }>()(
  'StatsDatabaseError',
  {
    operation: DbOperation,
    cause: Schema.Defect(),
  }
) {}
