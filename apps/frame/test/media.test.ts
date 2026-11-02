import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { MediaAction } from '#shared'

import type { EntityStateResponse } from '../src/home-assistant/api-schema.js'
import {
  authorizeMediaAction,
  mediaLayout,
  parseEntityList,
  parseMediaSlots,
  toMediaPlayer,
} from '../src/home-assistant/media.js'
import type { MediaConfig, MediaPlayerConfig } from '../src/home-assistant/media.js'

// TURN_ON + TURN_OFF + VOLUME_SET + VOLUME_STEP + VOLUME_MUTE + SELECT_SOURCE + PLAY_MEDIA + SOUND_MODE
const RECEIVER_FEATURES = 69_516

// PAUSE + PLAY + PREVIOUS + NEXT + VOLUME_SET + SELECT_SOURCE
const MUSIC_FEATURES = 18_485

const config: MediaConfig = {
  slots: [
    { _tag: 'Player', player: { entityId: 'media_player.den_tv', controls: Option.none() } },
    {
      _tag: 'Player',
      player: { entityId: 'media_player.receiver', controls: Option.some(['power', 'volume', 'mute']) },
    },
  ],
  zones: ['switch.zone_a'],
  allOn: Option.some('button.zones_on'),
  allOff: Option.none(),
  spotify: Option.some('media_player.music'),
}

const authorize = (action: MediaAction) => authorizeMediaAction(config, action)

describe('media configuration', () => {
  it('parses ordered players, control overrides, and the zone card position', () => {
    assert.deepStrictEqual(
      parseMediaSlots(' media_player.den_tv , zones, media_player.receiver=power+volume+mute '),
      Result.succeed([
        { _tag: 'Player', player: { entityId: 'media_player.den_tv', controls: Option.none() } },
        { _tag: 'Zones' },
        {
          _tag: 'Player',
          player: { entityId: 'media_player.receiver', controls: Option.some(['power', 'volume', 'mute']) },
        },
      ])
    )
    assert.deepStrictEqual(parseMediaSlots(''), Result.succeed([]))
  })

  it('rejects entities from other domains and unknown controls', () => {
    assert.isTrue(Result.isFailure(parseMediaSlots('switch.zone_a')))
    assert.isTrue(Result.isFailure(parseMediaSlots('media_player.den_tv=power+eject')))
    assert.isTrue(Result.isFailure(parseEntityList('switch.zone_a,light.lamp', 'switch')))
  })

  it('appends the zone card when zones exist but no position is given', () => {
    assert.deepStrictEqual(
      Array.from(mediaLayout(config), (slot) => slot._tag),
      ['Player', 'Player', 'Zones']
    )
    assert.deepStrictEqual(
      Array.from(mediaLayout({ ...config, zones: [], slots: [{ _tag: 'Zones' }] }), (slot) => slot._tag),
      []
    )
  })
})

describe('media players', () => {
  it('offers what Home Assistant supports, narrowed by the configured override', () => {
    const receiver = (controls: MediaPlayerConfig['controls']) =>
      toMediaPlayer(
        { entityId: 'media_player.receiver', controls },
        Option.some({
          entity_id: 'media_player.receiver',
          state: 'on',
          attributes: { supported_features: RECEIVER_FEATURES, source_list: ['AUX', 'NETWORK'] },
        })
      ).controls

    const music = toMediaPlayer(
      { entityId: 'media_player.music', controls: Option.none() },
      Option.some({
        entity_id: 'media_player.music',
        state: 'idle',
        attributes: { supported_features: MUSIC_FEATURES },
      })
    )

    assert.deepStrictEqual(receiver(Option.none()), ['power', 'volume', 'mute', 'source'])
    assert.deepStrictEqual(receiver(Option.some(['power', 'volume', 'mute'])), ['power', 'volume', 'mute'])
    assert.deepStrictEqual(music.controls, ['playback', 'volume'])
  })

  it.effect('maps state and hides the artwork URL behind a version', () =>
    Effect.gen(function* () {
      const state: EntityStateResponse = {
        entity_id: 'media_player.music',
        state: 'playing',
        attributes: {
          friendly_name: 'Music',
          supported_features: MUSIC_FEATURES,
          volume_level: 0.4,
          source_list: ['Kitchen speaker'],
          media_title: 'Song',
          media_artist: 'Band',
          entity_picture: '/api/media_player_proxy/media_player.music?token=art-token&cache=1',
        },
      }

      const player = toMediaPlayer({ entityId: 'media_player.music', controls: Option.none() }, Option.some(state))

      assert.strictEqual(player.status, 'playing')
      assert.isTrue(player.canSkip)
      assert.strictEqual(player.nowPlaying?.title, 'Song')
      const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(player)
      assert.notInclude(encoded, 'art-token')
      assert.isString(player.nowPlaying?.artVersion)
    })
  )

  it('shows a missing entity as unavailable with no controls', () => {
    const player = toMediaPlayer({ entityId: 'media_player.gone', controls: Option.none() }, Option.none())

    assert.strictEqual(player.status, 'unavailable')
    assert.deepStrictEqual(player.controls, [])
  })
})

describe('media action allowlist', () => {
  it('maps allowed actions to their Home Assistant service calls', () => {
    assert.deepStrictEqual(
      authorize({ _tag: 'SetMute', entityId: 'media_player.receiver', muted: true }),
      Result.succeed({
        domain: 'media_player',
        service: 'volume_mute',
        data: { entity_id: 'media_player.receiver', is_volume_muted: true },
      })
    )
    assert.deepStrictEqual(
      authorize({ _tag: 'SelectSource', entityId: 'media_player.music', source: 'Kitchen speaker' }),
      Result.succeed({
        domain: 'media_player',
        service: 'select_source',
        data: { entity_id: 'media_player.music', source: 'Kitchen speaker' },
      })
    )
    assert.deepStrictEqual(
      authorize({ _tag: 'ZoneOff', entityId: 'switch.zone_a' }),
      Result.succeed({ domain: 'switch', service: 'turn_off', data: { entity_id: 'switch.zone_a' } })
    )
    assert.deepStrictEqual(
      authorize({ _tag: 'AllZonesOn' }),
      Result.succeed({ domain: 'button', service: 'press', data: { entity_id: 'button.zones_on' } })
    )
  })

  it('refuses unconfigured entities, overridden controls, and missing buttons', () => {
    assert.isTrue(Result.isFailure(authorize({ _tag: 'TurnOn', entityId: 'media_player.garage' })))
    assert.isTrue(
      Result.isFailure(authorize({ _tag: 'SelectSource', entityId: 'media_player.receiver', source: 'AUX' }))
    )
    assert.isTrue(Result.isFailure(authorize({ _tag: 'ZoneOn', entityId: 'switch.porch_light' })))
    assert.isTrue(Result.isFailure(authorize({ _tag: 'AllZonesOff' })))
  })
})
