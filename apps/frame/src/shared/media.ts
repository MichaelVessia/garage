import * as Schema from 'effect/Schema'

/** Control groups a media card can offer. */
const MediaControl = Schema.Literals(['power', 'playback', 'volume', 'mute', 'source'])

/** Control groups a media card can offer. */
export type MediaControl = typeof MediaControl.Type

/** What a media player is doing, as the frame shows it. */
const MediaPlayerStatus = Schema.Literals(['off', 'on', 'idle', 'playing', 'paused', 'unavailable'])

/** What a media player is doing, as the frame shows it. */
export type MediaPlayerStatus = typeof MediaPlayerStatus.Type

/** The track a player reports. `artVersion` changes when the artwork does; null means no artwork. */
const NowPlaying = Schema.Struct({
  title: Schema.String,
  artist: Schema.NullOr(Schema.String),
  artVersion: Schema.NullOr(Schema.String),
})

/** One configured Home Assistant media player. */
const MediaPlayer = Schema.Struct({
  entityId: Schema.String,
  name: Schema.String,
  status: MediaPlayerStatus,
  controls: Schema.Array(MediaControl),
  canSkip: Schema.Boolean,
  isMuted: Schema.Boolean,
  volume: Schema.NullOr(Schema.Finite),
  source: Schema.NullOr(Schema.String),
  sources: Schema.Array(Schema.String),
  nowPlaying: Schema.NullOr(NowPlaying),
})

/** One configured Home Assistant media player. */
export type MediaPlayer = typeof MediaPlayer.Type

/** One speaker zone switch. */
const SpeakerZone = Schema.Struct({
  entityId: Schema.String,
  name: Schema.String,
  isOn: Schema.Boolean,
  isAvailable: Schema.Boolean,
})

/** One speaker zone switch. */
export type SpeakerZone = typeof SpeakerZone.Type

/** The speaker zone card: its switches and whether all-on and all-off buttons are configured. */
const SpeakerZones = Schema.Struct({
  zones: Schema.Array(SpeakerZone),
  hasAllOn: Schema.Boolean,
  hasAllOff: Schema.Boolean,
})

/** The speaker zone card. */
export type SpeakerZones = typeof SpeakerZones.Type

/** One card on the Media screen, in configured order. */
const MediaCard = Schema.TaggedUnion({
  PlayerCard: { player: MediaPlayer },
  ZonesCard: { speakers: SpeakerZones },
})

/** One card on the Media screen, in configured order. */
export type MediaCard = typeof MediaCard.Type

/** Everything the Media screen shows. */
export class MediaSnapshot extends Schema.Class<MediaSnapshot, { readonly brand: unique symbol }>('MediaSnapshot')({
  spotify: Schema.NullOr(MediaPlayer),
  cards: Schema.Array(MediaCard),
}) {}

const Entity = { entityId: Schema.String }

/**
 * The only media changes the frame may request. The server also checks each one against the
 * configured entities and their allowed controls.
 */
export const MediaAction = Schema.TaggedUnion({
  TurnOn: Entity,
  TurnOff: Entity,
  PlayPause: Entity,
  PreviousTrack: Entity,
  NextTrack: Entity,
  VolumeUp: Entity,
  VolumeDown: Entity,
  SetMute: { ...Entity, muted: Schema.Boolean },
  SelectSource: { ...Entity, source: Schema.NonEmptyString },
  ZoneOn: Entity,
  ZoneOff: Entity,
  AllZonesOn: {},
  AllZonesOff: {},
})

/** A media change the frame may request. */
export type MediaAction = typeof MediaAction.Type
