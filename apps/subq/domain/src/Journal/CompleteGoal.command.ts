import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { GoalAlreadyCompleted } from './GoalAlreadyCompleted.rejection.ts'
import { GoalNotFound } from './GoalNotFound.rejection.ts'
import { JournalId, GoalId } from './Journal.id.ts'
import { Goal } from './JournalRecords.ts'

export class GoalCompleted extends Domain.Event('GoalCompleted', { goal: Goal }) {}

export class CompleteGoal extends Domain.Command(
  'CompleteGoal',
  {
    target: JournalId,
    middleware: [Session],
    input: { goalId: GoalId },
    events: [GoalCompleted],
    rejects: [GoalNotFound, GoalAlreadyCompleted],
  },
  { description: 'Record the completion time and deactivate the weight goal.' }
) {}
