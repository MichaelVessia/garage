/**
 * Seed the deployed subq worker with the demo account and a year of data.
 *
 * Creates the demo user via better-auth (or signs in if it already exists),
 * then replaces all of its data through the UserDataImport RPC — the same
 * path as the app's data-import feature, so all domain validation applies.
 *
 * Run from apps/subq (bun auto-loads .env for BETTER_AUTH_URL):
 *   bun run seed:demo
 */
import { NodeRuntime } from '@effect/platform-node'
import * as Arr from 'effect/Array'
import * as Config from 'effect/Config'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as HashSet from 'effect/HashSet'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Random from 'effect/Random'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import { Cookies, FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc'

import { AppRpcs, DataExport, DEMO_USER, IanaTimezone, projectInstantToCalendarDate } from '#shared'

import { randomUuid } from '../src/shared/common/random-uuid.js'
import { SeedError } from './errors.js'

// ============================================
// Demo data generation (encoded DataExport JSON)
// ============================================

const SITES = ['left abdomen', 'right abdomen', 'left thigh', 'right thigh']
const TITRATION_DOSES = [2.5, 5, 7.5, 10, 15]
const DEMO_TIMEZONE = IanaTimezone.make('America/New_York')

const siteForWeek = (week: number): string => SITES[(week - 1) % SITES.length] ?? 'left abdomen'

interface DrugDose {
  drug: string
  dose: number
}

// Weekly drug/dose over the first 40 weeks: Semaglutide titration (1-20),
// then Tirzepatide titration (21-40).
const getDrugAndDose = (week: number): Option.Option<DrugDose> => {
  if (week <= 20) {
    const phase = Math.ceil(week / 4)
    return Option.some({ dose: TITRATION_DOSES[Math.min(phase - 1, 4)] ?? 15, drug: 'Semaglutide' })
  }
  if (week <= 40) {
    const phase = Math.ceil((week - 20) / 4)
    return Option.some({ dose: TITRATION_DOSES[Math.min(phase - 1, 4)] ?? 15, drug: 'Tirzepatide' })
  }
  return Option.none()
}

// Weight-loss curve: 220 lbs -> 165 lbs over a year, fast at first
const getExpectedWeight = (day: number): number => {
  const progress = day / 365
  return 220 - 55 * (1 - (1 - progress) ** 0.7)
}

// Deterministic pseudo-random daily fluctuation of +/- 2 lbs
const addFluctuation = (weight: number, seed: number): number => {
  const fluctuation = (Math.sin(seed * 12.9898) * 43_758.5453) % 1
  return weight + (fluctuation - 0.5) * 4
}

const makePhases = (
  scheduleId: string,
  now: DateTime.Utc,
  specs: ReadonlyArray<{ order: number; durationDays: Option.Option<number>; doseMg: number }>
) =>
  Effect.forEach(
    specs,
    (spec) =>
      randomUuid().pipe(
        Effect.map((id) => ({
          createdAt: now,
          doseMg: spec.doseMg,
          durationDays: Option.getOrNull(spec.durationDays),
          id,
          order: spec.order,
          scheduleId,
          updatedAt: now,
        }))
      ),
    { concurrency: 1 }
  )

const titrationPhaseSpecs = TITRATION_DOSES.map((doseMg, index) => ({
  doseMg,
  durationDays: Option.some(28),
  order: index + 1,
}))

const titrationInjectionNotes = (week: number, drugDose: DrugDose): Option.Option<string> => {
  if (week === 1) {
    return Option.some('First injection - starting journey')
  }
  if (week === 21) {
    return Option.some('Switching to Tirzepatide')
  }
  const previous = getDrugAndDose(week - 1)
  if (Option.isSome(previous) && drugDose.dose !== previous.value.dose && drugDose.drug === previous.value.drug) {
    return Option.some(`Dose increase to ${drugDose.dose} mg`)
  }
  if (week === 40) {
    return Option.some('Completing Tirzepatide, trying Retatrutide next')
  }
  return Option.none()
}

// Weekly injections for the two titrations (weeks 1-40)
const makeTitrationInjections = (
  startDate: DateTime.Utc,
  now: DateTime.Utc,
  semaScheduleId: string,
  tirzScheduleId: string
) =>
  Effect.forEach(
    Arr.range(1, 40),
    (week) =>
      Effect.gen(function* () {
        const drugDoseOpt = getDrugAndDose(week)
        if (Option.isNone(drugDoseOpt)) {
          return Option.none()
        }
        const drugDose = drugDoseOpt.value

        const minute = yield* Random.nextIntBetween(0, 30)
        const id = yield* randomUuid()
        const datetime = DateTime.add(startDate, { days: (week - 1) * 7 }).pipe(
          DateTime.setParts({ hour: 18, millisecond: 0, minute, second: 0 })
        )

        return Option.some({
          createdAt: now,
          datetime,
          doseMg: drugDose.dose,
          drug: drugDose.drug,
          id,
          injectionSite: siteForWeek(week),
          notes: Option.getOrNull(titrationInjectionNotes(week, drugDose)),
          scheduleId: drugDose.drug === 'Semaglutide' ? semaScheduleId : tirzScheduleId,
          supplier: 'Pharmacy',
          updatedAt: now,
        })
      }),
    { concurrency: 1 }
  ).pipe(Effect.map(Arr.getSomes))

const retatInjectionNotes = (week: number, doseGroup: { dose: number; weeks: number[] }): Option.Option<string> => {
  if (week === 1) {
    return Option.some('Starting Retatrutide - switching from Tirzepatide')
  }
  if (doseGroup.weeks[0] === week) {
    return Option.some(`Increased to ${doseGroup.dose} mg`)
  }
  return Option.none()
}

// Retatrutide injections from week 41 up to today
const makeRetatInjections = (
  retatStartDate: DateTime.Utc,
  nowDt: DateTime.Utc,
  now: DateTime.Utc,
  retatScheduleId: string
) => {
  const doseGroups = [
    { dose: 1, weeks: [1, 2] },
    { dose: 2, weeks: [3, 4] },
    { dose: 4, weeks: [5, 6] },
    { dose: 8, weeks: [7, 8] },
    { dose: 12, weeks: [9, 10, 11, 12] },
  ]

  return Effect.forEach(
    Arr.flatMap(doseGroups, (doseGroup) => doseGroup.weeks.map((week) => ({ doseGroup, week }))),
    ({ doseGroup, week }) =>
      Effect.gen(function* () {
        const minute = yield* Random.nextIntBetween(0, 30)
        const datetime = DateTime.add(retatStartDate, { days: (week - 1) * 7 }).pipe(
          DateTime.setParts({ hour: 9, millisecond: 0, minute, second: 0 })
        )
        if (DateTime.isGreaterThan(datetime, nowDt)) {
          return Option.none()
        }

        const id = yield* randomUuid()

        return Option.some({
          createdAt: now,
          datetime,
          doseMg: doseGroup.dose,
          drug: 'Retatrutide',
          id,
          injectionSite: siteForWeek(week),
          notes: Option.getOrNull(retatInjectionNotes(week, doseGroup)),
          scheduleId: retatScheduleId,
          supplier: 'Compounding Pharmacy',
          updatedAt: now,
        })
      }),
    { concurrency: 1 }
  ).pipe(Effect.map(Arr.getSomes))
}

// Alternating tracking habits over the year
const WEIGH_IN_PATTERNS: Array<{ startDay: number; endDay: number; pattern: 'daily' | 'sparse' | 'moderate' }> = [
  { endDay: 14, pattern: 'daily', startDay: 0 },
  { endDay: 35, pattern: 'moderate', startDay: 15 },
  { endDay: 60, pattern: 'sparse', startDay: 36 },
  { endDay: 90, pattern: 'daily', startDay: 61 },
  { endDay: 120, pattern: 'moderate', startDay: 91 },
  { endDay: 150, pattern: 'sparse', startDay: 121 },
  { endDay: 180, pattern: 'daily', startDay: 151 },
  { endDay: 240, pattern: 'moderate', startDay: 181 },
  { endDay: 280, pattern: 'sparse', startDay: 241 },
  { endDay: 320, pattern: 'daily', startDay: 281 },
  { endDay: 365, pattern: 'moderate', startDay: 321 },
]

const getWeighInPattern = (day: number): 'daily' | 'sparse' | 'moderate' =>
  WEIGH_IN_PATTERNS.find((p) => day >= p.startDay && day <= p.endDay)?.pattern ?? 'moderate'

const MILESTONE_NOTES: Record<number, string> = {
  0: 'Starting weight - here we go!',
  30: '1 month in!',
  90: '3 months - feeling great',
  180: '6 months - halfway there',
  270: '9 months - so close to goal',
  365: '1 YEAR! What a journey',
}

const weightNotes = Effect.fn('seed.weightNotes')(function* (
  day: number,
  weight: number,
  crossed: Ref.Ref<HashSet.HashSet<number>>
) {
  const milestone = MILESTONE_NOTES[day]
  if (milestone !== undefined) {
    return Option.some(milestone)
  }
  const seen = yield* Ref.get(crossed)
  if (weight < 200 && !HashSet.has(seen, 200)) {
    yield* Ref.update(crossed, HashSet.add(200))
    return Option.some('Under 200 for the first time!')
  }
  if (weight < 180 && !HashSet.has(seen, 180)) {
    yield* Ref.update(crossed, HashSet.add(180))
    return Option.some('Under 180!')
  }
  if (weight < 170 && !HashSet.has(seen, 170)) {
    yield* Ref.update(crossed, HashSet.add(170))
    return Option.some('Under 170 - almost at goal')
  }
  return Option.none()
})

const makeWeightLogs = Effect.fn('seed.makeWeightLogs')(function* (startDate: DateTime.Utc, now: DateTime.Utc) {
  const crossed = yield* Ref.make(HashSet.empty<number>())
  return yield* Effect.forEach(
    Arr.range(0, 365),
    (day) =>
      Effect.gen(function* () {
        const pattern = getWeighInPattern(day)
        let shouldWeigh: boolean
        if (pattern === 'daily') {
          shouldWeigh = true
        } else if (pattern === 'moderate') {
          shouldWeigh = day % 2 === 0 || day % 3 === 0
        } else if (day % 7 === 0) {
          shouldWeigh = true
        } else if (day % 7 === 3) {
          shouldWeigh = (yield* Random.next) > 0.5
        } else {
          shouldWeigh = false
        }
        if (!shouldWeigh) {
          return Option.none()
        }

        const hour = yield* Random.nextIntBetween(7, 9)
        const minute = yield* Random.nextIntBetween(0, 45)
        const datetime = DateTime.add(startDate, { days: day }).pipe(
          DateTime.setParts({ hour, millisecond: 0, minute, second: 0 })
        )

        const weight = Math.round(addFluctuation(getExpectedWeight(day), day) * 10) / 10
        const notes = yield* weightNotes(day, weight, crossed)
        const id = yield* randomUuid()

        return Option.some({
          createdAt: now,
          datetime,
          id,
          notes: Option.getOrNull(notes),
          updatedAt: now,
          weight,
        })
      }),
    { concurrency: 1 }
  ).pipe(Effect.map(Arr.getSomes))
})

const generateDemoData = Effect.fn('generateDemoData')(function* () {
  const nowDt = yield* DateTime.now
  const now = nowDt
  const startDate = DateTime.subtract(nowDt, { days: 365 }).pipe(
    DateTime.setParts({ hour: 8, millisecond: 0, minute: 0, second: 0 })
  )
  const tirzStartDate = DateTime.add(startDate, { days: 20 * 7 })
  const retatStartDate = DateTime.add(startDate, { days: 40 * 7 })

  // Three schedules: two completed titrations and an active maintenance one
  const semaScheduleId = yield* randomUuid()
  const tirzScheduleId = yield* randomUuid()
  const retatScheduleId = yield* randomUuid()

  const schedules = [
    {
      createdAt: now,
      drug: 'Semaglutide',
      frequency: 'weekly',
      id: semaScheduleId,
      isActive: false,
      name: 'Semaglutide Titration',
      notes: 'Completed 20-week titration',
      phases: yield* makePhases(semaScheduleId, now, titrationPhaseSpecs),
      supplier: null,
      startDate: projectInstantToCalendarDate(startDate, DEMO_TIMEZONE),
      updatedAt: now,
    },
    {
      createdAt: now,
      drug: 'Tirzepatide',
      frequency: 'weekly',
      id: tirzScheduleId,
      isActive: false,
      name: 'Tirzepatide Titration',
      notes: 'Completed - switched to Retatrutide',
      phases: yield* makePhases(tirzScheduleId, now, titrationPhaseSpecs),
      supplier: null,
      startDate: projectInstantToCalendarDate(tirzStartDate, DEMO_TIMEZONE),
      updatedAt: now,
    },
    {
      createdAt: now,
      drug: 'Retatrutide',
      frequency: 'weekly',
      id: retatScheduleId,
      isActive: true,
      name: 'Retatrutide Maintenance',
      notes: 'Active maintenance schedule with indefinite final phase',
      phases: yield* makePhases(retatScheduleId, now, [
        { doseMg: 1, durationDays: Option.some(14), order: 1 },
        { doseMg: 2, durationDays: Option.some(14), order: 2 },
        { doseMg: 4, durationDays: Option.some(14), order: 3 },
        { doseMg: 8, durationDays: Option.some(14), order: 4 },
        { doseMg: 12, durationDays: Option.none<number>(), order: 5 },
      ]),
      supplier: 'Compounding Pharmacy',
      startDate: projectInstantToCalendarDate(retatStartDate, DEMO_TIMEZONE),
      updatedAt: now,
    },
  ]

  const injectionLogs = [
    ...(yield* makeTitrationInjections(startDate, now, semaScheduleId, tirzScheduleId)),
    ...(yield* makeRetatInjections(retatStartDate, nowDt, now, retatScheduleId)),
  ]

  const weightLogs = yield* makeWeightLogs(startDate, now)

  // Active goal set two months into the journey, ~47% complete today
  const goalStartDate = DateTime.add(startDate, { days: 60 })
  const goalTargetDate = DateTime.add(goalStartDate, { months: 18 })

  const goals = [
    {
      completedAt: null,
      createdAt: goalStartDate,
      goalWeight: 125,
      id: yield* randomUuid(),
      isActive: true,
      notes: 'Long-term goal - doctor says 125 is ideal for my height',
      startingDate: projectInstantToCalendarDate(goalStartDate, DEMO_TIMEZONE),
      startingWeight: 200,
      targetDate: projectInstantToCalendarDate(goalTargetDate, DEMO_TIMEZONE),
      updatedAt: now,
    },
  ]

  return {
    data: {
      goals,
      injectionLogs,
      schedules,
      settings: { timezone: DEMO_TIMEZONE, weightUnit: 'lbs' },
      weightLogs,
    },
    exportedAt: now,
    version: '3.0.0-alpha.2',
  }
})

// ============================================
// Auth: create (or reuse) the demo user, return the session cookie
// ============================================

const postJson = Effect.fn('seed.postJson')(function* (url: string, body: unknown) {
  const client = yield* HttpClient.HttpClient
  const request = yield* HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJson(body))
  return yield* client.execute(request)
})

