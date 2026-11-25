import * as Schema from 'effect/Schema'

import { InjectionId } from './Journal.id.ts'

export class InjectionAlreadyExists extends Schema.TaggedError<
  InjectionAlreadyExists,
  { readonly brand: unique symbol }
>()('InjectionAlreadyExists', { injectionId: InjectionId }, { httpApiStatus: 409 }) {}
