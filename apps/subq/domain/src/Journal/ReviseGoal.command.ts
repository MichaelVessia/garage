import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { GoalNotFound } from './GoalNotFound.rejection.ts'
import { JournalId, GoalId } from './Journal.id.ts'
import { GoalRevision, Goal } from './JournalRecords.ts'
import { NoWeightData } from './NoWeightData.rejection.ts'
import { TimezoneNotConfigured } from './TimezoneNotConfigured.rejection.ts'

export class GoalRevised extends Domain.Event('GoalRevised', { goal: Goal }) {}

export class ReviseGoal extends Domain.Command(
  'ReviseGoal',
  {
    target: JournalId,
    middleware: [Session],
    input: { goalId: GoalId, ...GoalRevision.fields },
    events: [GoalRevised],
    rejects: [GoalNotFound, TimezoneNotConfigured, NoWeightData],
  },
  { description: 'Revise the details of a weight goal.' }
) {}
