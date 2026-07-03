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
import { Config, Data, DateTime, Effect, Layer, Random, Schema } from 'effect'
import { Cookies, FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc'

import { AppRpcs, DataExport, DEMO_USER } from '#shared'

import { randomUuid } from '../src/shared/common/random-uuid.js'

class SeedError extends Data.TaggedError('SeedError')<{ message: string }> {}

// ============================================
// Demo data generation (encoded DataExport JSON)
// ============================================

interface PhaseJson {
  id: string
  scheduleId: string
  order: number
  durationDays: number | null
  dosage: string
  createdAt: DateTime.Utc
  updatedAt: DateTime.Utc
}

interface ScheduleJson {
  id: string
  name: string
  drug: string
  source: string | null
  frequency: string
  startDate: DateTime.Utc
  isActive: boolean
  notes: string | null
  phases: PhaseJson[]
  createdAt: DateTime.Utc
  updatedAt: DateTime.Utc
}

interface InjectionJson {
  id: string
  datetime: DateTime.Utc
  drug: string
  source: string | null
  dosage: string
  injectionSite: string
  notes: string | null
  scheduleId: string | null
  createdAt: DateTime.Utc
  updatedAt: DateTime.Utc
}

interface WeightJson {
  id: string
  datetime: DateTime.Utc
  weight: number
  notes: string | null
  createdAt: DateTime.Utc
  updatedAt: DateTime.Utc
}

interface GoalJson {
  id: string
  goalWeight: number
  startingWeight: number
  startingDate: DateTime.Utc
  targetDate: DateTime.Utc | null
  notes: string | null
  isActive: boolean
  completedAt: DateTime.Utc | null
  createdAt: DateTime.Utc
  updatedAt: DateTime.Utc
}

const SITES = ['left abdomen', 'right abdomen', 'left thigh', 'right thigh']
const TITRATION_DOSES = ['2.5mg', '5mg', '7.5mg', '10mg', '15mg']

const siteForWeek = (week: number): string => SITES[(week - 1) % SITES.length] ?? 'left abdomen'

interface DrugDose {
  drug: string
  dose: string
}

// Weekly drug/dose over the first 40 weeks: Semaglutide titration (1-20),
// then Tirzepatide titration (21-40).
const getDrugAndDose = (week: number): DrugDose | null => {
  if (week <= 20) {
    const phase = Math.ceil(week / 4)
    return { dose: TITRATION_DOSES[Math.min(phase - 1, 4)] ?? '15mg', drug: 'Semaglutide' }
  }
  if (week <= 40) {
    const phase = Math.ceil((week - 20) / 4)
    return { dose: TITRATION_DOSES[Math.min(phase - 1, 4)] ?? '15mg', drug: 'Tirzepatide' }
  }
  return null
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
  specs: ReadonlyArray<{ order: number; durationDays: number | null; dosage: string }>
): Effect.Effect<PhaseJson[]> =>
  Effect.all(
    specs.map((spec) =>
      randomUuid.pipe(
        Effect.map((id) => ({
          createdAt: now,
          dosage: spec.dosage,
          durationDays: spec.durationDays,
          id,
          order: spec.order,
          scheduleId,
          updatedAt: now,
        }))
      )
    )
  )

const titrationPhaseSpecs = TITRATION_DOSES.map((dosage, index) => ({
  dosage,
  durationDays: 28,
  order: index + 1,
}))

const titrationInjectionNotes = (week: number, drugDose: DrugDose): string | null => {
  if (week === 1) {
    return 'First injection - starting journey'
  }
  if (week === 21) {
    return 'Switching to Tirzepatide'
  }
  const previous = getDrugAndDose(week - 1)
  if (previous !== null && drugDose.dose !== previous.dose && drugDose.drug === previous.drug) {
    return `Dose increase to ${drugDose.dose}`
  }
  if (week === 40) {
    return 'Completing Tirzepatide, trying Retatrutide next'
  }
  return null
}

// Weekly injections for the two titrations (weeks 1-40)
const makeTitrationInjections = (
  startDate: DateTime.Utc,
  now: DateTime.Utc,
  semaScheduleId: string,
  tirzScheduleId: string
) =>
  Effect.gen(function* () {
    const logs: InjectionJson[] = []
    for (let week = 1; week <= 40; week += 1) {
      const drugDose = getDrugAndDose(week)
      if (drugDose === null) {
        continue
      }

      const minute = yield* Random.nextIntBetween(0, 30)
      const datetime = DateTime.add(startDate, { days: (week - 1) * 7 }).pipe(
        DateTime.setParts({ hour: 18, millisecond: 0, minute, second: 0 })
      )

      logs.push({
        createdAt: now,
        datetime,
        dosage: drugDose.dose,
        drug: drugDose.drug,
        id: yield* randomUuid,
        injectionSite: siteForWeek(week),
        notes: titrationInjectionNotes(week, drugDose),
        scheduleId: drugDose.drug === 'Semaglutide' ? semaScheduleId : tirzScheduleId,
        source: 'Pharmacy',
        updatedAt: now,
      })
    }
    return logs
  })

// Retatrutide injections from week 41 up to today
const makeRetatInjections = (
  retatStartDate: DateTime.Utc,
  nowDt: DateTime.Utc,
  now: DateTime.Utc,
  retatScheduleId: string
) =>
  Effect.gen(function* () {
    const doseGroups = [
      { dose: '1mg', weeks: [1, 2] },
      { dose: '2mg', weeks: [3, 4] },
      { dose: '4mg', weeks: [5, 6] },
      { dose: '8mg', weeks: [7, 8] },
      { dose: '12mg', weeks: [9, 10, 11, 12] },
    ]

    const logs: InjectionJson[] = []
    for (const doseGroup of doseGroups) {
      for (const week of doseGroup.weeks) {
        const minute = yield* Random.nextIntBetween(0, 30)
        const datetime = DateTime.add(retatStartDate, { days: (week - 1) * 7 }).pipe(
          DateTime.setParts({ hour: 9, millisecond: 0, minute, second: 0 })
        )
        if (DateTime.isGreaterThan(datetime, nowDt)) {
          continue
        }

        let notes: string | null = null
        if (week === 1) {
          notes = 'Starting Retatrutide - switching from Tirzepatide'
        } else if (doseGroup.weeks[0] === week) {
          notes = `Increased to ${doseGroup.dose}`
        }

        logs.push({
          createdAt: now,
          datetime,
          dosage: doseGroup.dose,
          drug: 'Retatrutide (Compounded)',
          id: yield* randomUuid,
          injectionSite: siteForWeek(week),
          notes,
          scheduleId: retatScheduleId,
          source: 'Compounding Pharmacy',
          updatedAt: now,
        })
      }
    }
    return logs
  })

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

const weightNotes = (day: number, weight: number, crossed: Set<number>): string | null => {
  const milestone = MILESTONE_NOTES[day]
  if (milestone !== undefined) {
    return milestone
  }
  if (weight < 200 && !crossed.has(200)) {
    crossed.add(200)
    return 'Under 200 for the first time!'
  }
  if (weight < 180 && !crossed.has(180)) {
    crossed.add(180)
    return 'Under 180!'
  }
  if (weight < 170 && !crossed.has(170)) {
    crossed.add(170)
    return 'Under 170 - almost at goal'
  }
  return null
}

const makeWeightLogs = (startDate: DateTime.Utc, now: DateTime.Utc) =>
  Effect.gen(function* () {
    const logs: WeightJson[] = []
    const crossed = new Set<number>()
    for (let day = 0; day <= 365; day += 1) {
      const pattern = getWeighInPattern(day)
      let shouldWeigh: boolean
      if (pattern === 'daily') {
        shouldWeigh = true
      } else if (pattern === 'moderate') {
        shouldWeigh = day % 2 === 0 || day % 3 === 0
      } else {
        shouldWeigh = day % 7 === 0 || (day % 7 === 3 && (yield* Random.next) > 0.5)
      }
      if (!shouldWeigh) {
        continue
      }

      const hour = yield* Random.nextIntBetween(7, 9)
      const minute = yield* Random.nextIntBetween(0, 45)
      const datetime = DateTime.add(startDate, { days: day }).pipe(
        DateTime.setParts({ hour, millisecond: 0, minute, second: 0 })
      )

      const weight = Math.round(addFluctuation(getExpectedWeight(day), day) * 10) / 10

      logs.push({
        createdAt: now,
        datetime,
        id: yield* randomUuid,
        notes: weightNotes(day, weight, crossed),
        updatedAt: now,
        weight,
      })
    }
    return logs
  })

const generateDemoData = Effect.gen(function* () {
  const nowDt = yield* DateTime.now
  const now = nowDt
  const startDate = DateTime.subtract(nowDt, { days: 365 }).pipe(
    DateTime.setParts({ hour: 8, millisecond: 0, minute: 0, second: 0 })
  )
  const tirzStartDate = DateTime.add(startDate, { days: 20 * 7 })
  const retatStartDate = DateTime.add(startDate, { days: 40 * 7 })

  // Three schedules: two completed titrations and an active maintenance one
  const semaScheduleId = yield* randomUuid
  const tirzScheduleId = yield* randomUuid
  const retatScheduleId = yield* randomUuid

  const schedules: ScheduleJson[] = [
    {
      createdAt: now,
      drug: 'Semaglutide',
      frequency: 'weekly',
      id: semaScheduleId,
      isActive: false,
      name: 'Semaglutide Titration',
      notes: 'Completed 20-week titration',
      phases: yield* makePhases(semaScheduleId, now, titrationPhaseSpecs),
      source: null,
      startDate,
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
      source: null,
      startDate: tirzStartDate,
      updatedAt: now,
    },
    {
      createdAt: now,
      drug: 'Retatrutide (Compounded)',
      frequency: 'weekly',
      id: retatScheduleId,
      isActive: true,
      name: 'Retatrutide Maintenance',
      notes: 'Active maintenance schedule with indefinite final phase',
      phases: yield* makePhases(retatScheduleId, now, [
        { dosage: '1mg', durationDays: 14, order: 1 },
        { dosage: '2mg', durationDays: 14, order: 2 },
        { dosage: '4mg', durationDays: 14, order: 3 },
        { dosage: '8mg', durationDays: 14, order: 4 },
        { dosage: '12mg', durationDays: null, order: 5 },
      ]),
      source: 'Compounding Pharmacy',
      startDate: retatStartDate,
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

  const goals: GoalJson[] = [
    {
      completedAt: null,
      createdAt: goalStartDate,
      goalWeight: 125,
      id: yield* randomUuid,
      isActive: true,
      notes: 'Long-term goal - doctor says 125 is ideal for my height',
      startingDate: goalStartDate,
      startingWeight: 200,
      targetDate: goalTargetDate,
      updatedAt: now,
    },
  ]

  return {
    data: {
      goals,
      injectionLogs,
      schedules,
      settings: { weightUnit: 'lbs' },
      weightLogs,
    },
    exportedAt: now,
    version: '2.0.0',
  }
})

// ============================================
// Auth: create (or reuse) the demo user, return the session cookie
// ============================================

const postJson = (url: string, body: unknown) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const request = yield* HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJson(body))
    return yield* client.execute(request)
  })

