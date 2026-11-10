import * as Schema from 'effect/Schema'

import { CalendarDate, IanaTimezone } from './calendar-date.js'

/** The identity of the SPA build a server instance serves; it changes whenever the built assets change. */
export class FrameVersion extends Schema.Class<FrameVersion, { readonly brand: unique symbol }>('FrameVersion')({
  version: Schema.String,
}) {}

/** Display settings the server owns and the frame needs before rendering. */
export class FrameSettings extends Schema.Class<FrameSettings, { readonly brand: unique symbol }>('FrameSettings')({
  timezone: IanaTimezone,
}) {}

/** The colour Google Calendar shows an event in, as lowercase `#rrggbb`. */
export const EventColor = Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/u))

/** The colour Google Calendar shows an event in, as lowercase `#rrggbb`. */
export type EventColor = typeof EventColor.Type

/** An event occurrence with start and end instants. */
export const TimedEvent = Schema.TaggedStruct('TimedEvent', {
  id: Schema.String,
  title: Schema.String,
  location: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
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
  description: Schema.NullOr(Schema.String),
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
export class CalendarWindow extends Schema.Class<CalendarWindow, { readonly brand: unique symbol }>('CalendarWindow')({
  from: CalendarDate,
  to: CalendarDate,
}) {}

/** One day of the weather forecast. */
const ForecastDay = Schema.Struct({
  date: CalendarDate,
  condition: Schema.String,
  high: Schema.NullOr(Schema.Finite),
  low: Schema.NullOr(Schema.Finite),
  precipitationProbability: Schema.NullOr(Schema.Finite),
})

/** One day of the weather forecast. */
export type ForecastDay = typeof ForecastDay.Type

/** One hour of the weather forecast. */
const ForecastHour = Schema.Struct({
  time: Schema.DateTimeUtc,
  condition: Schema.String,
  temperature: Schema.NullOr(Schema.Finite),
  precipitationProbability: Schema.NullOr(Schema.Finite),
})

/** One hour of the weather forecast. */
export type ForecastHour = typeof ForecastHour.Type

/** Wind speed in the weather entity's unit and the compass bearing it blows from, in degrees. */
const Wind = Schema.Struct({
  speed: Schema.Finite,
  unit: Schema.String,
  bearing: Schema.NullOr(Schema.Finite),
})

/** Wind speed in the weather entity's unit and the compass bearing it blows from, in degrees. */
export type Wind = typeof Wind.Type

/** Current conditions plus hourly and daily forecasts; an integration without hourly data sends none. */
export class Weather extends Schema.Class<Weather, { readonly brand: unique symbol }>('Weather')({
  condition: Schema.String,
  temperature: Schema.NullOr(Schema.Finite),
  temperatureUnit: Schema.String,
  feelsLike: Schema.NullOr(Schema.Finite),
  humidity: Schema.NullOr(Schema.Finite),
  wind: Schema.NullOr(Wind),
  uvIndex: Schema.NullOr(Schema.Finite),
  hourly: Schema.Array(ForecastHour),
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
export class ShoppingItemUpdate extends Schema.Class<ShoppingItemUpdate, { readonly brand: unique symbol }>(
  'ShoppingItemUpdate'
)({
  uid: Schema.String,
  status: ShoppingItemStatus,
}) {}

/** A request to add one item to the shopping list. */
export class ShoppingItemAddition extends Schema.Class<ShoppingItemAddition, { readonly brand: unique symbol }>(
  'ShoppingItemAddition'
)({
  summary: Schema.Trimmed.check(Schema.isNonEmpty(), Schema.isMaxLength(200)),
}) {}
