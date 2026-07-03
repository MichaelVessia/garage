import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import { SITE_ROTATION } from '../injection/site-rotation.js'
export interface DrugVocabularyEntry {
  readonly name: string
  readonly suggestedDosages: readonly string[]
}
const DrugVocabularyEntries: readonly DrugVocabularyEntry[] = [
  { name: 'Semaglutide (Ozempic)', suggestedDosages: ['0.25mg', '0.5mg', '1mg', '2mg'] },
  {
    name: 'Semaglutide (Wegovy)',
    suggestedDosages: ['0.25mg', '0.5mg', '1mg', '1.7mg', '2.4mg'],
  },
  {
    name: 'Semaglutide (Compounded)',
    suggestedDosages: ['0.25mg', '0.5mg', '1mg', '1.7mg', '2mg', '2.4mg'],
  },
  {
    name: 'Tirzepatide (Mounjaro)',
    suggestedDosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'],
  },
  {
    name: 'Tirzepatide (Zepbound)',
    suggestedDosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'],
  },
  {
    name: 'Tirzepatide (Compounded)',
    suggestedDosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'],
  },
  {
    name: 'Retatrutide (Compounded)',
    suggestedDosages: ['1mg', '2mg', '4mg', '8mg', '12mg'],
  },
  {
    name: 'Liraglutide (Saxenda)',
    suggestedDosages: ['0.6mg', '1.2mg', '1.8mg', '2.4mg', '3mg'],
  },
  { name: 'Dulaglutide (Trulicity)', suggestedDosages: ['0.75mg', '1.5mg', '3mg', '4.5mg'] },
]
const normalizeDrugName = (drug: string): string => drug.trim().toLowerCase()
const findDrugVocabularyEntry = (drug: string): Option.Option<DrugVocabularyEntry> => {
  const normalizedDrug = normalizeDrugName(drug)
  if (normalizedDrug === '') {
    return Option.none()
  }
  return Arr.findFirst(DrugVocabularyEntries, (entry) => {
    const normalizedEntryName = normalizeDrugName(entry.name)
    return normalizedDrug === normalizedEntryName || normalizedDrug.includes(normalizedEntryName)
  })
}
export const listKnownDrugVariants = (): string[] => DrugVocabularyEntries.map((entry) => entry.name)
export const suggestedDosagesForDrug = (drug: string): string[] => {
  const entry = findDrugVocabularyEntry(drug)
  return Option.match(entry, {
    onNone: () => [],
    onSome: (found) => found.suggestedDosages.map((dosage) => dosage),
  })
}
export const listDefaultInjectionSites = (): string[] => SITE_ROTATION.map((site) => site)
