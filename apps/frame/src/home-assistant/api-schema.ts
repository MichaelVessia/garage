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
