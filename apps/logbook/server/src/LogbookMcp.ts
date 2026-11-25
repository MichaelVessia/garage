import * as DomainAi from '@alchemy.run/domain/Ai'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import * as McpProtocol from 'effect/ai/McpProtocol'
import * as McpServer from 'effect/ai/McpServer'
import * as Layer from 'effect/Layer'

export const LogbookMcp = DomainAi.toMcp(LogbookApi, {
  expose: [
    'RegisterAsset',
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
}).pipe(
  Layer.provide(
    McpServer.layerHttpRequestScoped({
      name: 'Logbook',
      version: '1.0.0',
      path: '/mcp',
      protocols: [McpProtocol.v2026_07_28],
    })
  )
)
