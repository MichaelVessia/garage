import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { GoalAlreadyExists } from './GoalAlreadyExists.rejection.ts'
import { JournalId, GoalId } from './Journal.id.ts'
import { NewGoal, Goal } from './JournalRecords.ts'
import { NoWeightData } from './NoWeightData.rejection.ts'
import { TimezoneNotConfigured } from './TimezoneNotConfigured.rejection.ts'

export class GoalSet extends Domain.Event('GoalSet', { goal: Goal, deactivated: Schema.NullOr(Goal) }) {}

export class SetGoal extends Domain.Command(
  'SetGoal',
  {
    target: JournalId,
    middleware: [Session],
    input: { goalId: GoalId, ...NewGoal.fields },
    events: [GoalSet],
    rejects: [GoalAlreadyExists, TimezoneNotConfigured, NoWeightData],
  },
  { description: 'Set an active weight goal using a starting weight from the journal.' }
) {}
