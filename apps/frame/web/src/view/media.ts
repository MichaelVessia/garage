import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'
import type { Html } from 'foldkit/html'

import { MediaAction } from '#shared'
import type { MediaCard, MediaPlayer, MediaPlayerStatus, SpeakerZones } from '#shared'

import { icon } from '../icons.js'
import type { IconName } from '../icons.js'
import type { Model } from '../main.js'
import { Message } from '../message.js'
import type { H } from './shared.js'
import { classes, viewNotice } from './shared.js'

const STATUS_LABEL = {
  off: 'Off',
  on: 'On',
  idle: 'Idle',
  playing: 'Playing',
  paused: 'Paused',
  unavailable: 'Not available',
} satisfies Record<MediaPlayerStatus, string>

const mediaButton = (
  h: H,
  name: IconName,
  label: string,
  action: MediaAction,
  options: { readonly isDisabled: boolean; readonly state?: 'on' | 'pressed' | 'primary' }
) =>
  h.button(
    [
      h.Class(options.state === undefined ? 'icon-btn' : `icon-btn is-${options.state}`),
      h.Type('button'),
      h.AriaLabel(label),
      h.Disabled(options.isDisabled),
      h.OnClick(Message.ClickedMediaAction({ action })),
    ],
    [icon(h, name)]
  )

// A native select: Android shows its own picker, which suits a touch screen.
const viewSourceSelect = (h: H, label: string, placeholder: string, player: MediaPlayer, isDisabled: boolean) =>
  h.select(
    [
      h.Class('field source'),
      h.AriaLabel(label),
      h.Disabled(isDisabled),
      h.OnChange((source) =>
        // The placeholder option has no source to select.
        source === ''
          ? Message.Interacted()
          : Message.ClickedMediaAction({
              action: MediaAction.cases.SelectSource.make({ entityId: player.entityId, source }),
            })
      ),
    ],
    [
      h.option([h.Value(''), h.Selected(player.source === null)], [placeholder]),
      ...Arr.map(player.sources, (source) =>
        h.option([h.Value(source), h.Selected(player.source === source)], [source])
      ),
    ]
  )

const viewSourcePicker = (h: H, label: string, player: MediaPlayer, isDisabled: boolean) =>
  h.label(
    [h.Class('picker')],
    [h.span([h.Class('picker-label')], [label]), viewSourceSelect(h, label, 'Choose a speaker', player, isDisabled)]
  )

const viewPlayerControls = (h: H, player: MediaPlayer, isDisabled: boolean) => {
  const { entityId } = player
  const has = (control: MediaPlayer['controls'][number]) => player.controls.includes(control)
  const isPlaying = player.status === 'playing'
  const isOn = player.status !== 'off' && player.status !== 'unavailable'

  const controls: Array<Html> = []

  if (has('power')) {
    controls.push(
      isOn
        ? mediaButton(h, 'power', 'Turn off', MediaAction.cases.TurnOff.make({ entityId }), { isDisabled, state: 'on' })
        : mediaButton(h, 'power', 'Turn on', MediaAction.cases.TurnOn.make({ entityId }), { isDisabled })
    )
  }

  if (has('playback')) {
    if (player.canSkip) {
      controls.push(
        mediaButton(h, 'previous', 'Previous', MediaAction.cases.PreviousTrack.make({ entityId }), { isDisabled })
      )
    }

    controls.push(
      isPlaying
        ? mediaButton(h, 'pause', 'Pause', MediaAction.cases.PlayPause.make({ entityId }), { isDisabled, state: 'on' })
        : mediaButton(h, 'play', 'Play', MediaAction.cases.PlayPause.make({ entityId }), { isDisabled })
    )

    if (player.canSkip) {
      controls.push(mediaButton(h, 'next', 'Next', MediaAction.cases.NextTrack.make({ entityId }), { isDisabled }))
    }
  }

  if (has('volume')) {
    controls.push(
      mediaButton(h, 'volumeDown', 'Volume down', MediaAction.cases.VolumeDown.make({ entityId }), { isDisabled }),
      mediaButton(h, 'volumeUp', 'Volume up', MediaAction.cases.VolumeUp.make({ entityId }), { isDisabled })
    )
  }

  if (has('mute')) {
    controls.push(
      player.isMuted
        ? mediaButton(h, 'muted', 'Unmute', MediaAction.cases.SetMute.make({ entityId, muted: false }), {
            isDisabled,
            state: 'pressed',
          })
        : mediaButton(h, 'muted', 'Mute', MediaAction.cases.SetMute.make({ entityId, muted: true }), { isDisabled })
    )
  }

  return h.div([h.Class('controls')], controls)
}

