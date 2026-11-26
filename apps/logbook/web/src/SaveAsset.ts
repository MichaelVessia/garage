import { Command, UiSchema } from '@effect/ui'
import { AddPendingWork } from '@garage/logbook-domain/Asset/AddPendingWork.command'
import { AddSchedule } from '@garage/logbook-domain/Asset/AddSchedule.command'
import { ArchiveSchedule } from '@garage/logbook-domain/Asset/ArchiveSchedule.command'
import { AssetId } from '@garage/logbook-domain/Asset/Asset.id'
import { AttachLink } from '@garage/logbook-domain/Asset/AttachLink.command'
import { CompletePendingWork } from '@garage/logbook-domain/Asset/CompletePendingWork.command'
import { CompleteTask } from '@garage/logbook-domain/Asset/CompleteTask.command'
import { LogService } from '@garage/logbook-domain/Asset/LogService.command'
import { RecordMeter } from '@garage/logbook-domain/Asset/RecordMeter.command'
import { RecordWarranty } from '@garage/logbook-domain/Asset/RecordWarranty.command'
import { RegisterAsset } from '@garage/logbook-domain/Asset/RegisterAsset.command'
import { RemoveLink } from '@garage/logbook-domain/Asset/RemoveLink.command'
import { RemoveSpec } from '@garage/logbook-domain/Asset/RemoveSpec.command'
import { RemoveWarranty } from '@garage/logbook-domain/Asset/RemoveWarranty.command'
import { SetSpec } from '@garage/logbook-domain/Asset/SetSpec.command'
import { UpdateAsset } from '@garage/logbook-domain/Asset/UpdateAsset.command'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { Message, SaveFailure } from './Model.ts'

export const AssetChange = UiSchema.TaggedEnum({
  AddPendingWork: { input: Schema.toType(AddPendingWork.rpc.payloadSchema.fields.input) },
  AddSchedule: { input: Schema.toType(AddSchedule.rpc.payloadSchema.fields.input) },
  ArchiveSchedule: { input: Schema.toType(ArchiveSchedule.rpc.payloadSchema.fields.input) },
  AttachLink: { input: Schema.toType(AttachLink.rpc.payloadSchema.fields.input) },
  CompletePendingWork: { input: Schema.toType(CompletePendingWork.rpc.payloadSchema.fields.input) },
  CompleteTask: { input: Schema.toType(CompleteTask.rpc.payloadSchema.fields.input) },
  LogService: { input: Schema.toType(LogService.rpc.payloadSchema.fields.input) },
  RecordMeter: { input: Schema.toType(RecordMeter.rpc.payloadSchema.fields.input) },
  RecordWarranty: { input: Schema.toType(RecordWarranty.rpc.payloadSchema.fields.input) },
  RegisterAsset: { input: Schema.toType(RegisterAsset.rpc.payloadSchema.fields.input) },
  RemoveLink: { input: Schema.toType(RemoveLink.rpc.payloadSchema.fields.input) },
  RemoveSpec: { input: Schema.toType(RemoveSpec.rpc.payloadSchema.fields.input) },
  RemoveWarranty: { input: Schema.toType(RemoveWarranty.rpc.payloadSchema.fields.input) },
  SetSpec: { input: Schema.toType(SetSpec.rpc.payloadSchema.fields.input) },
  UpdateAsset: { input: Schema.toType(UpdateAsset.rpc.payloadSchema.fields.input) },
})

export class SaveAsset extends Command.Service<SaveAsset>()('SaveAsset', {
  args: { target: AssetId, commandId: Schema.String, change: AssetChange },
  success: Message.cases.ReceivedResult,
}) {
  public static readonly layer = this.toLayer(
    Effect.gen(function* () {
      const api = yield* LogbookApi.Client
      return ({ target, commandId, change }) =>
        AssetChange.match(change, {
          AddPendingWork: ({ input }) => api.AddPendingWork(target, input, { commandId }),
          AddSchedule: ({ input }) => api.AddSchedule(target, input, { commandId }),
          ArchiveSchedule: ({ input }) => api.ArchiveSchedule(target, input, { commandId }),
          AttachLink: ({ input }) => api.AttachLink(target, input, { commandId }),
          CompletePendingWork: ({ input }) => api.CompletePendingWork(target, input, { commandId }),
          CompleteTask: ({ input }) => api.CompleteTask(target, input, { commandId }),
          LogService: ({ input }) => api.LogService(target, input, { commandId }),
          RecordMeter: ({ input }) => api.RecordMeter(target, input, { commandId }),
          RecordWarranty: ({ input }) => api.RecordWarranty(target, input, { commandId }),
          RegisterAsset: ({ input }) => api.RegisterAsset(target, input, { commandId }),
          RemoveLink: ({ input }) => api.RemoveLink(target, input, { commandId }),
          RemoveSpec: ({ input }) => api.RemoveSpec(target, input, { commandId }),
          RemoveWarranty: ({ input }) => api.RemoveWarranty(target, input, { commandId }),
          SetSpec: ({ input }) => api.SetSpec(target, input, { commandId }),
          UpdateAsset: ({ input }) => api.UpdateAsset(target, input, { commandId }),
        }).pipe(
          Effect.as(Message.ReceivedResult({ result: { commandId } })),
          Effect.catchCause((cause) => {
            if (Cause.hasInterruptsOnly(cause)) {
              return Effect.interrupt
            }

            const error = cause.pipe(Cause.findErrorOption, Option.getOrUndefined)
            const failure = Cause.hasDies(cause)
              ? SaveFailure.cases.Unknown.make({})
              : Schema.is(Unauthorized)(error)
                ? SaveFailure.cases.Denied.make({ error })
                : Schema.is(SaveFailure.cases.Rejected.fields.rejection)(error)
                  ? SaveFailure.cases.Rejected.make({ rejection: error })
                  : SaveFailure.cases.Unknown.make({})
            return Effect.succeed(Message.ReceivedResult({ result: { commandId, failure } }))
          })
        )
    })
  )
}
