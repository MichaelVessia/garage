import type { Component } from '@effect/ui'
import { Command } from '@effect/ui'
import { Journal } from '@garage/subq-domain/Journal/Journal.aggregate'
import { PERSONAL_JOURNAL_ID } from '@garage/subq-domain/Journal/Journal.id'
import { Unauthorized } from '@garage/subq-domain/Session.middleware'
import { SubqApi } from '@garage/subq-domain/SubqApi.api'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'

const JournalCommand = Schema.Union(Journal.definition.commands)
type JournalCommand = typeof JournalCommand.Type

const Outcome = Schema.Literals(['saved', 'expired', 'rejected', 'unknown'])
const commandInput = <C extends JournalCommand>(command: C) => Struct.omit(command, ['_tag'])

export class SubmitJournalCommand extends Command.Service<SubmitJournalCommand>()('SubmitJournalCommand', {
  args: { commandId: Schema.String, command: JournalCommand },
  success: Outcome,
}) {
  static readonly layer = this.toLayer(
    Effect.map(SubqApi.Client, (client) => ({ commandId, command }) => {
      const target = PERSONAL_JOURNAL_ID
      const options = { commandId }
      const request = Match.valueTags(command, {
        UpdatePreferences: (input) =>
          client.UpdatePreferences(target, commandInput(input), options).pipe(Effect.asVoid),
        RecordWeight: (input) => client.RecordWeight(target, commandInput(input), options).pipe(Effect.asVoid),
        CorrectWeight: (input) => client.CorrectWeight(target, commandInput(input), options).pipe(Effect.asVoid),
        RemoveWeight: (input) => client.RemoveWeight(target, commandInput(input), options).pipe(Effect.asVoid),
        LogInjection: (input) => client.LogInjection(target, commandInput(input), options).pipe(Effect.asVoid),
        CorrectInjection: (input) => client.CorrectInjection(target, commandInput(input), options).pipe(Effect.asVoid),
        RemoveInjection: (input) => client.RemoveInjection(target, commandInput(input), options).pipe(Effect.asVoid),
        AssignInjectionsToSchedule: (input) =>
          client.AssignInjectionsToSchedule(target, commandInput(input), options).pipe(Effect.asVoid),
        CreateSchedule: (input) => client.CreateSchedule(target, commandInput(input), options).pipe(Effect.asVoid),
        ReviseSchedule: (input) => client.ReviseSchedule(target, commandInput(input), options).pipe(Effect.asVoid),
        ActivateSchedule: (input) => client.ActivateSchedule(target, commandInput(input), options).pipe(Effect.asVoid),
        DeactivateSchedule: (input) =>
          client.DeactivateSchedule(target, commandInput(input), options).pipe(Effect.asVoid),
        RemoveSchedule: (input) => client.RemoveSchedule(target, commandInput(input), options).pipe(Effect.asVoid),
        SetGoal: (input) => client.SetGoal(target, commandInput(input), options).pipe(Effect.asVoid),
        ReviseGoal: (input) => client.ReviseGoal(target, commandInput(input), options).pipe(Effect.asVoid),
        CompleteGoal: (input) => client.CompleteGoal(target, commandInput(input), options).pipe(Effect.asVoid),
        RemoveGoal: (input) => client.RemoveGoal(target, commandInput(input), options).pipe(Effect.asVoid),
        ImportJournal: (input) => client.ImportJournal(target, commandInput(input), options).pipe(Effect.asVoid),
      })
      return request.pipe(
        Effect.as('saved' as const),
        Effect.catchCause((cause): Effect.Effect<typeof Outcome.Type> => {
          if (Cause.hasDies(cause)) {
            return Effect.succeed('unknown')
          }
          const failure = Cause.findErrorOption(cause)
          if (Option.isNone(failure)) {
            return Effect.interrupt
          }
          const error = failure.value
          if (Schema.is(Unauthorized)(error)) {
            return Effect.succeed('expired')
          }
          const rejected = Function.pipe(
            Journal.definition.commands,
            Arr.findFirst(({ tag }) => tag === command._tag),
            Option.exists(({ rejects }) => Arr.some<Schema.Top>(rejects, (rejection) => Schema.is(rejection)(error)))
          )
          return Effect.succeed(rejected ? 'rejected' : 'unknown')
        })
      )
    })
  )
}

type MutationResult<Message> =
  | { readonly status: 'saved'; readonly message: Message }
  | { readonly status: 'failed'; readonly message: Message; readonly error: string }
  | { readonly status: 'expired' }

type Mutation<Message> = (
  commandId: string
) => Command.Issued<MutationResult<Message>, SubmitJournalCommand, typeof Outcome.Type, 'Effect'>

export type PageUpdate<Model, Message, R = never> = Readonly<{
  model: Model
  commands?: ReadonlyArray<Command.Command<Message | Component.Noop, R>>
  mutation?: Mutation<Message>
}>

// @effect-diagnostics-next-line missingPipeableSignature:off -- The arguments describe one command and its two outcomes.
export const mutate =
  <Success, Failure>(
    command: (commandId: string) => JournalCommand,
    success: Success,
    failure: (message: string) => Failure
  ): Mutation<Success | Failure> =>
  (commandId) =>
    SubmitJournalCommand.make({ commandId, command: command(commandId) }).pipe(
      Command.map((outcome): MutationResult<Success | Failure> => {
        if (outcome === 'saved') {
          return { status: 'saved', message: success }
        }
        if (outcome === 'expired') {
          return { status: 'expired' }
        }
        const error =
          outcome === 'rejected'
            ? 'The journal rejected this change.'
            : 'SubQ could not confirm the change. Check the journal before you try again.'
        return { status: 'failed', message: failure(error), error }
      })
    )
