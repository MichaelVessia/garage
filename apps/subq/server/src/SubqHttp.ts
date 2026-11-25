import * as DomainHttp from '@alchemy.run/domain/Http'
import { SubqApi } from '@garage/subq-domain/SubqApi.api'
import { Platform } from 'alchemy/Http'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as Layer from 'effect/Layer'

const SubqHttpSpec = DomainHttp.toHttpApi(SubqApi, {
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
    'ImportJournal',
    'JournalProfile.get',
    'WeightHistory.get',
    'InjectionHistory.get',
  ],
})

const appApi = HttpApi.make('SubqHttp').add(SubqHttpSpec.group.prefix('/v1'))

export const SubqHttp = HttpApiBuilder.layer(appApi, { openapiPath: '/v1/openapi.json' }).pipe(
  Layer.provide(Layer.mergeAll(SubqHttpSpec.layerFor(appApi), Platform))
)
