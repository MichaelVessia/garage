import * as Arr from 'effect/Array'
import * as Hash from 'effect/Hash'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

import type { MediaAction, MediaControl, MediaPlayer, MediaPlayerStatus, SpeakerZone } from '#shared'

import type { EntityStateResponse } from './api-schema.js'

// Media configuration, Home Assistant state mapping, and the allowlist for media changes.

/** A configured media player and, when set, the only controls it may offer. */
export interface MediaPlayerConfig {
  readonly entityId: string
  readonly controls: Option.Option<ReadonlyArray<MediaControl>>
}

/** A position on the Media screen: a player, or the speaker zone card. */
export type MediaSlot = { readonly _tag: 'Player'; readonly player: MediaPlayerConfig } | { readonly _tag: 'Zones' }

/** The Media screen's entities, all from the deployment environment. */
export interface MediaConfig {
  readonly slots: ReadonlyArray<MediaSlot>
  readonly zones: ReadonlyArray<string>
  readonly allOn: Option.Option<string>
  readonly allOff: Option.Option<string>
  readonly spotify: Option.Option<string>
}

const CONTROLS: ReadonlyArray<MediaControl> = ['power', 'playback', 'volume', 'mute', 'source']
const ZONES_SLOT = 'zones'

const isControl = (token: string): token is MediaControl => Arr.some(CONTROLS, (control) => control === token)

const splitList = (raw: string): ReadonlyArray<string> =>
  Arr.filter(
    Arr.map(raw.split(','), (entry) => entry.trim()),
    (entry) => entry !== ''
  )

const parseSlot = (entry: string): Result.Result<MediaSlot, string> => {
  if (entry === ZONES_SLOT) {
    return Result.succeed({ _tag: 'Zones' })
  }
  const [entityId = '', overrides] = entry.split('=')
  if (!entityId.startsWith('media_player.')) {
    return Result.fail(`"${entityId}" is not a media_player entity`)
  }
  if (overrides === undefined) {
    return Result.succeed({ _tag: 'Player', player: { entityId, controls: Option.none() } })
  }
  const tokens = Arr.filter(overrides.split('+'), (token) => token !== '')
  const unknown = Arr.filter(tokens, (token) => !isControl(token))
  return Arr.isReadonlyArrayNonEmpty(unknown)
    ? Result.fail(`unknown controls for ${entityId}: ${unknown.join(', ')}`)
    : Result.succeed({
        _tag: 'Player',
        player: { entityId, controls: Option.some(Arr.filter(CONTROLS, (control) => tokens.includes(control))) },
      })
}

/**
 * Parses `HOME_ASSISTANT_MEDIA_PLAYERS`: comma-separated entries in screen order. Each is
 * `media_player.x` or `media_player.x=power+volume+mute`; the literal `zones` places the speaker
 * zone card.
 */
export const parseMediaSlots = (raw: string): Result.Result<ReadonlyArray<MediaSlot>, string> =>
  Result.all(Arr.map(splitList(raw), parseSlot))

/** Parses a comma-separated list of entities that must all be in `domain`. */
export const parseEntityList = (raw: string, domain: string): Result.Result<ReadonlyArray<string>, string> => {
  const entities = splitList(raw)
  const foreign = Arr.filter(entities, (entity) => !entity.startsWith(`${domain}.`))
  return Arr.isReadonlyArrayNonEmpty(foreign)
    ? Result.fail(`not ${domain} entities: ${foreign.join(', ')}`)
    : Result.succeed(entities)
}

const isZones = (slot: MediaSlot) => Match.valueTags(slot, { Player: () => false, Zones: () => true })

/** The screen order, with the zone card appended when zones exist but no `zones` slot was given. */
export const mediaLayout = (config: MediaConfig): ReadonlyArray<MediaSlot> => {
  const hasZones = Arr.isReadonlyArrayNonEmpty(config.zones)
  const slots = Arr.filter(config.slots, (slot) => hasZones || !isZones(slot))
  return hasZones && !Arr.some(slots, isZones) ? [...slots, { _tag: 'Zones' }] : slots
}

