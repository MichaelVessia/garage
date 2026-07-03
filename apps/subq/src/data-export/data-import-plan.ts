import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as HashSet from 'effect/HashSet'

import type { DataExport } from '#shared'
import { DataImportError, DataImportResult } from '#shared'

export interface DataImportPlan {
  readonly snapshot: DataExport
  readonly result: DataImportResult
}

const invalidImport = (message: string) => Effect.fail(DataImportError.make({ message }))

export const planDataImport = Effect.fn('DataImportPlan.planDataImport')(function* (snapshot: DataExport) {
  const scheduleIds = HashSet.fromIterable(Arr.map(snapshot.data.schedules, (schedule) => schedule.id))

  yield* Effect.forEach(
    snapshot.data.schedules,
    (schedule) =>
      Effect.forEach(
        schedule.phases,
        (phase) =>
          phase.scheduleId !== schedule.id
            ? invalidImport(`Phase ${phase.id} references schedule ${phase.scheduleId}, expected ${schedule.id}`)
            : Effect.void,
        { concurrency: 1 }
      ),
    { concurrency: 1 }
  )

  yield* Effect.forEach(
    snapshot.data.injectionLogs,
    (log) =>
      log.scheduleId !== null && !HashSet.has(scheduleIds, log.scheduleId)
        ? invalidImport(`Injection log ${log.id} references missing schedule ${log.scheduleId}`)
        : Effect.void,
    { concurrency: 1 }
  )

  return {
    snapshot,
    result: new DataImportResult({
      weightLogs: snapshot.data.weightLogs.length,
      injectionLogs: snapshot.data.injectionLogs.length,
      schedules: snapshot.data.schedules.length,
      goals: snapshot.data.goals.length,
      settingsUpdated: snapshot.data.settings !== null,
    }),
  }
})
