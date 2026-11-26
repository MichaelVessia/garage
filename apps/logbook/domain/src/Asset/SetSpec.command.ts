import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { AssetId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'
import { SpecNotFound, SpecRemoved } from './RemoveSpec.command.ts'

export class SpecAlreadyExists extends Schema.TaggedError<SpecAlreadyExists, { readonly brand: unique symbol }>()(
  'SpecAlreadyExists',
  { key: Schema.String }
) {}

export class SpecSet extends Domain.Event('SpecSet', {
  key: Schema.String,
  value: Schema.String,
  url: Schema.optionalKey(Schema.String),
}) {}

export class SetSpec extends Domain.Command(
  'SetSpec',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      key: Schema.String,
      value: Schema.String,
      url: Schema.optionalKey(Schema.String),
      previousKey: Schema.optionalKey(Schema.String),
    },
    events: [SpecRemoved, SpecSet],
    rejects: [AssetNotActive, SpecAlreadyExists, SpecNotFound],
  },
  { description: 'Set or replace a named asset specification, or rename an existing specification.' }
) {}
