import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { GoalNotFound } from './GoalNotFound.rejection.ts'
import { JournalId, GoalId } from './Journal.id.ts'

export class GoalRemoved extends Domain.Event('GoalRemoved', { goalId: GoalId }) {}

export class RemoveGoal extends Domain.Command(
  'RemoveGoal',
  {
    target: JournalId,
    middleware: [Session],
    input: { goalId: GoalId },
    events: [GoalRemoved],
    rejects: [GoalNotFound],
  },
  { description: 'Remove a weight goal.' }
) {}
