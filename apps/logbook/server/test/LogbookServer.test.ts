import * as Domain from '@alchemy.run/domain'
import { assert, it } from '@effect/vitest'
import { AssetId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { HOME_HOUSEHOLD_ID } from '@garage/logbook-domain/Household.id'
import { Logbook, LogbookHandlers } from '@garage/logbook-domain/Logbook.model'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import { addDays, isoDateFromUtc } from '@garage/logbook-domain/ScheduleMath'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import { Cadence } from '@garage/logbook-domain/Values'
import { safeHttpEffect } from 'alchemy/Http'
import * as Arr from 'effect/Array'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'

import { LogbookRouter } from '../src/LogbookRouter.ts'
import { SessionLive } from '../src/Session.ts'

const authHeaders = { authorization: 'Bearer api-secret' }
const session = { headers: authHeaders }
const server = Layer.mergeAll(
  Logbook.layer(LogbookHandlers).pipe(Layer.provide(Domain.InMemory)),
  SessionLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        FetchHttpClient.layer,
        ConfigProvider.layer(ConfigProvider.fromEnvRecord({ LOGBOOK_API_TOKEN: 'api-secret' }))
      )
    )
  )
)

const handle = (url: string, init?: RequestInit) =>
  Effect.gen(function* () {
    const { fetch } = yield* LogbookRouter
    const request = HttpServerRequest.fromWeb(new Request(`https://logbook.test${url}`, init))
    const response = yield* Effect.provideService(safeHttpEffect(fetch), HttpServerRequest.HttpServerRequest, request)
    return HttpServerResponse.toWeb(response)
  }).pipe(Effect.scoped)

const JsonBody = Schema.fromJsonString(Schema.Json)
const json = (response: Response) =>
  Effect.promise(() => response.text()).pipe(Effect.flatMap(Schema.decodeEffect(JsonBody)))

it.effect('serves health without credentials and requires credentials on API routes', () =>
  Effect.gen(function* () {
    const health = yield* handle('/health')
    assert.strictEqual(health.status, 200)
    const detail = yield* json(health)
    assert.deepStrictEqual(detail, { status: 'ok' })
    const missing = yield* handle('/apiculture')
    assert.strictEqual(missing.status, 404)
    const rpc = yield* handle('/api', { method: 'POST' })
    const rpcChild = yield* handle('/api/rpc', { method: 'POST' })
    const frame = yield* handle('/frame/due')
    const unauthorizedMcp = yield* handle('/mcp', { method: 'POST' })
    assert.deepStrictEqual([rpc.status, rpcChild.status, frame.status, unauthorizedMcp.status], [401, 401, 401, 401])
    const errors = yield* Effect.forEach([rpc, frame, unauthorizedMcp], json, { concurrency: 1 })
    const unauthorized = yield* Schema.encodeEffect(Unauthorized)(Unauthorized.make({}))
    assert.deepStrictEqual(errors, [unauthorized, unauthorized, unauthorized])
  }).pipe(Effect.provide(server))
)

