import * as Schema from 'effect/Schema'

import { CalendarDate, IanaTimezone } from './calendar-date.js'

/** The identity of the SPA build a server instance serves; it changes whenever the built assets change. */
export class FrameVersion extends Schema.Class<FrameVersion>('FrameVersion')({
  version: Schema.String,
}) {}

/** Display settings the server owns and the frame needs before rendering. */
export class FrameSettings extends Schema.Class<FrameSettings>('FrameSettings')({
  timezone: IanaTimezone,
}) {}

/** A colour picked for an event in Google Calendar, by Google's name for it. */
const EventColor = Schema.Literals([
  'lavender',
  'sage',
  'grape',
  'flamingo',
  'banana',
  'tangerine',
  'peacock',
  'graphite',
  'blueberry',
  'basil',
  'tomato',
])
/** A colour picked for an event in Google Calendar, by Google's name for it. */
export type EventColor = typeof EventColor.Type

/** An event occurrence with start and end instants. */
export const TimedEvent = Schema.TaggedStruct('TimedEvent', {
  id: Schema.String,
  title: Schema.String,
  location: Schema.NullOr(Schema.String),
  color: Schema.NullOr(EventColor),
  start: Schema.DateTimeUtc,
  end: Schema.DateTimeUtc,
})
/** An event occurrence with start and end instants. */
export type TimedEvent = typeof TimedEvent.Type

/** An all-day event occurrence; `endDate` is exclusive. */
export const AllDayEvent = Schema.TaggedStruct('AllDayEvent', {
  id: Schema.String,
  title: Schema.String,
  location: Schema.NullOr(Schema.String),
  color: Schema.NullOr(EventColor),
  startDate: CalendarDate,
  endDate: CalendarDate,
})
/** An all-day event occurrence; `endDate` is exclusive. */
export type AllDayEvent = typeof AllDayEvent.Type

/** One occurrence of a family calendar event inside a requested window. */
export const CalendarEvent = Schema.Union([TimedEvent, AllDayEvent])
/** One occurrence of a family calendar event inside a requested window. */
export type CalendarEvent = typeof CalendarEvent.Type

/** A local-date window; `to` is exclusive. */
export class CalendarWindow extends Schema.Class<CalendarWindow>('CalendarWindow')({
  from: CalendarDate,
  to: CalendarDate,
}) {}

/** One day of the weather forecast. */
const ForecastDay = Schema.Struct({
  date: CalendarDate,
  condition: Schema.String,
  high: Schema.NullOr(Schema.Number),
  low: Schema.NullOr(Schema.Number),
  precipitationProbability: Schema.NullOr(Schema.Number),
})
/** One day of the weather forecast. */
export type ForecastDay = typeof ForecastDay.Type

/** Current conditions plus a daily forecast. */
export class Weather extends Schema.Class<Weather>('Weather')({
  condition: Schema.String,
  temperature: Schema.NullOr(Schema.Number),
  temperatureUnit: Schema.String,
  forecast: Schema.Array(ForecastDay),
}) {}

/** Completion state of a shopping list item. */
export const ShoppingItemStatus = Schema.Literals(['needs_action', 'completed'])
/** Completion state of a shopping list item. */
export type ShoppingItemStatus = typeof ShoppingItemStatus.Type

/** One shopping list item. */
export const ShoppingItem = Schema.Struct({
  uid: Schema.String,
  summary: Schema.String,
  status: ShoppingItemStatus,
})
/** One shopping list item. */
export type ShoppingItem = typeof ShoppingItem.Type

/** A request to change one shopping list item's completion state. */
export class ShoppingItemUpdate extends Schema.Class<ShoppingItemUpdate>('ShoppingItemUpdate')({
  uid: Schema.String,
  status: ShoppingItemStatus,
}) {}

/** A request to add one item to the shopping list. */
export class ShoppingItemAddition extends Schema.Class<ShoppingItemAddition>('ShoppingItemAddition')({
  summary: Schema.Trimmed.check(Schema.isNonEmpty(), Schema.isMaxLength(200)),
}) {}
