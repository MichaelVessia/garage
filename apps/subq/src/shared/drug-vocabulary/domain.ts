import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import { DoseMg } from '../common/domain.js'
import type { MedicationCompound } from '../common/domain.js'
import { SITE_ROTATION } from '../injection/site-rotation.js'

/** Suggested dose values for one supported medication compound. */
export interface MedicationVocabularyEntry {
  readonly compound: MedicationCompound
  readonly suggestedDoseMg: ReadonlyArray<DoseMg>
}

const MedicationVocabularyEntries: ReadonlyArray<MedicationVocabularyEntry> = [
  {
    compound: 'Semaglutide',
    suggestedDoseMg: Arr.map([0.25, 0.5, 1, 1.7, 2, 2.4], (dose) => DoseMg.make(dose)),
  },
  {
    compound: 'Tirzepatide',
    suggestedDoseMg: Arr.map([2.5, 5, 7.5, 10, 12.5, 15], (dose) => DoseMg.make(dose)),
  },
  {
    compound: 'Retatrutide',
    suggestedDoseMg: Arr.map([1, 2, 4, 8, 12], (dose) => DoseMg.make(dose)),
  },
  {
    compound: 'Liraglutide',
    suggestedDoseMg: Arr.map([0.6, 1.2, 1.8, 2.4, 3], (dose) => DoseMg.make(dose)),
  },
  {
    compound: 'Dulaglutide',
    suggestedDoseMg: Arr.map([0.75, 1.5, 3, 4.5], (dose) => DoseMg.make(dose)),
  },
]

/** List every compound accepted by the live medication model. */
export const listMedicationCompounds = (): ReadonlyArray<MedicationCompound> =>
  Arr.map(MedicationVocabularyEntries, (entry) => entry.compound)

/** Return the numeric milligram suggestions for a supported compound. */
export const suggestedDoseMgForCompound = (compound: MedicationCompound): ReadonlyArray<DoseMg> => {
  const entry = Arr.findFirst(MedicationVocabularyEntries, (candidate) => candidate.compound === compound)

  return Option.match(entry, {
    onNone: () => [],
    onSome: (found) => found.suggestedDoseMg,
  })
}

/** List the default injection-site rotation values. */
export const listDefaultInjectionSites = (): ReadonlyArray<string> => Arr.map(SITE_ROTATION, (site) => site)
