import * as Schema from 'effect/Schema'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'

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
