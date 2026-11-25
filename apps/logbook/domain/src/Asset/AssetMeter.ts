import * as Option from 'effect/Option'

import type { Meter, MeterUnit } from '../Values.ts'

export const registeredMeter = (asset: {
  readonly meterUnit?: typeof MeterUnit.Type
  readonly initialMeter?: number
}): { readonly meter?: Meter } =>
  asset.meterUnit === undefined ? {} : { meter: { unit: asset.meterUnit, reading: asset.initialMeter ?? 0 } }

export const updateMeter = <A extends { readonly meter?: Meter }>(input: {
  readonly asset: A
  readonly reading: Option.Option<number>
}): A => {
  const { asset, reading } = input
  return Option.isNone(reading) || asset.meter === undefined
    ? asset
    : { ...asset, meter: { ...asset.meter, reading: reading.value } }
}
