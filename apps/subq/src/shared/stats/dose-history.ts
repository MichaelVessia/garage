import type { DoseMg, MedicationCompound } from '../common/domain.js'
import { DoseHistoryPoint, DoseHistoryStats } from './domain.js'

/** Parsed values used to build numeric medication dose history. */
export interface DoseHistoryInput {
  readonly date: Date
  readonly drug: MedicationCompound
  readonly doseMg: DoseMg
}

/** Build dose-history statistics without reparsing persisted values. */
export const buildDoseHistoryStats = (inputs: ReadonlyArray<DoseHistoryInput>): DoseHistoryStats =>
  new DoseHistoryStats({
    points: inputs.map(
      (input) =>
        new DoseHistoryPoint({
          date: input.date,
          drug: input.drug,
          doseMg: input.doseMg,
        })
    ),
  })
