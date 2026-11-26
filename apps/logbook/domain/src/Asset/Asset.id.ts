import * as Schema from 'effect/Schema'

export const AssetId = Schema.NonEmptyString.pipe(Schema.brand('AssetId'))
export type AssetId = typeof AssetId.Type

export const ScheduleId = Schema.NonEmptyString.pipe(Schema.brand('ScheduleId'))
export type ScheduleId = typeof ScheduleId.Type

export const PendingWorkId = Schema.NonEmptyString.pipe(Schema.brand('PendingWorkId'))
export type PendingWorkId = typeof PendingWorkId.Type

export const WarrantyId = Schema.NonEmptyString.pipe(Schema.brand('WarrantyId'))
export type WarrantyId = typeof WarrantyId.Type

export const LinkId = Schema.NonEmptyString.pipe(Schema.brand('LinkId'))
export type LinkId = typeof LinkId.Type