// The in-memory model uses the live clock for projection workers.
// ast-grep-ignore: no-it-live
it.live('returns only due maintenance and expiring warranties for active assets', () =>
  Effect.gen(function* () {
    const now = yield* DateTime.now
    const today = isoDateFromUtc(now)
    const client = yield* LogbookApi.clientInProcess
    const truck = AssetId.make('truck')
    const mower = AssetId.make('mower')
    const retired = AssetId.make('retired')
    const oil = ScheduleId.make('oil')
    const tires = ScheduleId.make('tires')
    const service = ScheduleId.make('service')
    const warrantyId = WarrantyId.make('powertrain')
    const oilSchedule = {
      scheduleId: oil,
      title: 'Oil',
      cadence: Cadence.cases.IntervalDays.make({ days: 30 }),
      lastCompletedOn: addDays(today, -66),
    }
    const warranty = { warrantyId, label: 'Powertrain', expiresOn: addDays(today, 16), notes: 'Private' }

    yield* client.RegisterAsset(
      truck,
      {
        name: 'Truck',
        category: 'vehicle',
        meterUnit: 'miles',
        initialMeter: 1000,
        serialNumber: 'Private',
      },
      session
    )
    yield* client.AddSchedule(truck, oilSchedule, session)
    yield* client.AddSchedule(
      truck,
      {
        scheduleId: tires,
        title: 'Tires',
        cadence: Cadence.cases.MeterInterval.make({ every: 500, unit: 'miles' }),
      },
      session
    )
    yield* client.AddSchedule(truck, { ...oilSchedule, scheduleId: service, title: 'Service' }, session)
    yield* client.CompleteTask(
      truck,
      {
        scheduleId: service,
        performedBy: 'diy',
        completedOn: addDays(today, -26),
        meterReading: 1100,
      },
      session
    )
    yield* client.LogService(truck, { title: 'Repair', performedBy: 'shop', meterReading: 1200 }, session)
    yield* client.RecordWarranty(
      truck,
      { ...warranty, warrantyId: WarrantyId.make('expired'), expiresOn: addDays(today, -1) },
      session
    )
    const truckWrite = yield* client.RecordWarranty(truck, warranty, session)

    yield* client.RegisterAsset(mower, { name: 'Mower', category: 'equipment' }, session)
    const mowerWrite = yield* client.AddSchedule(mower, oilSchedule, session)
    yield* client.RegisterAsset(retired, { name: 'Retired', category: 'vehicle' }, session)
    yield* client.AddSchedule(retired, oilSchedule, session)
    yield* client.RecordWarranty(retired, warranty, session)
    const retiredWrite = yield* client.RetireAsset(retired, { reason: 'sold' }, session)

    yield* Effect.forEach(
      [truckWrite, mowerWrite, retiredWrite],
      (atLeast) => client.HomeCatalog.get(HOME_HOUSEHOLD_ID, { ...session, atLeast }),
      { concurrency: 1 }
    )

    const response = yield* handle('/frame/due', session)
    assert.strictEqual(response.status, 200)
    const report = yield* json(response)
    const truckFields = {
      assetId: truck,
      assetName: 'Truck',
      category: 'vehicle',
      currentMeter: 1200,
      meterUnit: 'miles',
    }
    const overdue = [
      {
        assetId: mower,
        assetName: 'Mower',
        category: 'equipment',
        scheduleId: oil,
        title: 'Oil',
        nextDueOn: addDays(today, -36),
      },
      { ...truckFields, scheduleId: oil, title: 'Oil', nextDueOn: addDays(today, -36) },
    ]
    assert.deepStrictEqual(report, {
      generatedOn: today,
      overdue,
      dueSoon: [
        { ...truckFields, scheduleId: service, title: 'Service', nextDueOn: addDays(today, 4) },
        { ...truckFields, scheduleId: tires, title: 'Tires', nextDueMeter: 1500 },
      ],
      warrantiesExpiring: [
        {
          assetId: truck,
          assetName: 'Truck',
          warrantyId,
          label: 'Powertrain',
          expiresOn: warranty.expiresOn,
          daysRemaining: 16,
        },
      ],
    })
    const filtered = yield* handle('/frame/due?withinDays=0&withinMeter=200&warrantyDays=7', session)
    assert.strictEqual(filtered.status, 200)
    const filteredReport = yield* json(filtered)
    assert.deepStrictEqual(filteredReport, { generatedOn: today, overdue, dueSoon: [], warrantiesExpiring: [] })
    const invalid = yield* handle('/frame/due?withinDays=-1', session)
    assert.strictEqual(invalid.status, 400)
  }).pipe(Effect.provide(server))
)

// The HTTP read waits for the live projection worker after the write.
// ast-grep-ignore: no-it-live
it.live('protects the OpenAPI document and serves HTTP commands and reads', () =>
  Effect.gen(function* () {
    const root = yield* handle('/v1')
    assert.strictEqual(root.status, 401)
    const denied = yield* handle('/v1/openapi.json')
    assert.strictEqual(denied.status, 401)

    const openapi = yield* handle('/v1/openapi.json', session)
    assert.strictEqual(openapi.status, 200)
    const document = yield* json(openapi)
    assert.propertyVal(document, 'openapi', '3.1.0')
    assert.nestedProperty(document, 'paths./v1/RegisterAsset.post')
    assert.nestedProperty(document, 'paths./v1/HomeCatalog/{key}.get')

    const registered = yield* handle('/v1/RegisterAsset', {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: '{"target":"washer","input":{"name":"Washer","category":"appliance"}}',
    })
    assert.strictEqual(registered.status, 200)
    const receipt = yield* json(registered)
    const { stream, version } = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ stream: Schema.String, version: Schema.Int })
    )(receipt)

    const query = new URLSearchParams({ stream, version: String(version) })
    const catalog = yield* handle(`/v1/HomeCatalog/home?${query}`, session)
    assert.strictEqual(catalog.status, 200)
    const catalogBody = yield* json(catalog)
    assert.nestedPropertyVal(catalogBody, 'assets.washer.name', 'Washer')
  }).pipe(Effect.provide(server))
)

