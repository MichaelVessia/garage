import type { RecordingHttpResponse } from '@garage/integration-http/testing'
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'

/** Synthetic Google Calendar settings; no real calendar, account, or household detail. */
export const calendarId = 'family-calendar@group.calendar.example.test'
export const accessToken = 'synthetic-access-token'
export const tokenUri = 'https://oauth2.example.test/token'
export const eventsPath = `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`

class TestKeyError extends Schema.TaggedError<TestKeyError>()('TestKeyError', { cause: Schema.Defect() }) {}

const pem = (pkcs8: ArrayBuffer): string => {
  const base64 = Buffer.from(pkcs8).toString('base64')
  return `-----BEGIN PRIVATE KEY-----\n${base64.replaceAll(/.{1,64}/gu, '$&\n')}-----END PRIVATE KEY-----\n`
}

/** A service account with an RSA key generated for this test run, so no key material is committed. */
export const makeServiceAccount = Effect.gen(function* () {
  const keys = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify']
      ),
    catch: (cause) => new TestKeyError({ cause }),
  })
  const pkcs8 = yield* Effect.tryPromise({
    try: () => crypto.subtle.exportKey('pkcs8', keys.privateKey),
    catch: (cause) => new TestKeyError({ cause }),
  })
  return {
    clientEmail: 'frame@example-project.iam.example.test',
    privateKey: Redacted.make(pem(pkcs8)),
    tokenUri,
  }
})

/** Expanded events as Google Calendar returns them for 2026-11-01..2026-11-22 with `singleEvents`. */
export const syntheticEvents = [
  {
    id: 'swim_20261102T220000Z',
    status: 'confirmed',
    summary: 'Swim lesson',
    location: 'Community pool',
    colorId: '7',
    start: { dateTime: '2026-11-02T17:00:00-05:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-11-02T18:00:00-05:00', timeZone: 'America/New_York' },
  },
  {
    id: 'visit',
    status: 'confirmed',
    summary: 'Grandparents visiting',
    colorId: '11',
    start: { date: '2026-11-05' },
    end: { date: '2026-11-08' },
  },
  {
    id: 'school-call',
    status: 'confirmed',
    summary: '  School call  ',
    start: { dateTime: '2026-11-03T15:00:00Z' },
    end: { dateTime: '2026-11-03T15:30:00Z' },
  },
  {
    id: 'swim_20261109T220000Z',
    status: 'cancelled',
    summary: 'Swim lesson',
    colorId: '7',
    start: { dateTime: '2026-11-09T17:00:00-05:00' },
    end: { dateTime: '2026-11-09T18:00:00-05:00' },
  },
  {
    id: 'untitled',
    status: 'confirmed',
    colorId: '42',
    start: { dateTime: '2026-11-06T17:00:00Z' },
    end: { dateTime: '2026-11-06T18:00:00Z' },
  },
]

/** A Google sign-in and Calendar backend that answers with the synthetic events. */
export const googleResponse = (url: URL): RecordingHttpResponse => {
  if (url.toString() === tokenUri) {
    return { status: 200, body: { access_token: accessToken, expires_in: 3599, token_type: 'Bearer' } }
  }
  if (url.hostname === 'www.googleapis.com' && url.pathname === eventsPath) {
    return { status: 200, body: { kind: 'calendar#events', items: syntheticEvents } }
  }
  return { status: 404, body: { error: { code: 404, message: 'Not Found', status: 'NOT_FOUND' } } }
}