const volumeLabel = (player: MediaPlayer): ReadonlyArray<string> =>
  player.volume === null || !player.controls.includes('volume') ? [] : [` · ${Math.round(player.volume * 100)}%`]

const deviceIcon = (player: MediaPlayer): IconName => {
  const name = Str.toLowerCase(`${player.entityId} ${player.name}`)

  if (Str.includes('tv')(name)) {
    return 'media'
  }

  return Str.includes('receiver')(name) || Str.includes('onkyo')(name) ? 'receiver' : 'speaker'
}

const stateClass = (player: MediaPlayer): string =>
  Match.value(player.status).pipe(
    Match.when('playing', () => 'is-playing'),
    Match.when('unavailable', () => 'is-unavailable'),
    Match.when('off', () => 'is-off'),
    Match.orElse(() => 'is-on')
  )

const viewPlayerCard = (h: H, player: MediaPlayer, isWide: boolean) => {
  const isDisabled = player.status === 'unavailable'

  const statusChildren: ReadonlyArray<string> =
    player.nowPlaying === null
      ? isWide
        ? [STATUS_LABEL[player.status]]
        : [STATUS_LABEL[player.status], ...volumeLabel(player)]
      : [player.nowPlaying.title]

  const headChildren: Array<Html> = [
    h.span([h.Class('tile-icon')], [icon(h, deviceIcon(player))]),
    h.span(
      [h.Class('tile-text')],
      [h.h2([h.Class('tile-name')], [player.name]), h.span([h.Class('status num')], statusChildren)]
    ),
  ]

  if (player.controls.includes('source')) {
    headChildren.push(viewSourceSelect(h, 'Source', 'Source…', player, isDisabled))
  }

  const cardChildren: Array<Html> = [h.div([h.Class('tile-head')], headChildren)]

  if (isWide && player.volume !== null && player.controls.includes('volume')) {
    cardChildren.push(h.span([h.Class('tile-volume num')], [`${Math.round(player.volume * 100)}%`]))
  }

  cardChildren.push(viewPlayerControls(h, player, isDisabled))

  return h.section(
    [h.Key(player.entityId), h.Class(classes('card tile', stateClass(player), isWide && 'is-wide'))],
    cardChildren
  )
}

const viewSpeakers = (h: H, speakers: SpeakerZones) => {
  const allButtons: Array<Html> = []

  if (speakers.hasAllOn) {
    allButtons.push(
      h.button(
        [
          h.Class('btn'),
          h.Type('button'),
          h.OnClick(Message.ClickedMediaAction({ action: MediaAction.cases.AllZonesOn.make({}) })),
        ],
        ['All on']
      )
    )
  }

  if (speakers.hasAllOff) {
    allButtons.push(
      h.button(
        [
          h.Class('btn'),
          h.Type('button'),
          h.OnClick(Message.ClickedMediaAction({ action: MediaAction.cases.AllZonesOff.make({}) })),
        ],
        ['All off']
      )
    )
  }

  return h.section(
    [h.Key('speaker-zones'), h.Class('card zones')],
    [
      h.div(
        [h.Class('zones-head')],
        [
          h.span([h.Class('tile-icon')], [icon(h, 'speaker')]),
          h.h2([h.Class('tile-name')], ['Speakers']),
          h.div([h.Class('zones-all')], allButtons),
        ]
      ),
      h.ul(
        [h.Class('zone-list')],
        Arr.map(speakers.zones, (zone) =>
          h.li(
            [h.Key(zone.entityId)],
            [
              h.button(
                [
                  h.Type('button'),
                  h.Class(zone.isOn ? 'switch is-on' : 'switch'),
                  h.Role('switch'),
                  h.AriaChecked(zone.isOn),
                  h.Disabled(!zone.isAvailable),
                  h.OnClick(
                    Message.ClickedMediaAction({
                      action: zone.isOn
                        ? MediaAction.cases.ZoneOff.make({ entityId: zone.entityId })
                        : MediaAction.cases.ZoneOn.make({ entityId: zone.entityId }),
                    })
                  ),
                ],
                [
                  h.span([h.Class('switch-name')], [zone.name]),
                  h.span([h.Class('switch-track')], [h.span([h.Class('switch-thumb')], [])]),
                ]
              ),
            ]
          )
        )
      ),
    ]
  )
}

