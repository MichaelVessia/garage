// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Story from 'foldkit/story'

import { DataExport, DataImportResult, IanaTimezone } from '#shared'

import {
  CancelledImportData,
  CancelledSelectImportFile,
  ChangedSettingsConfirmPassword,
  ChangedSettingsCurrentPassword,
  ChangedSettingsNewPassword,
  ChangedSettingsTimezone,
  ClickedExportData,
  ClickedSelectImportFile,
  ClickedSettingsWeightUnit,
  ConfirmedImportData,
  FailedExportData,
  FailedImportData,
  FailedUpdateSettingsPreference,
  PreparedImportData,
  SelectedImportFile,
  SubmittedSettingsPassword,
  SubmittedSettingsTimezone,
  SucceededExportData,
  SucceededImportData,
  SucceededUpdateSettingsPreference,
  initialSettingsModel,
  settingsPasswordFailed,
  settingsPasswordSucceeded,
  updateSettingsPage,
} from '../src/page/settings.js'
import type { SettingsModel, SettingsPageMessage } from '../src/page/settings.js'

const { Command } = Story
const timezone = IanaTimezone.make('America/New_York')

const sampleExport = new DataExport({
  data: {
    goals: [],
    injectionLogs: [],
    schedules: [],
    settings: null,
    weightLogs: [],
  },
  exportedAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
  version: '3.0.0-alpha.2',
})

const sampleImportResult = new DataImportResult({
  goals: 1,
  injectionLogs: 2,
  schedules: 1,
  settingsUpdated: true,
  weightLogs: 3,
})

const update = (model: SettingsModel, message: SettingsPageMessage) =>
  updateSettingsPage(model, message, timezone, timezone, 1)

