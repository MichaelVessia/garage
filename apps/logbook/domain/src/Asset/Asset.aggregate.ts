import * as Domain from '@alchemy.run/domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'

import { computeNextDue, isoDateFromUtc } from '../ScheduleMath.ts'
import { Cadence, DueThresholds, Meter, RetirementReason } from '../Values.ts'
import { AddPendingWork, PendingWorkAdded, PendingWorkAlreadyExists } from './AddPendingWork.command.ts'
import { AddSchedule, ScheduleAdded, ScheduleAlreadyExists } from './AddSchedule.command.ts'
import { ArchiveSchedule, ScheduleArchived } from './ArchiveSchedule.command.ts'
import { AssetId, LinkId, PendingWorkId, ScheduleId, WarrantyId } from './Asset.id.ts'
import { registeredMeter, updateMeter } from './AssetMeter.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'
import { AttachLink, LinkAlreadyExists, LinkAttached } from './AttachLink.command.ts'
import { CompletePendingWork, PendingWorkCompleted, PendingWorkNotOpen } from './CompletePendingWork.command.ts'
import { CompleteTask, TaskCompleted } from './CompleteTask.command.ts'
import { LogService, ServiceLogged } from './LogService.command.ts'
import { MeterRollback } from './MeterRollback.rejection.ts'
import { MeterUnitMismatch } from './MeterUnitMismatch.rejection.ts'
import { NoMeterConfigured } from './NoMeterConfigured.rejection.ts'
import { MeterRecorded, RecordMeter } from './RecordMeter.command.ts'
import { RecordWarranty, WarrantyAlreadyExists, WarrantyRecorded } from './RecordWarranty.command.ts'
import { AssetAlreadyRegistered, AssetRegistered, RegisterAsset } from './RegisterAsset.command.ts'
import { LinkNotFound, LinkRemoved, RemoveLink } from './RemoveLink.command.ts'
import { RemoveSpec, SpecNotFound, SpecRemoved } from './RemoveSpec.command.ts'
import { RemoveWarranty, WarrantyNotFound, WarrantyRemoved } from './RemoveWarranty.command.ts'
import { AssetRetired, RetireAsset } from './RetireAsset.command.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'
import { SetSpec, SpecAlreadyExists, SpecSet } from './SetSpec.command.ts'
import { AssetUpdated, UpdateAsset } from './UpdateAsset.command.ts'

const WorkStatus = Schema.TaggedUnion({ Pending: { title: Schema.NonEmptyString }, Completed: {} })

const AssetState = Schema.TaggedUnion({
  Unregistered: {},
  Active: {
    meter: Schema.optionalKey(Meter),
    schedules: Schema.Record(ScheduleId, Schema.Struct({ cadence: Cadence, ...DueThresholds.fields })),
    oneTimeWork: Schema.optionalKey(Schema.Record(PendingWorkId, WorkStatus)),
    warrantyIds: Schema.Array(WarrantyId),
    specKeys: Schema.Array(Schema.String),
    linkIds: Schema.Array(LinkId),
  },
  Retired: { reason: RetirementReason },
})
type AssetState = typeof AssetState.Type
type Active = typeof AssetState.cases.Active.Type

const notActive = (state: AssetState): AssetNotActive =>
  AssetNotActive.make({ status: AssetState.guards.Retired(state) ? 'retired' : 'unregistered' })

const updateActive = (state: AssetState, update: (active: Active) => Active): AssetState =>
  AssetState.guards.Active(state) ? update(state) : state

const checkReading = (
  assetId: AssetId,
  state: Active,
  reading: Option.Option<number>,
  correction: boolean
): Option.Option<NoMeterConfigured | MeterRollback> => {
  if (Option.isNone(reading)) {
    return Option.none()
  }
  if (state.meter === undefined) {
    return Option.some(NoMeterConfigured.make({ assetId }))
  }
  if (reading.value < state.meter.reading && !correction) {
    return Option.some(MeterRollback.make({ current: state.meter.reading, submitted: reading.value }))
  }
  return Option.none()
}

