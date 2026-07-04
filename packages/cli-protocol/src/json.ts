import * as Schema from 'effect/Schema'

export const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObject = typeof JsonObject.Type
