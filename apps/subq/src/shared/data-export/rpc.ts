import * as Rpc from 'effect/rpc/Rpc'
import * as RpcGroup from 'effect/rpc/RpcGroup'
import * as Schema from 'effect/Schema'

import { AuthRpcMiddleware } from '../auth-middleware.js'
import { DataExport, DataExportError, DataImportError, DataImportResult } from './domain.js'
import { DataExportTemporalMigrationRequired } from './errors.js'

// ============================================
// Data Export/Import RPCs
// ============================================

export const DataExportRpcs = RpcGroup.make(
  /**
   * Export all user data as a portable JSON structure.
   */
  Rpc.make('UserDataExport', {
    success: DataExport,
    error: Schema.Union([DataExportError, DataExportTemporalMigrationRequired]),
  }),

  /**
   * Import user data, replacing all existing data.
   * WARNING: This will delete all existing user data before importing.
   */
  Rpc.make('UserDataImport', {
    payload: DataExport,
    success: DataImportResult,
    error: DataImportError,
  })
).middleware(AuthRpcMiddleware)
