import * as Match from 'effect/Match'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { Message } from './message.js'

// Line icons from Lucide (lucide-static 1.66.0, ISC licence), drawn at 24 × 24 with a 2 px stroke.
type IconStroke =
  | { readonly _tag: 'path'; readonly d: string }
  | {
      readonly _tag: 'rect'
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
      readonly rx: number
    }
  | { readonly _tag: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }

const ICONS = {
  today: [
    { _tag: 'path', d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' },
    {
      _tag: 'path',
      d: 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    },
  ],
  calendar: [
    { _tag: 'path', d: 'M8 2v3' },
    { _tag: 'path', d: 'M16 2v3' },
    { _tag: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2 },
    { _tag: 'path', d: 'M3 9h18' },
    { _tag: 'path', d: 'M8 13h.01' },
    { _tag: 'path', d: 'M12 13h.01' },
    { _tag: 'path', d: 'M16 13h.01' },
    { _tag: 'path', d: 'M8 17h.01' },
    { _tag: 'path', d: 'M12 17h.01' },
    { _tag: 'path', d: 'M16 17h.01' },
  ],
  shopping: [
    { _tag: 'path', d: 'M13 5h8' },
    { _tag: 'path', d: 'M13 12h8' },
    { _tag: 'path', d: 'M13 19h8' },
    { _tag: 'path', d: 'm3 17 2 2 4-4' },
    { _tag: 'path', d: 'm3 7 2 2 4-4' },
  ],
  media: [
    { _tag: 'path', d: 'm17 2-5 5-5-5' },
    { _tag: 'rect', x: 2, y: 7, width: 20, height: 15, rx: 2 },
  ],
  chevronLeft: [{ _tag: 'path', d: 'm15 18-6-6 6-6' }],
  chevronRight: [{ _tag: 'path', d: 'm9 18 6-6-6-6' }],
  plus: [
    { _tag: 'path', d: 'M5 12h14' },
    { _tag: 'path', d: 'M12 5v14' },
  ],
  check: [{ _tag: 'path', d: 'M20 6 9 17l-5-5' }],
  play: [{ _tag: 'path', d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' }],
  pause: [
    { _tag: 'rect', x: 14, y: 3, width: 5, height: 18, rx: 1 },
    { _tag: 'rect', x: 5, y: 3, width: 5, height: 18, rx: 1 },
  ],
  previous: [
    { _tag: 'path', d: 'M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z' },
    { _tag: 'path', d: 'M3 20V4' },
  ],
  next: [
    { _tag: 'path', d: 'M21 4v16' },
    { _tag: 'path', d: 'M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z' },
  ],
  volumeDown: [
    {
      _tag: 'path',
      d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z',
    },
    { _tag: 'path', d: 'M16 9a5 5 0 0 1 0 6' },
  ],
  volumeUp: [
    {
      _tag: 'path',
      d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z',
    },
    { _tag: 'path', d: 'M16 9a5 5 0 0 1 0 6' },
    { _tag: 'path', d: 'M19.364 18.364a9 9 0 0 0 0-12.728' },
  ],
  muted: [
    {
      _tag: 'path',
      d: 'M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z',
    },
    { _tag: 'path', d: 'm16.5 14.5 5-5' },
    { _tag: 'path', d: 'm16.5 9.5 5 5' },
  ],
  power: [
    { _tag: 'path', d: 'M12 2v10' },
    { _tag: 'path', d: 'M18.4 6.6a9 9 0 1 1-12.77.04' },
  ],
  speaker: [
    { _tag: 'rect', x: 4, y: 2, width: 16, height: 20, rx: 2 },
    { _tag: 'path', d: 'M12 6h.01' },
    { _tag: 'circle', cx: 12, cy: 14, r: 4 },
    { _tag: 'path', d: 'M12 14h.01' },
  ],
  music: [
    { _tag: 'path', d: 'M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19' },
    { _tag: 'circle', cx: 18, cy: 16, r: 3 },
    { _tag: 'circle', cx: 6, cy: 19, r: 3 },
  ],
  receiver: [
    { _tag: 'path', d: 'M16.247 7.761a6 6 0 0 1 0 8.478' },
    { _tag: 'path', d: 'M19.075 4.933a10 10 0 0 1 0 14.134' },
    { _tag: 'path', d: 'M4.925 19.067a10 10 0 0 1 0-14.134' },
    { _tag: 'path', d: 'M7.753 16.239a6 6 0 0 1 0-8.478' },
    { _tag: 'circle', cx: 12, cy: 12, r: 2 },
  ],
  sun: [
    { _tag: 'circle', cx: 12, cy: 12, r: 4 },
    { _tag: 'path', d: 'M12 2v2' },
    { _tag: 'path', d: 'M12 20v2' },
    { _tag: 'path', d: 'm4.93 4.93 1.41 1.41' },
    { _tag: 'path', d: 'm17.66 17.66 1.41 1.41' },
    { _tag: 'path', d: 'M2 12h2' },
    { _tag: 'path', d: 'M20 12h2' },
    { _tag: 'path', d: 'm6.34 17.66-1.41 1.41' },
    { _tag: 'path', d: 'm19.07 4.93-1.41 1.41' },
  ],
  partlyCloudy: [
    { _tag: 'path', d: 'M12 2v2' },
    { _tag: 'path', d: 'm4.93 4.93 1.41 1.41' },
    { _tag: 'path', d: 'M20 12h2' },
    { _tag: 'path', d: 'm19.07 4.93-1.41 1.41' },
    { _tag: 'path', d: 'M15.947 12.65a4 4 0 0 0-5.925-4.128' },
    { _tag: 'path', d: 'M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z' },
  ],
  cloud: [{ _tag: 'path', d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' }],
  rain: [
    { _tag: 'path', d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242' },
    { _tag: 'path', d: 'M16 14v6' },
    { _tag: 'path', d: 'M8 14v6' },
    { _tag: 'path', d: 'M12 16v6' },
  ],
  drizzle: [
    { _tag: 'path', d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242' },
    { _tag: 'path', d: 'M8 19v1' },
    { _tag: 'path', d: 'M8 14v1' },
    { _tag: 'path', d: 'M16 19v1' },
    { _tag: 'path', d: 'M16 14v1' },
    { _tag: 'path', d: 'M12 21v1' },
    { _tag: 'path', d: 'M12 16v1' },
  ],
  snow: [
    { _tag: 'path', d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242' },
    { _tag: 'path', d: 'M8 15h.01' },
    { _tag: 'path', d: 'M8 19h.01' },
    { _tag: 'path', d: 'M12 17h.01' },
    { _tag: 'path', d: 'M12 21h.01' },
    { _tag: 'path', d: 'M16 15h.01' },
    { _tag: 'path', d: 'M16 19h.01' },
  ],
  storm: [
    { _tag: 'path', d: 'M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973' },
    { _tag: 'path', d: 'm13 12-3 5h4l-3 5' },
  ],
  fog: [
    { _tag: 'path', d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242' },
    { _tag: 'path', d: 'M16 17H7' },
    { _tag: 'path', d: 'M17 21H9' },
  ],
  wind: [
    { _tag: 'path', d: 'M12.8 19.6A2 2 0 1 0 14 16H2' },
    { _tag: 'path', d: 'M17.5 8a2.5 2.5 0 1 1 2 4H2' },
    { _tag: 'path', d: 'M9.8 4.4A2 2 0 1 1 11 8H2' },
  ],
  moon: [
    {
      _tag: 'path',
      d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
    },
  ],
  offline: [
    { _tag: 'path', d: 'M12 20h.01' },
    { _tag: 'path', d: 'M8.5 16.429a5 5 0 0 1 7 0' },
    { _tag: 'path', d: 'M5 12.859a10 10 0 0 1 5.17-2.69' },
    { _tag: 'path', d: 'M19 12.859a10 10 0 0 0-2.007-1.523' },
    { _tag: 'path', d: 'M2 8.82a15 15 0 0 1 4.177-2.643' },
    { _tag: 'path', d: 'M22 8.82a15 15 0 0 0-11.288-3.764' },
    { _tag: 'path', d: 'm2 2 20 20' },
  ],
  place: [
    {
      _tag: 'path',
      d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
    },
    { _tag: 'circle', cx: 12, cy: 10, r: 3 },
  ],
} satisfies Record<string, ReadonlyArray<IconStroke>>

export type IconName = keyof typeof ICONS

const viewStroke = (h: HtmlBuilder<Message>, stroke: IconStroke): Html =>
  Match.valueTags(stroke, {
    path: ({ d }) => h.path([h.D(d)], []),
    rect: ({ x, y, width, height, rx }) =>
      h.rect([h.X(String(x)), h.Y(String(y)), h.Width(String(width)), h.Height(String(height)), h.Rx(String(rx))], []),
    circle: ({ cx, cy, r }) => h.circle([h.Cx(String(cx)), h.Cy(String(cy)), h.R(String(r))], []),
  })

/** A decorative line icon; the surrounding control carries the accessible name. */
export const icon = (h: HtmlBuilder<Message>, name: IconName, className = 'icon'): Html =>
  h.svg(
    [
      h.Class(className),
      h.ViewBox('0 0 24 24'),
      h.Fill('none'),
      h.Stroke('currentColor'),
      h.StrokeWidth('2'),
      h.StrokeLinecap('round'),
      h.StrokeLinejoin('round'),
      h.AriaHidden(true),
    ],
    ICONS[name].map((stroke) => viewStroke(h, stroke))
  )
