import * as DomainFoldkit from '@alchemy.run/domain/Foldkit'
import { PERSONAL_JOURNAL_ID } from '@garage/subq-domain/Journal/Journal.id'
import { Unauthorized } from '@garage/subq-domain/Session.middleware'
import { SubqApi } from '@garage/subq-domain/SubqApi.api'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'

export const client = DomainFoldkit.make(SubqApi)

export type Client = typeof SubqApi.Client.Identifier
type Result = typeof client.Message.Type

type MutationResult<Message> =
  | { readonly status: 'saved'; readonly message: Message }
  | { readonly status: 'failed'; readonly message: Message; readonly error: string }
  | { readonly status: 'expired' }

type Mutation<Message> = (commandId: string) => Command.Command<MutationResult<Message>, never, Client>

export type PageUpdate<Model, Message> = Readonly<{
  model: Model
  commands?: ReadonlyArray<Command.Command<Message, never, Client>>
  mutation?: Mutation<Message>
}>

// @effect-diagnostics-next-line missingPipeableSignature:off -- The arguments describe one command and its two outcomes.
export const mutate =
  <Success, Failure>(
    command: (request: {
      readonly target: typeof PERSONAL_JOURNAL_ID
      readonly commandId: string
    }) => Command.Command<Result, never, Client>,
    success: Success,
    failure: (message: string) => Failure
  ): Mutation<Success | Failure> =>
  (commandId) =>
    Command.mapMessage(command({ target: PERSONAL_JOURNAL_ID, commandId }), (result) => {
      if (!('failure' in result)) {
        return { status: 'saved', message: success }
      }
      const denied = Match.valueTags(result.failure, {
        Denied: ({ error }) => Schema.is(Unauthorized)(error),
        Unknown: () => false,
        Rejected: () => false,
      })
      if (denied) {
        return { status: 'expired' }
      }
      const error = Match.valueTags(result.failure, {
        Denied: () => 'You cannot save this change.',
        Unknown: () => 'SubQ could not confirm the change. Check the journal before you try again.',
        Rejected: () => 'The journal rejected this change.',
      })
      return { status: 'failed', message: failure(error), error }
    })
