import * as Schema from 'effect/Schema'

export class BlockStorageError extends Schema.TaggedError<BlockStorageError, { readonly brand: unique symbol }>()(
  'BlockStorageError',
  {
    cause: Schema.Defect(),
  }
) {}

export class CredentialError extends Schema.TaggedError<CredentialError, { readonly brand: unique symbol }>()(
  'CredentialError',
  {
    cause: Schema.Defect(),
  }
) {}

export class InvalidCommandBody extends Schema.TaggedError<InvalidCommandBody, { readonly brand: unique symbol }>()(
  'InvalidCommandBody',
  {}
) {}