// Home Assistant MediaPlayerEntityFeature bits.
const FEATURE = {
  pause: 1,
  volumeSet: 4,
  volumeMute: 8,
  previousTrack: 16,
  nextTrack: 32,
  turnOn: 128,
  turnOff: 256,
  volumeStep: 1024,
  selectSource: 2048,
  play: 16_384,
} as const

// Feature bits are powers of two, so a bit is set when its quotient is odd.
const supports = (features: number, ...bits: ReadonlyArray<number>) =>
  Arr.some(bits, (bit) => Math.floor(features / bit) % 2 === 1)

/** The controls a player offers: what Home Assistant supports, narrowed by any configured override. */
const controlsFor = (
  features: number,
  sources: ReadonlyArray<string>,
  override: Option.Option<ReadonlyArray<MediaControl>>
): ReadonlyArray<MediaControl> => {
  const supported = {
    power: supports(features, FEATURE.turnOn, FEATURE.turnOff),
    playback: supports(features, FEATURE.pause, FEATURE.play),
    volume: supports(features, FEATURE.volumeSet, FEATURE.volumeStep),
    mute: supports(features, FEATURE.volumeMute),
    source: supports(features, FEATURE.selectSource) && Arr.isReadonlyArrayNonEmpty(sources),
  } satisfies Record<MediaControl, boolean>
  return Arr.filter(
    CONTROLS,
    (control) =>
      supported[control] &&
      Option.match(override, { onNone: () => true, onSome: (allowed) => allowed.includes(control) })
  )
}

const statusOf = (state: string): MediaPlayerStatus =>
  Match.value(state).pipe(
    Match.whenOr('off', 'standby', (): MediaPlayerStatus => 'off'),
    Match.when('idle', (): MediaPlayerStatus => 'idle'),
    Match.when('playing', (): MediaPlayerStatus => 'playing'),
    Match.when('paused', (): MediaPlayerStatus => 'paused'),
    Match.whenOr('unavailable', 'unknown', (): MediaPlayerStatus => 'unavailable'),
    Match.orElse((): MediaPlayerStatus => 'on')
  )

// Artwork is served by the frame server; the browser only sees a version that changes with the track.
const artVersion = (picture: Option.Option<string>) =>
  Option.getOrNull(
    Option.map(
      Option.filter(picture, (value) => value !== ''),
      (value) => Math.abs(Hash.string(value)).toString(36)
    )
  )

/** A media card for a configured player; a missing entity shows as unavailable. */
export const toMediaPlayer = (player: MediaPlayerConfig, state: Option.Option<EntityStateResponse>): MediaPlayer =>
  Option.match(state, {
    onNone: (): MediaPlayer => ({
      entityId: player.entityId,
      name: player.entityId,
      status: 'unavailable',
      controls: [],
      canSkip: false,
      isMuted: false,
      volume: null,
      source: null,
      sources: [],
      nowPlaying: null,
    }),
    onSome: ({ state: raw, attributes }): MediaPlayer => {
      const features = attributes.supported_features ?? 0
      const sources = attributes.source_list ?? []
      const status = statusOf(raw)
      const title = attributes.media_title ?? null
      return {
        entityId: player.entityId,
        name: attributes.friendly_name ?? player.entityId,
        status,
        controls: controlsFor(features, sources, player.controls),
        canSkip: supports(features, FEATURE.previousTrack, FEATURE.nextTrack),
        isMuted: attributes.is_volume_muted ?? false,
        volume: attributes.volume_level ?? null,
        source: attributes.source ?? null,
        sources,
        nowPlaying:
          title === null || status === 'off' || status === 'unavailable'
            ? null
            : {
                title,
                artist: attributes.media_artist ?? null,
                artVersion: artVersion(Option.fromNullishOr(attributes.entity_picture)),
              },
      }
    },
  })

/** A speaker zone switch; a missing entity shows as unavailable. */
export const toSpeakerZone = (entityId: string, state: Option.Option<EntityStateResponse>): SpeakerZone =>
  Option.match(state, {
    onNone: (): SpeakerZone => ({ entityId, name: entityId, isOn: false, isAvailable: false }),
    onSome: ({ state: raw, attributes }): SpeakerZone => ({
      entityId,
      name: attributes.friendly_name ?? entityId,
      isOn: raw === 'on',
      isAvailable: raw !== 'unavailable' && raw !== 'unknown',
    }),
  })

