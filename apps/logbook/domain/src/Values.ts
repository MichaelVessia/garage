import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { LinkId, WarrantyId } from './Asset/Asset.id.ts'

export const Cents = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const IsoDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  Schema.makeFilter(
    (value: string) => Option.exists(DateTime.make(value), (date) => DateTime.formatIsoDateUtc(date) === value),
    { expected: 'a real Gregorian date in YYYY-MM-DD format' }
  )
).pipe(Schema.brand('IsoDate'))
export type IsoDate = typeof IsoDate.Type

export const AssetCategory = Schema.Literals(['vehicle', 'home', 'appliance', 'equipment', 'homelab', 'other'])
export const MeterUnit = Schema.Literals(['miles', 'hours'])
export const MeterReading = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
export const PerformedBy = Schema.Literals(['diy', 'shop'])
export const RetirementReason = Schema.Literals(['retired', 'sold', 'replaced'])

export const Meter = Schema.Struct({ unit: MeterUnit, reading: MeterReading })
export type Meter = typeof Meter.Type

const days = Schema.Int.check(Schema.isGreaterThan(0))
const every = Schema.Finite.check(Schema.isGreaterThan(0))

export const Cadence = Schema.TaggedUnion({
  IntervalDays: { days },
  MeterInterval: { every, unit: MeterUnit },
  Either: { days, every, unit: MeterUnit },
  Seasonal: {
    month: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
    day: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 31 })),
  },
})
export type Cadence = typeof Cadence.Type

export const DueThresholds = Schema.Struct({
  nextDueOn: Schema.optionalKey(IsoDate),
  nextDueMeter: Schema.optionalKey(MeterReading),
})
export type DueThresholds = typeof DueThresholds.Type

export const NamedLink = Schema.Struct({ id: LinkId, label: Schema.String, url: Schema.String })
export const SpecEntry = Schema.Struct({
  key: Schema.String,
  value: Schema.String,
  url: Schema.optionalKey(Schema.String),
})
export const Warranty = Schema.Struct({
  id: WarrantyId,
  label: Schema.String,
  expiresOn: IsoDate,
  coverage: Schema.optionalKey(Schema.String),
  notes: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
})