const isZonesCard = (card: MediaCard): boolean =>
  Match.value(card).pipe(
    Match.tag('ZonesCard', () => true),
    Match.orElse(() => false)
  )

// Device tiles pair up two per row; the last tile of an odd run spans the row so no cell is left empty.
const viewMediaCards = (h: H, cards: ReadonlyArray<MediaCard>) =>
  Arr.map(cards, (card, index) =>
    Match.valueTags(card, {
      PlayerCard: ({ player }) => {
        const runStart = Arr.findLastIndex(Arr.take(cards, index), isZonesCard)
        const positionInRun = index - (Option.getOrElse(runStart, () => -1) + 1)
        const nextIsPlayer = Option.exists(Arr.get(cards, index + 1), (other) => !isZonesCard(other))

        return viewPlayerCard(h, player, positionInRun % 2 === 0 && !nextIsPlayer)
      },
      ZonesCard: ({ speakers }) => viewSpeakers(h, speakers),
    })
  )

const viewSpotify = (h: H, player: MediaPlayer) => {
  const isDisabled = player.status === 'unavailable'
  const { entityId, nowPlaying } = player
  const isPlaying = player.status === 'playing'

  const spotifyControls: Array<Html> = [
    h.div(
      [h.Class('controls')],
      [
        mediaButton(h, 'previous', 'Previous', MediaAction.cases.PreviousTrack.make({ entityId }), { isDisabled }),
        mediaButton(
          h,
          isPlaying ? 'pause' : 'play',
          isPlaying ? 'Pause' : 'Play',
          MediaAction.cases.PlayPause.make({ entityId }),
          { isDisabled, state: 'primary' }
        ),
        mediaButton(h, 'next', 'Next', MediaAction.cases.NextTrack.make({ entityId }), { isDisabled }),
        mediaButton(h, 'volumeDown', 'Volume down', MediaAction.cases.VolumeDown.make({ entityId }), { isDisabled }),
        mediaButton(h, 'volumeUp', 'Volume up', MediaAction.cases.VolumeUp.make({ entityId }), { isDisabled }),
      ]
    ),
  ]

  if (Arr.isReadonlyArrayNonEmpty(player.sources)) {
    spotifyControls.push(viewSourcePicker(h, 'Play on', player, isDisabled))
  }

  return h.section(
    [h.Key(entityId), h.Class('card spotify')],
    [
      nowPlaying === null || nowPlaying.artVersion === null
        ? h.div([h.Class('art is-empty')], [icon(h, 'music', 'art-icon')])
        : h.img([
            h.Class('art'),
            h.Src(`/media/art/${encodeURIComponent(entityId)}?v=${nowPlaying.artVersion}`),
            h.Alt(''),
          ]),
      h.div(
        [h.Class('spotify-main')],
        [
          h.div(
            [h.Class('spotify-text')],
            [
              h.p([h.Class('spotify-title')], [nowPlaying === null ? 'Nothing playing' : nowPlaying.title]),
              h.p(
                [h.Class('spotify-artist')],
                [
                  nowPlaying === null || nowPlaying.artist === null ? player.name : nowPlaying.artist,
                  ...volumeLabel(player),
                ]
              ),
            ]
          ),
          h.div([h.Class('spotify-controls')], spotifyControls),
        ]
      ),
    ]
  )
}

export const viewMedia: {
  (model: Model): (h: H) => Html
  (h: H, model: Model): Html
} = Function.dual(2, (h: H, model: Model): Html =>
  h.div(
    [h.Class('screen media')],
    [
      h.header([h.Class('toolbar')], [h.h1([h.Class('screen-title')], ['Media'])]),
      Option.match(model.media.data, {
        onNone: () => viewNotice(h, model.media.failed ? 'Media unavailable' : 'Loading media…'),
        onSome: (snapshot) => {
          if (snapshot.spotify === null && !Arr.isReadonlyArrayNonEmpty(snapshot.cards)) {
            return viewNotice(h, 'No media configured')
          }

          const gridChildren: Array<Html> = []

          if (snapshot.spotify !== null) {
            gridChildren.push(viewSpotify(h, snapshot.spotify))
          }

          gridChildren.push(...viewMediaCards(h, snapshot.cards))

          return h.div([h.Class('media-grid')], gridChildren)
        },
      }),
    ]
  )
)