/** One Home Assistant service call. */
export interface ServiceCall {
  readonly domain: 'media_player' | 'switch' | 'button'
  readonly service: string
  readonly data: Readonly<Record<string, string | boolean>>
}

const playerConfigs = (config: MediaConfig): ReadonlyArray<MediaPlayerConfig> => [
  ...Arr.filterMap(config.slots, (slot) =>
    Match.valueTags(slot, {
      Player: ({ player }): Result.Result<MediaPlayerConfig, void> => Result.succeed(player),
      Zones: (): Result.Result<MediaPlayerConfig, void> => Result.failVoid,
    })
  ),
  ...Arr.map(Option.toArray(config.spotify), (entityId) => ({ entityId, controls: Option.none() })),
]

const playerCall = (
  config: MediaConfig,
  entityId: string,
  control: MediaControl,
  service: string,
  data: Readonly<Record<string, string | boolean>> = {}
): Result.Result<ServiceCall, string> =>
  Option.match(
    Arr.findFirst(playerConfigs(config), (player) => player.entityId === entityId),
    {
      onNone: () => Result.fail(`${entityId} is not a configured media player`),
      onSome: (player) =>
        Option.exists(player.controls, (allowed) => !allowed.includes(control))
          ? Result.fail(`${control} is not enabled for ${entityId}`)
          : Result.succeed({ domain: 'media_player', service, data: { entity_id: entityId, ...data } }),
    }
  )

const zoneCall = (config: MediaConfig, entityId: string, service: string): Result.Result<ServiceCall, string> =>
  config.zones.includes(entityId)
    ? Result.succeed({ domain: 'switch', service, data: { entity_id: entityId } })
    : Result.fail(`${entityId} is not a configured speaker zone`)

const buttonCall = (button: Option.Option<string>, label: string): Result.Result<ServiceCall, string> =>
  Option.match(button, {
    onNone: () => Result.fail(`no ${label} button is configured`),
    onSome: (entityId) => Result.succeed({ domain: 'button', service: 'press', data: { entity_id: entityId } }),
  })

/** Maps a requested media change to its service call, or explains why it is not allowed. */
export const authorizeMediaAction = (config: MediaConfig, action: MediaAction): Result.Result<ServiceCall, string> =>
  Match.valueTags(action, {
    TurnOn: ({ entityId }) => playerCall(config, entityId, 'power', 'turn_on'),
    TurnOff: ({ entityId }) => playerCall(config, entityId, 'power', 'turn_off'),
    PlayPause: ({ entityId }) => playerCall(config, entityId, 'playback', 'media_play_pause'),
    PreviousTrack: ({ entityId }) => playerCall(config, entityId, 'playback', 'media_previous_track'),
    NextTrack: ({ entityId }) => playerCall(config, entityId, 'playback', 'media_next_track'),
    VolumeUp: ({ entityId }) => playerCall(config, entityId, 'volume', 'volume_up'),
    VolumeDown: ({ entityId }) => playerCall(config, entityId, 'volume', 'volume_down'),
    SetMute: ({ entityId, muted }) => playerCall(config, entityId, 'mute', 'volume_mute', { is_volume_muted: muted }),
    SelectSource: ({ entityId, source }) => playerCall(config, entityId, 'source', 'select_source', { source }),
    ZoneOn: ({ entityId }) => zoneCall(config, entityId, 'turn_on'),
    ZoneOff: ({ entityId }) => zoneCall(config, entityId, 'turn_off'),
    AllZonesOn: () => buttonCall(config.allOn, 'all-zones-on'),
    AllZonesOff: () => buttonCall(config.allOff, 'all-zones-off'),
  })

/** Whether artwork may be proxied for this entity: only configured media players. */
export const isArtworkEntity = (config: MediaConfig, entityId: string): boolean =>
  Arr.some(playerConfigs(config), (player) => player.entityId === entityId)

// Home Assistant serves player artwork through its media player proxy; nothing else is fetched.
const ARTWORK_PREFIX = '/api/media_player_proxy/'

/** The Home Assistant path to fetch artwork from, if the entity reports proxied artwork. */
export const artworkPath = (state: EntityStateResponse): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(state.attributes.entity_picture), (picture) => picture.startsWith(ARTWORK_PREFIX))
