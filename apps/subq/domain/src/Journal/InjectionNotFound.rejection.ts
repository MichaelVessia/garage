import * as Schema from 'effect/Schema'

import { InjectionId } from './Journal.id.ts'

export class InjectionNotFound extends Schema.TaggedError<InjectionNotFound, { readonly brand: unique symbol }>()(
  'InjectionNotFound',
  { injectionId: InjectionId },
  { httpApiStatus: 404 }
) {}
