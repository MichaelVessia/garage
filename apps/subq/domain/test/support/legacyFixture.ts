import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'

const start = DateTime.makeUnsafe('2022-01-01T04:00:00Z')
export const fixtureNow = DateTime.makeUnsafe('2024-10-01T12:00:00Z')
export const fixtureTimezone = 'America/New_York'
const audit = { createdAt: DateTime.formatIso(start), updatedAt: DateTime.formatIso(start) }
const compounds = ['Semaglutide', 'Tirzepatide', 'Dulaglutide'] as const
const sites = ['Left abdomen', 'Right thigh', 'Unknown', null] as const

const atDay = (days: number) => DateTime.formatIso(DateTime.add(start, { days }))
const weightLogs = Arr.makeBy(1000, (index) => ({
  ...audit,
  id: `weight-${index}`,
  datetime: atDay(index),
  weight: 250 - index / 16,
  notes: null,
}))
const injectionLogs = Arr.makeBy(200, (index) => ({
  ...audit,
  id: `injection-${index}`,
  datetime: atDay(index * 5),
  drug: compounds[index % 3] ?? 'Semaglutide',
  doseMg: index % 2 === 0 ? 0.5 : 1,
  injectionSite: sites[index % 4] ?? null,
  notes: null,
  supplier: index % 5 === 0 ? 'fixture supplier' : null,
  scheduleId: index % 7 === 0 || index === 198 ? null : `schedule-${index % 3}`,
}))
const schedules = Arr.map(compounds, (drug, index) => {
  const id = `schedule-${index}`
  return {
    ...audit,
    id,
    name: `Schedule ${index}`,
    drug,
    supplier: null,
    frequency: 'weekly',
    startDate: '2022-01-01',
    isActive: index === 0,
    notes: null,
    phases: [
      { ...audit, id: `phase-${index}-1`, scheduleId: id, order: 1, durationDays: 28, doseMg: 0.5 },
      { ...audit, id: `phase-${index}-2`, scheduleId: id, order: 2, durationDays: null, doseMg: 1 },
    ],
  }
})
const goals = Arr.makeBy(2, (index) => ({
  ...audit,
  id: `goal-${index}`,
  goalWeight: 175 + index,
  startingWeight: 250,
  startingDate: '2022-01-01',
  targetDate: '2025-01-01',
  notes: null,
  isActive: index === 0,
  completedAt: index === 0 ? null : '2024-07-01T12:00:00.000Z',
}))

export const legacyFixture = {
  version: '3.0.0-alpha.2',
  exportedAt: DateTime.formatIso(fixtureNow),
  data: {
    settings: { weightUnit: 'lbs', timezone: fixtureTimezone },
    weightLogs,
    injectionLogs,
    schedules,
    goals,
  },
}