const meterChange = (state: Active, reading?: number): { readonly meterAdvancedTo?: number } =>
  reading === undefined || reading === state.meter?.reading ? {} : { meterAdvancedTo: reading }

export class Asset extends Domain.Aggregate('Asset', {
  id: AssetId,
  state: AssetState,
  initial: AssetState.cases.Unregistered.make({}),
  commands: [
    RegisterAsset,
    UpdateAsset,
    RetireAsset,
    RecordMeter,
    AddSchedule,
    ArchiveSchedule,
    CompleteTask,
    AddPendingWork,
    CompletePendingWork,
    LogService,
    RecordWarranty,
    RemoveWarranty,
    SetSpec,
    RemoveSpec,
    AttachLink,
    RemoveLink,
  ],
  decide: {
    RegisterAsset: (state, cmd, { id }) =>
      AssetState.guards.Unregistered(state)
        ? [AssetRegistered.make(Struct.omit(cmd, ['_tag']))]
        : AssetAlreadyRegistered.make({ assetId: id }),
    UpdateAsset: (state, cmd) =>
      AssetState.guards.Active(state) ? [AssetUpdated.make(Struct.omit(cmd, ['_tag']))] : notActive(state),
    RetireAsset: (state, cmd) =>
      AssetState.guards.Active(state) ? [AssetRetired.make(Struct.omit(cmd, ['_tag']))] : notActive(state),
    RecordMeter: (state, { reading, recordedOn, correction = false }, { id, now }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      if (state.meter === undefined) {
        return NoMeterConfigured.make({ assetId: id })
      }
      const previousReading = state.meter.reading
      const rejection = checkReading(id, state, Option.some(reading), correction)
      return Option.getOrElse(rejection, () => [
        MeterRecorded.make({
          reading,
          recordedOn: recordedOn ?? isoDateFromUtc(now),
          previousReading,
          correction,
        }),
      ])
    },
    AddSchedule: (state, { _tag, replacesScheduleId, ...schedule }, { id, now }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      if (replacesScheduleId !== undefined && !Record.has(state.schedules, replacesScheduleId)) {
        return ScheduleNotFound.make({ scheduleId: replacesScheduleId })
      }
      if (Record.has(state.schedules, schedule.scheduleId)) {
        return ScheduleAlreadyExists.make({ scheduleId: schedule.scheduleId })
      }
      const { cadence, lastCompletedOn, lastCompletedMeter } = schedule
      if ('unit' in cadence) {
        if (state.meter === undefined) {
          return NoMeterConfigured.make({ assetId: id })
        }
        if (state.meter.unit !== cadence.unit) {
          return MeterUnitMismatch.make({ configured: state.meter.unit, requested: cadence.unit })
        }
      }
      const due = computeNextDue(
        cadence,
        lastCompletedOn ?? isoDateFromUtc(now),
        lastCompletedMeter ?? state.meter?.reading
      )
      const added = ScheduleAdded.make({ ...schedule, ...due })
      return replacesScheduleId === undefined
        ? [added]
        : [ScheduleArchived.make({ scheduleId: replacesScheduleId }), added]
    },
    ArchiveSchedule: (state, { scheduleId }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      return Record.has(state.schedules, scheduleId)
        ? [ScheduleArchived.make({ scheduleId })]
        : ScheduleNotFound.make({ scheduleId })
    },
    CompleteTask: (state, cmd, { id, now }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      const schedule = Record.get(state.schedules, cmd.scheduleId)
      if (Option.isNone(schedule)) {
        return ScheduleNotFound.make({ scheduleId: cmd.scheduleId })
      }
      const rejection = checkReading(id, state, Option.fromUndefinedOr(cmd.meterReading), cmd.correction ?? false)
      if (Option.isSome(rejection)) {
        return rejection.value
      }
      const completedOn = cmd.completedOn ?? isoDateFromUtc(now)
      const due = computeNextDue(schedule.value.cadence, completedOn, cmd.meterReading ?? state.meter?.reading)
      return [
        TaskCompleted.make({
          ...Struct.omit(cmd, ['_tag', 'correction']),
          completedOn,
          ...due,
          ...meterChange(state, cmd.meterReading),
        }),
      ]
    },
    AddPendingWork: (state, cmd) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      return Record.has(state.oneTimeWork ?? {}, cmd.workId)
        ? PendingWorkAlreadyExists.make({ workId: cmd.workId })
        : [PendingWorkAdded.make(Struct.omit(cmd, ['_tag']))]
    },
    CompletePendingWork: (state, cmd, { id, now }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      const work = Record.get(state.oneTimeWork ?? {}, cmd.workId)
      if (Option.isNone(work) || !WorkStatus.guards.Pending(work.value)) {
        return PendingWorkNotOpen.make({ workId: cmd.workId })
      }
      const { title } = work.value
      const rejection = checkReading(id, state, Option.fromUndefinedOr(cmd.meterReading), cmd.correction ?? false)
      return Option.getOrElse(rejection, () => [
        PendingWorkCompleted.make({
          ...Struct.omit(cmd, ['_tag', 'correction']),
          title,
          completedOn: cmd.completedOn ?? isoDateFromUtc(now),
          ...meterChange(state, cmd.meterReading),
        }),
      ])
    },
    LogService: (state, cmd, { id, now }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      const rejection = checkReading(id, state, Option.fromUndefinedOr(cmd.meterReading), cmd.correction ?? false)
      return Option.getOrElse(rejection, () => [
        ServiceLogged.make({
          ...Struct.omit(cmd, ['_tag', 'correction']),
          performedOn: cmd.performedOn ?? isoDateFromUtc(now),
          ...meterChange(state, cmd.meterReading),
        }),
      ])
    },
    RecordWarranty: (state, { _tag, replacesWarrantyId, ...warranty }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      if (replacesWarrantyId !== undefined && !state.warrantyIds.includes(replacesWarrantyId)) {
        return WarrantyNotFound.make({ warrantyId: replacesWarrantyId })
      }
      if (state.warrantyIds.includes(warranty.warrantyId)) {
        return WarrantyAlreadyExists.make({ warrantyId: warranty.warrantyId })
      }
      const recorded = WarrantyRecorded.make(warranty)
      return replacesWarrantyId === undefined
        ? [recorded]
        : [WarrantyRemoved.make({ warrantyId: replacesWarrantyId }), recorded]
    },
    RemoveWarranty: (state, { warrantyId }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      return state.warrantyIds.includes(warrantyId)
        ? [WarrantyRemoved.make({ warrantyId })]
        : WarrantyNotFound.make({ warrantyId })
    },
    SetSpec: (state, { _tag, previousKey, ...spec }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      const set = SpecSet.make(spec)
      if (previousKey === undefined) {
        return [set]
      }
      if (!state.specKeys.includes(previousKey)) {
        return SpecNotFound.make({ key: previousKey })
      }
      if (previousKey === spec.key) {
        return [set]
      }
      return state.specKeys.includes(spec.key)
        ? SpecAlreadyExists.make({ key: spec.key })
        : [SpecRemoved.make({ key: previousKey }), set]
    },
    RemoveSpec: (state, { key }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      return state.specKeys.includes(key) ? [SpecRemoved.make({ key })] : SpecNotFound.make({ key })
    },
    AttachLink: (state, { _tag, replacesLinkId, ...link }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      if (replacesLinkId !== undefined && !state.linkIds.includes(replacesLinkId)) {
        return LinkNotFound.make({ linkId: replacesLinkId })
      }
      if (state.linkIds.includes(link.linkId)) {
        return LinkAlreadyExists.make({ linkId: link.linkId })
      }
      const attached = LinkAttached.make(link)
      return replacesLinkId === undefined ? [attached] : [LinkRemoved.make({ linkId: replacesLinkId }), attached]
    },
    RemoveLink: (state, { linkId }) => {
      if (!AssetState.guards.Active(state)) {
        return notActive(state)
      }
      return state.linkIds.includes(linkId) ? [LinkRemoved.make({ linkId })] : LinkNotFound.make({ linkId })
    },
  },
  evolve: {
    AssetRegistered: (state, event) =>
      AssetState.guards.Unregistered(state)
        ? AssetState.cases.Active.make({
            ...registeredMeter(event),
            schedules: {},
            warrantyIds: [],
            specKeys: [],
            linkIds: [],
          })
        : state,
    AssetUpdated: (state) => state,
    AssetRetired: (state, { reason }) =>
      AssetState.guards.Active(state) ? AssetState.cases.Retired.make({ reason }) : state,
    MeterRecorded: (state, { reading }) =>
      updateActive(state, (active) => updateMeter({ asset: active, reading: Option.some(reading) })),
    ScheduleAdded: (state, event) =>
      updateActive(state, (active) => ({
        ...active,
        schedules: {
          ...active.schedules,
          [event.scheduleId]: Struct.pick(event, ['cadence', 'nextDueOn', 'nextDueMeter']),
        },
      })),
    ScheduleArchived: (state, { scheduleId }) =>
      updateActive(state, (active) => ({
        ...active,
        schedules: Record.remove(active.schedules, scheduleId),
      })),
    TaskCompleted: (state, event) =>
      updateActive(state, (active) => ({
        ...updateMeter({ asset: active, reading: Option.fromUndefinedOr(event.meterAdvancedTo) }),
        schedules: Record.modify(active.schedules, event.scheduleId, ({ cadence }) => ({
          cadence,
          ...Struct.pick(event, ['nextDueOn', 'nextDueMeter']),
        })).pipe(Option.getOrElse(() => active.schedules)),
      })),
    PendingWorkAdded: (state, { workId, title }) =>
      updateActive(state, (active) => ({
        ...active,
        oneTimeWork: { ...active.oneTimeWork, [workId]: WorkStatus.cases.Pending.make({ title }) },
      })),
    PendingWorkCompleted: (state, { workId, meterAdvancedTo }) =>
      updateActive(state, (active) => ({
        ...updateMeter({ asset: active, reading: Option.fromUndefinedOr(meterAdvancedTo) }),
        oneTimeWork: { ...active.oneTimeWork, [workId]: WorkStatus.cases.Completed.make({}) },
      })),
    ServiceLogged: (state, { meterAdvancedTo }) =>
      updateActive(state, (active) => updateMeter({ asset: active, reading: Option.fromUndefinedOr(meterAdvancedTo) })),
    WarrantyRecorded: (state, { warrantyId }) =>
      updateActive(state, (active) => ({
        ...active,
        warrantyIds: [...active.warrantyIds, warrantyId],
      })),
    WarrantyRemoved: (state, { warrantyId }) =>
      updateActive(state, (active) => ({
        ...active,
        warrantyIds: Arr.filter(active.warrantyIds, (id) => id !== warrantyId),
      })),
    SpecSet: (state, { key }) =>
      updateActive(state, (active) => ({
        ...active,
        specKeys: active.specKeys.includes(key) ? active.specKeys : [...active.specKeys, key],
      })),
    SpecRemoved: (state, { key }) =>
      updateActive(state, (active) => ({
        ...active,
        specKeys: Arr.filter(active.specKeys, (entry) => entry !== key),
      })),
    LinkAttached: (state, { linkId }) =>
      updateActive(state, (active) => ({
        ...active,
        linkIds: [...active.linkIds, linkId],
      })),
    LinkRemoved: (state, { linkId }) =>
      updateActive(state, (active) => ({
        ...active,
        linkIds: Arr.filter(active.linkIds, (id) => id !== linkId),
      })),
  },
}) {}
