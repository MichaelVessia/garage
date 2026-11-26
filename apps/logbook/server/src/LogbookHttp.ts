import * as DomainHttp from '@alchemy.run/domain/Http'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import { Platform } from 'alchemy/Http'
import * as HttpApi from 'effect/http-api/HttpApi'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'
import * as Layer from 'effect/Layer'

const LogbookHttpSpec = DomainHttp.toHttpApi(LogbookApi, {
  expose: [
    'RegisterAsset',
    'UpdateAsset',
    'RetireAsset',
    'RecordMeter',
    'AddSchedule',
    'ArchiveSchedule',
    'CompleteTask',
    'LogService',
    'RecordWarranty',
    'RemoveWarranty',
    'SetSpec',
    'RemoveSpec',
    'AttachLink',
    'RemoveLink',
    'HomeCatalog.get',
    'AssetDetail.get',
    'AssetActivity.list',
  ],
})

const appApi = HttpApi.make('LogbookHttp').add(LogbookHttpSpec.group.prefix('/v1'))

export const LogbookHttp = HttpApiBuilder.layer(appApi, { openapiPath: '/v1/openapi.json' }).pipe(
  Layer.provide(Layer.mergeAll(LogbookHttpSpec.layerFor(appApi), Platform))
)
