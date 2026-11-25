import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { JournalId } from './Journal.id.ts'
import { Preferences } from './JournalRecords.ts'

export class PreferencesUpdated extends Domain.Event('PreferencesUpdated', { preferences: Preferences }) {}

export class UpdatePreferences extends Domain.Command(
  'UpdatePreferences',
  {
    target: JournalId,
    middleware: [Session],
    input: { ...Preferences.fields },
    events: [PreferencesUpdated],
    rejects: [],
  },
  { description: 'Update the journal weight unit or time zone.' }
) {}