const authenticate = Effect.fn('seed.authenticate')(function* (baseUrl: string) {
  const { email, name, password } = DEMO_USER

  let response = yield* postJson(`${baseUrl}/api/auth/sign-up/email`, { email, name, password })
  if (response.status < 400) {
    yield* Effect.log('Created demo user').pipe(Effect.annotateLogs({ email }))
  } else {
    yield* Effect.log('Sign-up returned non-success, signing in as existing user').pipe(
      Effect.annotateLogs({ status: response.status, email })
    )
    response = yield* postJson(`${baseUrl}/api/auth/sign-in/email`, { email, password })
  }
  if (response.status >= 400) {
    const body = yield* response.text
    return yield* new SeedError({ message: `Authentication failed (${response.status}): ${body}` })
  }

  const cookieHeader = Cookies.toCookieHeader(response.cookies)
  if (cookieHeader === '') {
    return yield* new SeedError({ message: 'Authentication succeeded but returned no session cookie' })
  }
  return cookieHeader
})

// ============================================
// Main
// ============================================

// ndjson serialization is broken with toHttpEffect on effect beta.93; use JSON
const ProtocolLive = Layer.unwrap(
  Effect.gen(function* () {
    const baseUrl = yield* Config.string('BETTER_AUTH_URL')
    yield* Effect.log('Seeding demo data').pipe(Effect.annotateLogs({ baseUrl }))
    const cookie = yield* authenticate(baseUrl)
    return RpcClient.layerProtocolHttp({
      transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader('cookie', cookie)),
      url: `${baseUrl}/rpc`,
    })
  })
).pipe(Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]))

const main = Effect.fn('main')(function* () {
  const payload = yield* Schema.decodeUnknownEffect(DataExport)(yield* generateDemoData())
  const client = yield* RpcClient.make(AppRpcs)
  const result = yield* client.UserDataImport(payload)
  yield* Effect.log('Import complete').pipe(
    Effect.annotateLogs({
      weightLogs: result.weightLogs,
      injectionLogs: result.injectionLogs,
      schedules: result.schedules,
      goals: result.goals,
      settingsUpdated: result.settingsUpdated,
    })
  )
})

// @effect-diagnostics-next-line strictEffectProvide:off
NodeRuntime.runMain(main().pipe(Effect.provide(ProtocolLive), Effect.scoped))