describe('settings page update', () => {
  it('selecting a weight unit dispatches the update command and marks submitting', () => {
    const [next, commands] = update(initialSettingsModel, ClickedSettingsWeightUnit({ unit: 'kg' }))
    expect(next.preferenceSubmitting).toBe(true)
    expect(next.preferenceError).toBeNull()
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('UpdateSettingsWeightUnit')
    expect(commands[0]?.args).toEqual({ unit: 'kg' })
  })

  it('submitting a validated IANA timezone dispatches the preference update', () => {
    const [edited] = update(initialSettingsModel, ChangedSettingsTimezone({ value: 'Pacific/Auckland' }))
    const [submitting, commands] = update(edited, SubmittedSettingsTimezone())

    expect(submitting.preferenceSubmitting).toBe(true)
    expect(submitting.preferenceError).toBeNull()
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('UpdateSettingsTimezone')
    expect(commands[0]?.args).toEqual({ timezone: 'Pacific/Auckland' })
  })

  it('rejects an invalid timezone before dispatching an update', () => {
    const [edited] = update(initialSettingsModel, ChangedSettingsTimezone({ value: 'Not/A_Zone' }))
    const [invalid, commands] = update(edited, SubmittedSettingsTimezone())

    expect(invalid.preferenceError).toBe('Enter a valid IANA timezone')
    expect(commands).toHaveLength(0)
  })

  it('a successful preference update clears submitting and refetches settings', () => {
    const submitting: SettingsModel = { ...initialSettingsModel, preferenceSubmitting: true }
    const [next, commands] = update(submitting, SucceededUpdateSettingsPreference())
    expect(next.preferenceSubmitting).toBe(false)
    expect(next.preferenceError).toBeNull()
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('FetchSettings')
    expect(commands[0]?.args).toEqual({ detectedTimezone: timezone, requestGeneration: 1 })
  })

  it('a failed preference update surfaces the error and stops submitting', () => {
    const submitting: SettingsModel = { ...initialSettingsModel, preferenceSubmitting: true }
    const [next, commands] = update(
      submitting,
      FailedUpdateSettingsPreference({ message: 'Failed to update display preferences' })
    )
    expect(next.preferenceSubmitting).toBe(false)
    expect(next.preferenceError).toBe('Failed to update display preferences')
    expect(commands).toHaveLength(0)
  })

  it('submitting without a current password surfaces a validation error', () => {
    Story.story(
      update,
      Story.with(initialSettingsModel),
      Story.message(SubmittedSettingsPassword()),
      Command.expectNone(),
      Story.model((model: SettingsModel) => {
        expect(model.password.error).toBe('Current password is required')
      })
    )
  })

  it('submitting a new password shorter than 8 characters surfaces a validation error', () => {
    const withCurrent: SettingsModel = {
      ...initialSettingsModel,
      password: { ...initialSettingsModel.password, currentPassword: 'oldpassword', newPassword: 'short' },
    }
    Story.story(
      update,
      Story.with(withCurrent),
      Story.message(SubmittedSettingsPassword()),
      Command.expectNone(),
      Story.model((model: SettingsModel) => {
        expect(model.password.error).toBe('Password must be at least 8 characters')
      })
    )
  })

  it('submitting mismatched passwords surfaces a validation error', () => {
    const mismatched: SettingsModel = {
      ...initialSettingsModel,
      password: {
        ...initialSettingsModel.password,
        confirmPassword: 'different1',
        currentPassword: 'oldpassword',
        newPassword: 'newpassword',
      },
    }
    Story.story(
      update,
      Story.with(mismatched),
      Story.message(SubmittedSettingsPassword()),
      Command.expectNone(),
      Story.model((model: SettingsModel) => {
        expect(model.password.error).toBe('Passwords do not match')
      })
    )
  })

  it('a valid submission dispatches ChangePassword and marks the form submitting', () => {
    const valid: SettingsModel = {
      ...initialSettingsModel,
      password: {
        ...initialSettingsModel.password,
        confirmPassword: 'newpassword',
        currentPassword: 'oldpassword',
        newPassword: 'newpassword',
      },
    }
    const [next, commands] = update(valid, SubmittedSettingsPassword())
    expect(next.password.submitting).toBe(true)
    expect(next.password.error).toBeNull()
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('ChangePassword')
    expect(commands[0]?.args).toEqual({ currentPassword: 'oldpassword', newPassword: 'newpassword' })
  })

  it('editing any password field clears a previous success flag', () => {
    const succeeded: SettingsModel = {
      ...initialSettingsModel,
      password: { ...initialSettingsModel.password, success: true },
    }
    Story.story(
      update,
      Story.with(succeeded),
      Story.message(ChangedSettingsCurrentPassword({ value: 'abc' })),
      Command.expectNone(),
      Story.model((model: SettingsModel) => {
        expect(model.password.currentPassword).toBe('abc')
        expect(model.password.success).toBe(false)
      }),
      Story.message(ChangedSettingsNewPassword({ value: 'def' })),
      Story.model((model: SettingsModel) => {
        expect(model.password.newPassword).toBe('def')
      }),
      Story.message(ChangedSettingsConfirmPassword({ value: 'ghi' })),
      Story.model((model: SettingsModel) => {
        expect(model.password.confirmPassword).toBe('ghi')
      })
    )
  })

  it('settingsPasswordSucceeded resets the form and marks success (applied by the parent update)', () => {
    const submitting: SettingsModel = {
      ...initialSettingsModel,
      password: {
        confirmPassword: 'newpassword',
        currentPassword: 'oldpassword',
        error: null,
        newPassword: 'newpassword',
        submitting: true,
        success: false,
      },
    }
    const next = settingsPasswordSucceeded(submitting)
    expect(next.password).toEqual({
      confirmPassword: '',
      currentPassword: '',
      error: null,
      newPassword: '',
      submitting: false,
      success: true,
    })
  })

  it('settingsPasswordFailed surfaces the error and stops submitting (applied by the parent update)', () => {
    const submitting: SettingsModel = {
      ...initialSettingsModel,
      password: {
        confirmPassword: 'newpassword',
        currentPassword: 'oldpassword',
        error: null,
        newPassword: 'newpassword',
        submitting: true,
        success: false,
      },
    }
    const next = settingsPasswordFailed(submitting, 'Password change failed')
    expect(next.password.error).toBe('Password change failed')
    expect(next.password.submitting).toBe(false)
    expect(next.password.success).toBe(false)
    expect(next.password.currentPassword).toBe('oldpassword')
  })

  it('exporting data dispatches ExportData, clears prior status, and succeeds', () => {
    const withStatus: SettingsModel = { ...initialSettingsModel, dataError: 'old error', dataSuccess: 'old success' }
    Story.story(
      update,
      Story.with(withStatus),
      Story.message(ClickedExportData()),
      Story.model((model: SettingsModel) => {
        expect(model.exportStatus).toBe('exporting')
        expect(model.dataError).toBeNull()
        expect(model.dataSuccess).toBeNull()
      }),
      Command.resolveAll([{ name: 'ExportData' }, SucceededExportData()]),
      Story.model((model: SettingsModel) => {
        expect(model.exportStatus).toBe('idle')
        expect(model.dataSuccess).toBe('Data exported successfully')
      })
    )
  })

  it('a failed export surfaces the error and stops exporting', () => {
    Story.story(
      update,
      Story.with(initialSettingsModel),
      Story.message(ClickedExportData()),
      Command.resolveAll([
        { name: 'ExportData' },
        FailedExportData({ message: 'Failed to export data. Please try again.' }),
      ]),
      Story.model((model: SettingsModel) => {
        expect(model.exportStatus).toBe('idle')
        expect(model.dataError).toBe('Failed to export data. Please try again.')
      })
    )
  })

  it('cancelling the file picker returns to idle without an error', () => {
    Story.story(
      update,
      Story.with(initialSettingsModel),
      Story.message(ClickedSelectImportFile()),
      Story.model((model: SettingsModel) => {
        expect(model.importStatus).toBe('reading')
      }),
      Command.resolveAll([{ name: 'SelectImportFile' }, CancelledSelectImportFile()]),
      Story.model((model: SettingsModel) => {
        expect(model.importStatus).toBe('idle')
        expect(model.dataError).toBeNull()
      })
    )
  })

  it('selecting a file reads it and prepares the import for confirmation', () => {
    const file = new File([], 'export.json', { type: 'application/json' })
    Story.story(
      update,
      Story.with(initialSettingsModel),
      Story.message(ClickedSelectImportFile()),
      Command.resolveAll(
        [{ name: 'SelectImportFile' }, SelectedImportFile({ file })],
        [{ name: 'ReadImportFile' }, PreparedImportData({ data: sampleExport })]
      ),
      Story.model((model: SettingsModel) => {
        expect(model.importConfirm).toEqual(sampleExport)
        expect(model.importStatus).toBe('idle')
      })
    )
  })

  it('an invalid export file surfaces a read error', () => {
    const file = new File([], 'export.json', { type: 'application/json' })
    Story.story(
      update,
      Story.with(initialSettingsModel),
      Story.message(ClickedSelectImportFile()),
      Command.resolveAll(
        [{ name: 'SelectImportFile' }, SelectedImportFile({ file })],
        [
          { name: 'ReadImportFile' },
          FailedImportData({ message: 'Invalid export file. Only Subq 3.0.0-alpha.2 exports are supported.' }),
        ]
      ),
      Story.model((model: SettingsModel) => {
        expect(model.dataError).toBe('Invalid export file. Only Subq 3.0.0-alpha.2 exports are supported.')
        expect(model.importConfirm).toBeNull()
        expect(model.importStatus).toBe('idle')
      })
    )
  })

  it('cancelling a pending import confirmation clears it', () => {
    const withConfirm: SettingsModel = { ...initialSettingsModel, importConfirm: sampleExport }
    Story.story(
      update,
      Story.with(withConfirm),
      Story.message(CancelledImportData()),
      Command.expectNone(),
      Story.model((model: SettingsModel) => {
        expect(model.importConfirm).toBeNull()
        expect(model.importStatus).toBe('idle')
      })
    )
  })

  it('confirming an import dispatches ImportData with the pending export', () => {
    const withConfirm: SettingsModel = { ...initialSettingsModel, importConfirm: sampleExport }
    const [next, commands] = update(withConfirm, ConfirmedImportData())
    expect(next.importStatus).toBe('importing')
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('ImportData')
    expect(commands[0]?.args).toEqual({ data: sampleExport })
  })

  it('confirming an import with nothing pending is a no-op', () => {
    const [next, commands] = update(initialSettingsModel, ConfirmedImportData())
    expect(next).toBe(initialSettingsModel)
    expect(commands).toHaveLength(0)
  })

  it('a successful import surfaces the summary, clears the confirmation, and refetches settings', () => {
    const importing: SettingsModel = { ...initialSettingsModel, importConfirm: sampleExport, importStatus: 'importing' }
    const [next, commands] = update(importing, SucceededImportData({ result: sampleImportResult }))
    expect(next.dataSuccess).toBe('Successfully imported: 3 weight logs, 2 injection logs, 1 schedules, 1 goals')
    expect(next.importConfirm).toBeNull()
    expect(next.importStatus).toBe('idle')
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('FetchSettings')
    expect(commands[0]?.args).toEqual({ detectedTimezone: timezone, requestGeneration: 1 })
  })

  it('a failed import surfaces the error and clears the pending confirmation', () => {
    const importing: SettingsModel = { ...initialSettingsModel, importConfirm: sampleExport, importStatus: 'importing' }
    Story.story(
      update,
      Story.with(importing),
      Story.message(FailedImportData({ message: 'Failed to import data. Please try again.' })),
      Command.expectNone(),
      Story.model((model: SettingsModel) => {
        expect(model.dataError).toBe('Failed to import data. Please try again.')
        expect(model.importConfirm).toBeNull()
        expect(model.importStatus).toBe('idle')
      })
    )
  })
})
