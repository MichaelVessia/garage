import * as Effect from 'effect/Effect'

import type { CommandDescription } from './command'
import { successEnvelope } from './envelope'
import type { NextAction, SuccessEnvelope } from './envelope'

// Every app CLI's root command runs the same three-way health check: env
// missing -> unconfigured, any other status-check failure -> configured but
// unreachable, success -> app-specific health fields. Only the success shape
// and the two identifying error codes/next-actions vary per app.
export interface EnvMissingRootHealth {
  readonly configured: false
}

export interface UnreachableRootHealth {
  readonly configured: true
  readonly reachable: false
  readonly errorCode: string
}

export type FailureRootHealth = EnvMissingRootHealth | UnreachableRootHealth

export interface RootHealthResult<Name extends string, Health> {
  readonly name: Name
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: FailureRootHealth | Health
}

export interface MakeRootOptions<
  Name extends string,
  StatusResult,
  Health,
  Err extends { readonly code: string },
  Context,
> {
  readonly command: string
  readonly commandTree: ReadonlyArray<CommandDescription>
  readonly name: Name
  readonly description: string
  readonly status: Effect.Effect<StatusResult, Err, Context>
  readonly envMissingCode: string
  readonly envNextAction: NextAction
  readonly showCommandsAction: NextAction
  readonly onReachable: (result: StatusResult) => Health
}

export const makeRoot = <Name extends string, StatusResult, Health, Err extends { readonly code: string }, Context>(
  options: MakeRootOptions<Name, StatusResult, Health, Err, Context>
): Effect.Effect<SuccessEnvelope<RootHealthResult<Name, Health>>, never, Context> =>
  options.status.pipe(
    Effect.match({
      onFailure: (error) => {
        const health: FailureRootHealth =
          error.code === options.envMissingCode
            ? { configured: false }
            : { configured: true, reachable: false, errorCode: error.code }

        return successEnvelope({
          command: options.command,
          result: { name: options.name, description: options.description, commands: options.commandTree, health },
          nextActions: error.code === options.envMissingCode ? [options.envNextAction] : [options.showCommandsAction],
        })
      },
      onSuccess: (result) =>
        successEnvelope({
          command: options.command,
          result: {
            name: options.name,
            description: options.description,
            commands: options.commandTree,
            health: options.onReachable(result),
          },
        }),
    })
  )
