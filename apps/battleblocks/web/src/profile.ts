import { DeviceSession, DeviceLinkResponse, LeaderboardResponse, PlayerProfile } from '@garage/battleblocks-domain'
import type { RatingDelta, ServerMessage, QueueServerMessage } from '@garage/battleblocks-domain'
import * as Fn from 'effect/Function'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

const normalize = (code: string) => Str.toUpperCase(Str.trim(code))
export function readLinkCodeFromSearch(search: string) {
  const code = normalize(new URLSearchParams(search).get('link') ?? '')
  return /^[A-Z0-9]{6}$/u.test(code) ? code : undefined
}
export const buildDeviceLinkUrl: {
  (location: string, code: string): string
  (code: string): (location: string) => string
} = Fn.dual(2, (location: string, code: string) => {
  const url = new URL(location)
  url.search = ''
  url.hash = ''
  url.searchParams.set('link', normalize(code))
  return url.href
})
export const formatRatingDelta = ({ before, after, delta }: RatingDelta) =>
  before + ' → ' + after + ' (' + (delta >= 0 ? '+' : '') + delta + ' Elo)'
type Deadline = (typeof ServerMessage.cases.RoomSnapshot.Type)['turnDeadlineMs']
export const formatTurnCountdown: {
  (deadlineMs: Deadline, nowMs: number): string
  (nowMs: number): (deadlineMs: Deadline) => string
} = Fn.dual(2, (deadlineMs: (typeof ServerMessage.cases.RoomSnapshot.Type)['turnDeadlineMs'], nowMs: number) =>
  typeof deadlineMs !== 'number' ? '' : Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000)) + 's'
)
export function formatQueuePopulation(waitingCount: number) {
  const others = waitingCount - 1
  if (others <= 0) {
    return 'No other players in the ranked queue.'
  }
  return others === 1 ? '1 other player in the ranked queue.' : others + ' other players in the ranked queue.'
}

export const formatQueueWindow = (window: (typeof QueueServerMessage.cases.Queued.Type)['window']) =>
  window === null ? 'Any Elo' : '±' + window + ' Elo'
export const formatStreak = (streak: number) =>
  streak >= 2 ? streak + 'W' : streak <= -2 ? Math.abs(streak) + 'L' : '—'

const storageKey = 'battleblocks.session.v1'
const codec = S.fromJsonString(DeviceSession)
const profileResponse = S.Struct({ profile: PlayerProfile })
const bodyCodec = S.fromJsonString(S.Record(S.String, S.String))
type Failure = { ok: false; message: string }
const failure = (message: string): Failure => ({ ok: false, message })
class ProfileRequestError extends S.TaggedError<ProfileRequestError, { readonly brand: unique symbol }>()(
  'ProfileRequestError',
  { status: S.Int }
) {}
function request<A extends S.ConstraintDecoder<unknown, never>>(
  path: string,
  schema: A,
  method = 'GET',
  body?: Record<string, string>,
  token?: string
) {
  const headers = new Headers()
  if (token !== undefined) {
    headers.set('Authorization', 'Bearer ' + token)
  }
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
    const encoded = S.encodeOption(bodyCodec)(body)
    if (Option.isNone(encoded)) {
      return Promise.reject(new Error('Invalid profile request.'))
    }
    init.body = encoded.value
  }
  return window
    .fetch('/api/' + path, init)
    .then((response) => {
      if (!response.ok) {
        throw ProfileRequestError.make({ status: response.status })
      }
      return response.text()
    })
    .then((text) => {
      const decoded = S.decodeOption(S.fromJsonString(schema))(text)
      if (Option.isNone(decoded)) {
        throw new Error('Invalid profile response.')
      }
      return decoded.value
    })
}
const success = (profile: PlayerProfile) => ({ ok: true as const, profile })
type ProfileState = { session?: DeviceSession }
export function createProfileStore() {
  const state: ProfileState = {}
  function save(value: DeviceSession) {
    state.session = value
    try {
      Option.map(S.encodeOption(codec)(value), (text) => localStorage.setItem(storageKey, text))
    } catch {
      // Keep the session in memory when browser storage is unavailable.
    }
    return value.profile
  }
  function loadProfile(method = 'GET', body?: Record<string, string>) {
    const token = state.session?.token
    if (token === undefined) {
      return Promise.reject(new Error('Profile unavailable.'))
    }
    return request('profile', profileResponse, method, body, token).then(({ profile }) => {
      if (token !== state.session?.token) {
        throw new Error('Profile changed.')
      }
      return save({ token, profile })
    })
  }
  function claimDeviceLink(code: string) {
    return request('profile/claim', DeviceSession, 'POST', { code: normalize(code) }).then(
      (value) => success(save(value)),
      (error: unknown) =>
        failure(
          S.is(ProfileRequestError)(error) && [404, 410].includes(error.status)
            ? 'Device link code expired or already used.'
            : 'Could not sync this device. Try again.'
        )
    )
  }
  const register = () => request('profile/register', DeviceSession, 'POST', {}).then(save)
  function loadSaved(notice: string) {
    try {
      const saved = S.decodeUnknownOption(codec)(localStorage.getItem(storageKey))
      if (Option.isSome(saved)) {
        state.session = saved.value
      } else {
        delete state.session
      }
    } catch {
      delete state.session
    }
    const load =
      state.session === undefined
        ? register()
        : loadProfile().catch((error: unknown) => {
            if (S.is(ProfileRequestError)(error) && error.status === 401) {
              delete state.session
              return register()
            }
            throw error
          })
    return load.then(
      (profile) => ({ profile: Option.some(profile), notice }),
      () => ({
        profile: Option.fromNullishOr(state.session?.profile),
        notice: notice || 'Profile unavailable. Bot practice is ready.',
      })
    )
  }
  return {
    current: () => Option.fromNullishOr(state.session),
    claimDeviceLink,
    init() {
      const url = new URL(location.href)
      const code = readLinkCodeFromSearch(url.search)
      if (code === undefined) {
        return loadSaved('')
      }
      url.searchParams.delete('link')
      history.replaceState(history.state, '', url)
      return claimDeviceLink(code).then((result) =>
        result.ok
          ? { profile: Option.some(result.profile), notice: 'Linked profile ' + result.profile.callsign + '!' }
          : loadSaved(result.message)
      )
    },
    refresh: () => loadProfile().then(Option.some, () => Option.none<PlayerProfile>()),
    updateCallsign: (callsign: string) =>
      loadProfile('PATCH', { callsign: Str.trim(callsign) }).then(success, () => failure('Could not save callsign.')),
    createDeviceLink: () =>
      request('profile/link', DeviceLinkResponse, 'POST', undefined, state.session?.token).then(
        (link) => ({ ok: true as const, link }),
        () => failure('Could not create a device link.')
      ),
    fetchLeaderboard: () =>
      request('leaderboard', LeaderboardResponse, 'GET', undefined, state.session?.token).then(Option.some, () =>
        Option.none<LeaderboardResponse>()
      ),
  }
}