const authenticate = (baseUrl: string) =>
  Effect.gen(function* () {
    const { email, name, password } = DEMO_USER

    let response = yield* postJson(`${baseUrl}/api/auth/sign-up/email`, { email, name, password })
    if (response.status < 400) {
      yield* Effect.log(`Created demo user ${email}`)
    } else {
      yield* Effect.log(`Sign-up returned ${response.status}, signing in as existing ${email}`)
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
    yield* Effect.log(`Seeding demo data on ${baseUrl}`)
    const cookie = yield* authenticate(baseUrl)
    return RpcClient.layerProtocolHttp({
      transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader('cookie', cookie)),
      url: `${baseUrl}/rpc`,
    })
  })
).pipe(Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]))

const main = Effect.gen(function* () {
  const payload = yield* Schema.decodeUnknownEffect(DataExport)(yield* generateDemoData)
  const client = yield* RpcClient.make(AppRpcs)
  const result = yield* client.UserDataImport(payload)
  yield* Effect.log(
    `Import complete: ${result.weightLogs} weight logs, ${result.injectionLogs} injection logs, ` +
      `${result.schedules} schedules, ${result.goals} goals, settings ${result.settingsUpdated ? 'updated' : 'unchanged'}`
  )
})

// @effect-diagnostics-next-line strictEffectProvide:off
await main.pipe(Effect.provide(ProtocolLive), Effect.scoped, Effect.runPromise)