const protocol = '2026-07-28'
const mcp = (method: string, params: Readonly<Record<string, Schema.Json>> = {}, name?: string) =>
  Effect.gen(function* () {
    const headers = new Headers({
      ...authHeaders,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': protocol,
      'mcp-method': method,
    })
    if (name !== undefined) {
      headers.set('mcp-name', name)
    }
    const body = yield* Schema.encodeEffect(JsonBody)({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': protocol,
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    })
    return yield* handle('/mcp', { method: 'POST', headers, body })
  })

// The MCP read waits for the live projection worker after the write.
// ast-grep-ignore: no-it-live
it.live('discovers, lists, and calls Logbook MCP tools over HTTP', () =>
  Effect.gen(function* () {
    const initialize = yield* mcp('initialize', {
      protocolVersion: protocol,
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    })
    const initializeResult = yield* json(initialize)
    assert.nestedProperty(initializeResult, 'error.code')

    const discovery = yield* mcp('server/discover')
    assert.strictEqual(discovery.status, 200)
    const discovered = yield* json(discovery)
    const info = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        result: Schema.Struct({
          _meta: Schema.Struct({ 'io.modelcontextprotocol/serverInfo': Schema.Struct({ name: Schema.String }) }),
          supportedVersions: Schema.Array(Schema.String),
        }),
      })
    )(discovered)
    assert.strictEqual(info.result._meta['io.modelcontextprotocol/serverInfo'].name, 'Logbook')
    assert.deepStrictEqual(info.result.supportedVersions, [protocol])

    const list = yield* mcp('tools/list')
    assert.strictEqual(list.status, 200)
    const payload = yield* json(list)
    const { result } = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        result: Schema.Struct({ tools: Schema.Array(Schema.Struct({ name: Schema.String })) }),
      })
    )(payload)
    assert.sameMembers(
      Arr.map(result.tools, (tool) => tool.name),
      [
        'LogbookApi_RegisterAsset_send',
        'LogbookApi_RetireAsset_send',
        'LogbookApi_RecordMeter_send',
        'LogbookApi_AddSchedule_send',
        'LogbookApi_ArchiveSchedule_send',
        'LogbookApi_CompleteTask_send',
        'LogbookApi_LogService_send',
        'LogbookApi_RecordWarranty_send',
        'LogbookApi_RemoveWarranty_send',
        'LogbookApi_SetSpec_send',
        'LogbookApi_RemoveSpec_send',
        'LogbookApi_AttachLink_send',
        'LogbookApi_RemoveLink_send',
        'LogbookApi_HomeCatalog_get',
        'LogbookApi_AssetDetail_get',
        'LogbookApi_AssetActivity_list',
      ]
    )

    const register = 'LogbookApi_RegisterAsset_send'
    const registered = yield* mcp(
      'tools/call',
      {
        name: register,
        arguments: {
          target: 'furnace',
          input: { name: 'Furnace', category: 'home' },
        },
      },
      register
    )
    assert.strictEqual(registered.status, 200)
    const registeredPayload = yield* json(registered)
    const receipt = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        result: Schema.Struct({ structuredContent: Schema.Struct({ stream: Schema.String, version: Schema.Int }) }),
      })
    )(registeredPayload)

    const catalog = 'LogbookApi_HomeCatalog_get'
    const view = yield* mcp(
      'tools/call',
      {
        name: catalog,
        arguments: {
          key: HOME_HOUSEHOLD_ID,
          atLeast: receipt.result.structuredContent,
        },
      },
      catalog
    )
    assert.strictEqual(view.status, 200)
    const viewResult = yield* json(view)
    assert.nestedPropertyVal(viewResult, 'result.structuredContent.value.assets.furnace.name', 'Furnace')
  }).pipe(Effect.provide(server))
)

it.effect('returns a typed session denial for browser RPC commands', () =>
  Effect.gen(function* () {
    const response = yield* handle('/api', {
      method: 'POST',
      headers: { 'content-type': 'application/x-ndjson' },
      body: '{"_tag":"Request","id":"1","tag":"RecordMeter","payload":{"target":"truck","input":{"reading":10}},"headers":[]}\n',
    })
    assert.strictEqual(response.status, 200)
    const body = yield* Effect.promise(() => response.text())
    assert.include(body, '"_tag":"Unauthorized"')
  }).pipe(Effect.provide(server))
)
