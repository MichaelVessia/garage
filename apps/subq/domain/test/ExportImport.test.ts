import * as Domain from '@alchemy.run/domain'
import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'

import { owner } from '../src/Actor.ts'
import { CurrentActor } from '../src/CurrentActor.context.ts'
import { decodeLegacyV3Export, JournalSnapshotJson, LegacyPhaseScheduleMismatch } from '../src/ExportFormat.ts'
import { GoalId, PERSONAL_JOURNAL_ID, ScheduleId } from '../src/Journal/Journal.id.ts'
import { Session, Unauthorized } from '../src/Session.middleware.ts'
import { Subq, SubqHandlers } from '../src/Subq.model.ts'
import { SubqApi } from '../src/SubqApi.api.ts'
import { journalCalculations, journalScheduleProgress } from './support/journalCalculations.ts'
import { legacyFixture } from './support/legacyFixture.ts'
// Captured from the trunk SQLite-backed stats service and pure calculators at 6d671dce.
import trunkResults from './support/trunkResults.json'

const TestSession = Layer.succeed(Session, (effect, { headers }) =>
  headers['authorization'] === 'test-owner'
    ? Effect.provideService(effect, CurrentActor, owner('owner@example.com'))
    : Effect.fail(Unauthorized.make({}))
)
const legacyExportText = Schema.fromJsonString(Schema.Unknown)
const ApiLayer = TestSession.pipe(Layer.provideMerge(Subq.layer(SubqHandlers).pipe(Layer.provide(Domain.InMemory))))

const indexed = <A extends { readonly id: string }>(entries: ReadonlyArray<A>) =>
  Record.fromIterableBy(entries, (entry) => entry.id)

// The in-process API uses the runtime clock for its projection workers.
// ast-grep-ignore: no-it-live
it.live('imports a v3 journal and reproduces trunk calculations from the three live views', () =>
  Effect.gen(function* () {
    const client = yield* SubqApi.clientInProcess
    const denied = yield* client.UpdatePreferences(PERSONAL_JOURNAL_ID, {}).pipe(Effect.flip)
    assert.instanceOf(denied, Unauthorized)
    const session = { headers: { authorization: 'test-owner' } }
    yield* client.UpdatePreferences(PERSONAL_JOURNAL_ID, { weightUnit: 'kg' }, session)
    const legacyJson = yield* Schema.encodeEffect(legacyExportText)(legacyFixture)
    const snapshot = yield* decodeLegacyV3Export(legacyJson)
    const json = yield* Schema.encodeEffect(JournalSnapshotJson)(snapshot)
    const roundTrip = yield* Schema.decodeEffect(JournalSnapshotJson)(json)
    const receipt = yield* client.ImportJournal(PERSONAL_JOURNAL_ID, { snapshot: roundTrip }, session)
    const options = { ...session, atLeast: receipt }
    const profile = yield* client.JournalProfile.get(PERSONAL_JOURNAL_ID, options).pipe(
      Effect.flatMap((value) => Effect.fromOption(Option.fromNullOr(value)))
    )
    const weights = yield* client.WeightHistory.get(PERSONAL_JOURNAL_ID, options).pipe(
      Effect.flatMap((value) => Effect.fromOption(Option.fromNullOr(value)))
    )
    const injections = yield* client.InjectionHistory.get(PERSONAL_JOURNAL_ID, options).pipe(
      Effect.flatMap((value) => Effect.fromOption(Option.fromNullOr(value)))
    )

    assert.lengthOf(Record.values(weights), 1000)
    assert.lengthOf(Record.values(injections), 200)
    assert.lengthOf(Record.values(profile.schedules), 3)
    assert.lengthOf(Record.values(profile.goals), 2)
    assert.deepEqual(weights, indexed(snapshot.data.weights))
    assert.deepEqual(injections, indexed(snapshot.data.injections))
    assert.deepEqual<unknown>(profile, {
      preferences: snapshot.data.preferences,
      schedules: indexed(snapshot.data.schedules),
      goals: indexed(snapshot.data.goals),
      latestWeight: snapshot.data.weights.at(-1),
      lastInjection: snapshot.data.injections.at(-1),
      knownSites: ['Left abdomen', 'Right thigh', 'Unknown'],
    })

    const schedule = yield* Effect.fromOption(Record.get(profile.schedules, ScheduleId.make('schedule-0')))
    const goal = yield* Effect.fromOption(Record.get(profile.goals, GoalId.make('goal-0')))
    const latestWeight = yield* Effect.fromOption(Option.fromNullOr(profile.latestWeight))
    const timezone = yield* Effect.fromOption(Option.fromUndefinedOr(profile.preferences.timezone))
    const input = {
      weights: Record.values(weights),
      injections: Record.values(injections),
      schedule,
      goal,
      latestWeight,
      timezone,
    }
    const { weightTrend, doseHistory, ...calculations } = journalCalculations(input)
    const { scheduleProgress, weightTrend: trunkTrend, ...trunkCalculations } = trunkResults
    assert.deepEqual<unknown>(calculations, trunkCalculations)
    assert.deepEqual<unknown>(
      weightTrend.points,
      Arr.map(legacyFixture.data.weightLogs, ({ datetime, weight }) => ({
        date: DateTime.toDate(DateTime.makeUnsafe(datetime)),
        weightLbs: weight,
      }))
    )
    assert.deepEqual<unknown>(
      doseHistory.points,
      Arr.map(legacyFixture.data.injectionLogs, ({ datetime, drug, doseMg }) => ({
        date: DateTime.toDate(DateTime.makeUnsafe(datetime)),
        compound: drug,
        doseMg,
      }))
    )
    const line = yield* Effect.fromOption(Option.fromNullOr(weightTrend.trendLine))
    assert.deepEqual(
      { ...line, startDate: line.startDate.toISOString(), endDate: line.endDate.toISOString() },
      trunkTrend.trendLine
    )
    const phases = journalScheduleProgress(input)
    assert.deepEqual<unknown>(
      {
        ...phases,
        createdAt: DateTime.formatIso(phases.createdAt),
        updatedAt: DateTime.formatIso(phases.updatedAt),
        phases: Arr.map(phases.phases, ({ injections, ...phase }) => ({
          ...phase,
          injectionIds: Arr.map(injections, ({ id }) => id),
        })),
      },
      scheduleProgress
    )
  }).pipe(Effect.provide(ApiLayer))
)

it.effect('rejects an unsupported legacy version', () =>
  decodeLegacyV3Export({ ...legacyFixture, version: '3.0.0-alpha.1' }).pipe(
    Effect.flip,
    Effect.tap((error) => Effect.sync(() => assert.instanceOf(error, Schema.SchemaError)))
  )
)

it.effect('rejects a legacy phase that names a different schedule', () =>
  Effect.gen(function* () {
    const schedule = yield* Effect.fromOption(Arr.head(legacyFixture.data.schedules))
    const phase = yield* Effect.fromOption(Arr.head(schedule.phases))
    const error = yield* decodeLegacyV3Export({
      ...legacyFixture,
      data: {
        ...legacyFixture.data,
        schedules: [{ ...schedule, phases: [{ ...phase, scheduleId: 'wrong' }] }],
      },
    }).pipe(Effect.flip)
    assert.instanceOf(error, LegacyPhaseScheduleMismatch)
  })
)
