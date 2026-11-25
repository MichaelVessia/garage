import * as DomainAi from '@alchemy.run/domain/Ai'
import { SubqApi } from '@garage/subq-domain/SubqApi.api'
import * as McpProtocol from 'effect/ai/McpProtocol'
import * as McpServer from 'effect/ai/McpServer'
import * as Layer from 'effect/Layer'

export const SubqMcp = DomainAi.toMcp(SubqApi, {
  expose: [
    'UpdatePreferences',
    'RecordWeight',
    'CorrectWeight',
    'RemoveWeight',
    'LogInjection',
    'CorrectInjection',
    'RemoveInjection',
    'AssignInjectionsToSchedule',
    'CreateSchedule',
    'ReviseSchedule',
    'ActivateSchedule',
    'DeactivateSchedule',
    'RemoveSchedule',
    'SetGoal',
    'ReviseGoal',
    'CompleteGoal',
    'RemoveGoal',
    'JournalProfile.get',
    'WeightHistory.get',
    'InjectionHistory.get',
  ],
}).pipe(
  Layer.provide(
    McpServer.layerHttpRequestScoped({
      name: 'Subq',
      version: '1.0.0',
      path: '/mcp',
      protocols: [McpProtocol.v2026_07_28],
    })
  )
)
