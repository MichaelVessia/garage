import * as Schema from 'effect/Schema'

// Home Assistant REST payloads. Keys follow the upstream wire format.

export const WeatherStateResponse = Schema.Struct({
  state: Schema.String,
  attributes: Schema.Struct({
    temperature: Schema.Number.pipe(Schema.NullOr, Schema.optional),
    temperature_unit: Schema.String.pipe(Schema.optional),
  }),
})
export type WeatherStateResponse = typeof WeatherStateResponse.Type

const ForecastEntry = Schema.Struct({
  datetime: Schema.String,
  condition: Schema.String.pipe(Schema.NullOr, Schema.optional),
  temperature: Schema.Number.pipe(Schema.NullOr, Schema.optional),
  templow: Schema.Number.pipe(Schema.NullOr, Schema.optional),
  precipitation_probability: Schema.Number.pipe(Schema.NullOr, Schema.optional),
})

export const ForecastServiceResponse = Schema.Struct({
  service_response: Schema.Record(Schema.String, Schema.Struct({ forecast: Schema.Array(ForecastEntry) })),
})
export type ForecastServiceResponse = typeof ForecastServiceResponse.Type

const TodoItem = Schema.Struct({
  uid: Schema.String,
  summary: Schema.String,
  status: Schema.Literals(['needs_action', 'completed']),
})

export const TodoItemsServiceResponse = Schema.Struct({
  service_response: Schema.Record(Schema.String, Schema.Struct({ items: Schema.Array(TodoItem) })),
})
export type TodoItemsServiceResponse = typeof TodoItemsServiceResponse.Type

// GET /api/states/<entity_id> for a media player, switch, or button.
export const EntityStateResponse = Schema.Struct({
  entity_id: Schema.String,
  state: Schema.String,
  attributes: Schema.Struct({
    friendly_name: Schema.String.pipe(Schema.optional),
    supported_features: Schema.Number.pipe(Schema.optional),
    is_volume_muted: Schema.Boolean.pipe(Schema.optional),
    volume_level: Schema.Number.pipe(Schema.NullOr, Schema.optional),
    source: Schema.String.pipe(Schema.NullOr, Schema.optional),
    source_list: Schema.Array(Schema.String).pipe(Schema.NullOr, Schema.optional),
    media_title: Schema.String.pipe(Schema.NullOr, Schema.optional),
    media_artist: Schema.String.pipe(Schema.NullOr, Schema.optional),
    entity_picture: Schema.String.pipe(Schema.NullOr, Schema.optional),
  }),
})
export type EntityStateResponse = typeof EntityStateResponse.Type
