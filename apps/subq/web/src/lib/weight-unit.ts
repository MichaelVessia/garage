import { kgToLbs, lbsToKg } from '@garage/subq-domain/Values'
import type { WeightUnit } from '@garage/subq-domain/Values'
import * as Function from 'effect/Function'

export const displayWeight: {
  (lbs: number): (unit: WeightUnit) => number
  (unit: WeightUnit, lbs: number): number
} = Function.dual(2, (unit: WeightUnit, lbs: number): number => (unit === 'kg' ? lbsToKg(lbs) : lbs))

export const toStorageLbs: {
  (value: number): (unit: WeightUnit) => number
  (unit: WeightUnit, value: number): number
} = Function.dual(2, (unit: WeightUnit, value: number): number => (unit === 'kg' ? kgToLbs(value) : value))

export const formatWeight: {
  (lbs: number): (unit: WeightUnit) => string
  (unit: WeightUnit, lbs: number): string
} = Function.dual(2, (unit: WeightUnit, lbs: number): string => `${displayWeight(unit, lbs).toFixed(1)} ${unit}`)

export const weightInputValue = ({ unit, lbs }: { unit: WeightUnit; lbs: number }): string =>
  String(Number(displayWeight(unit, lbs).toFixed(3)))
