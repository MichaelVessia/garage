import { Effect } from 'effect'

import { AuthContext, DataExportRpcs } from '#shared'
import type { DataExport as DataExportType } from '#shared'

import { DataExportService } from './data-export-service.js'

export const DataExportRpcHandlersLive = DataExportRpcs.toLayer(
  Effect.gen(function* () {
    const service = yield* DataExportService

    const UserDataExport = Effect.fn('rpc.data-export.export')(function* () {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logInfo('UserDataExport called').pipe(
        Effect.annotateLogs({ rpc: 'UserDataExport', userId: user.id })
      )
      const result = yield* service.exportData(user.id)
      yield* Effect.logInfo('UserDataExport completed').pipe(
        Effect.annotateLogs({
          rpc: 'UserDataExport',
          weightLogs: result.data.weightLogs.length,
          injectionLogs: result.data.injectionLogs.length,
          schedules: result.data.schedules.length,
          goals: result.data.goals.length,
        })
      )
      return result
    })

    const UserDataImport = Effect.fn('rpc.data-export.import')(function* (data: DataExportType) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logInfo('UserDataImport called').pipe(
        Effect.annotateLogs({
          rpc: 'UserDataImport',
          userId: user.id,
          weightLogs: data.data.weightLogs.length,
          injectionLogs: data.data.injectionLogs.length,
          schedules: data.data.schedules.length,
          goals: data.data.goals.length,
        })
      )
      const result = yield* service.importData(user.id, data)
      yield* Effect.logInfo('UserDataImport completed').pipe(
        Effect.annotateLogs({
          rpc: 'UserDataImport',
          weightLogs: result.weightLogs,
          injectionLogs: result.injectionLogs,
          schedules: result.schedules,
          goals: result.goals,
          settingsUpdated: result.settingsUpdated,
        })
      )
      return result
    })

    return {
      UserDataExport,
      UserDataImport,
    }
  })
)
