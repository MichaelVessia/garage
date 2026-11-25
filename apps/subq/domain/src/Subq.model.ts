import * as Domain from '@alchemy.run/domain'
import * as Layer from 'effect/Layer'

import { InjectionHistory, InjectionHistoryLive } from './Journal/InjectionHistory.view.ts'
import { Journal } from './Journal/Journal.aggregate.ts'
import { JournalProfile, JournalProfileLive } from './Journal/JournalProfile.view.ts'
import { WeightHistory, WeightHistoryLive } from './Journal/WeightHistory.view.ts'

export class Subq extends Domain.Model('Subq', {
  aggregates: [Journal],
  views: [JournalProfile, WeightHistory, InjectionHistory],
}) {}

export const SubqHandlers = Layer.mergeAll(JournalProfileLive, WeightHistoryLive, InjectionHistoryLive)
