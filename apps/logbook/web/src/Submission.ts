import * as DomainFoldkit from '@alchemy.run/domain/Foldkit'
import { AssetId } from '@garage/logbook-domain/Asset/Asset.id'
import type { AssetMetadata } from '@garage/logbook-domain/Asset/AssetMetadata'
import { AssetNotActive } from '@garage/logbook-domain/Asset/AssetNotActive.rejection'
import { MeterRollback } from '@garage/logbook-domain/Asset/MeterRollback.rejection'
import { NoMeterConfigured } from '@garage/logbook-domain/Asset/NoMeterConfigured.rejection'
import { AssetAlreadyRegistered } from '@garage/logbook-domain/Asset/RegisterAsset.command'
import { ScheduleNotFound } from '@garage/logbook-domain/Asset/ScheduleNotFound.rejection'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import { AssetCategory, Cents, IsoDate, MeterReading, MeterUnit } from '@garage/logbook-domain/Values'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import * as Struct from 'effect/Struct'
import type * as Types from 'effect/Types'
import { Command } from 'foldkit'
import type { Update } from 'foldkit'

import { assetSetupCommand } from './AssetSetupCommand.ts'
import { client, Message } from './Model.ts'
import type { Client, Field, Model } from './Model.ts'

const parseReading = Schema.decodeUnknownOption(
  Schema.FiniteFromString.check(Schema.makeFilter(Schema.is(MeterReading)))
)
const parseAssetId = Schema.decodeUnknownOption(AssetId)

type Work = Omit<Parameters<typeof client.LogService>[0]['input'], 'title'>
type Registration = Parameters<typeof client.RegisterAsset>[0]['input']
type AssetUpdate = Parameters<typeof client.UpdateAsset>[0]['input']

const assetTextFields = ['make', 'model', 'serialNumber', 'location', 'notes'] as const

const parsePurchasePrice = (value: string): Option.Option<number> => {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(value)) {
    return Option.none()
  }
  const [whole, fraction = ''] = Str.split('.')(value)
  const cents = Number(whole + Str.padEnd(2, '0')(fraction))
  return Schema.is(Cents)(cents) ? Option.some(cents) : Option.none()
}

const assetMetadata = (
  fields: Model['fields'],
  original?: typeof AssetMetadata.Type
): typeof AssetMetadata.Type | string => {
  const name = original !== undefined && fields.name === original.name ? original.name : Str.trim(fields.name ?? '')
  const category = Str.trim(fields.category ?? '') || 'other'
  if (name === '' || !Schema.is(AssetCategory)(category)) {
    return 'Enter the asset name and select a category.'
  }

  const metadata: Types.Mutable<typeof AssetMetadata.Type> = { name, category }
  for (const field of assetTextFields) {
    const raw = fields[field]
    const normalized = Str.trim(raw ?? '')
    const value = raw === original?.[field] ? raw : normalized === '' ? undefined : normalized
    if (value !== undefined) {
      metadata[field] = value
    }
  }
  const purchasedOn = Str.trim(fields.purchasedOn ?? '')
  if (purchasedOn !== '') {
    if (!Schema.is(IsoDate)(purchasedOn)) {
      return 'Enter a purchase date in YYYY-MM-DD format.'
    }
    metadata.purchasedOn = purchasedOn
  }
  const purchasePrice = Str.trim(fields.purchasePrice ?? '')
  if (purchasePrice !== '') {
    const cents = parsePurchasePrice(purchasePrice)
    if (Option.isNone(cents)) {
      return 'Enter a purchase price in dollars with up to two decimal places.'
    }
    metadata.purchasePriceCents = cents.value
  }
  return metadata
}

const commandFor = (
  model: Model,
  commandId: string
): Command.Command<typeof client.Message.Type, never, Client> | string => {
  const text = (field: Field) => Str.trim(model.fields[field] ?? '')
  const readingText = text('reading')
  const reading = readingText === '' ? undefined : Option.getOrUndefined(parseReading(readingText))
  const costText = text('cost')
  const cents = Math.round(Number(costText) * 100)
  const vendor = text('vendor')
  const notes = text('notes')
  const correction = text('correction') === 'true'

  if (readingText !== '' && reading === undefined) {
    return 'Enter a meter reading of zero or more.'
  }
  if (costText !== '' && (!/^\d+(?:\.\d{1,2})?$/u.test(costText) || !Schema.is(Cents)(cents))) {
    return 'Enter a cost in dollars with up to two decimal places.'
  }

  const work: Types.Mutable<Work> = {
    performedBy: text('performedBy') === 'shop' ? 'shop' : 'diy',
  }
  if (reading !== undefined) {
    work.meterReading = reading
  }
  if (costText !== '') {
    work.costCents = cents
  }
  if (vendor !== '') {
    work.vendor = vendor
  }
  if (notes !== '') {
    work.notes = notes
  }
  if (correction) {
    work.correction = true
  }

  switch (model.editor?._tag) {
    case 'AssetSetup':
      return assetSetupCommand({
        editor: model.editor,
        commandId,
        text,
        costCents: costText === '' ? Option.none() : Option.some(cents),
      })
    case 'CompleteTask':
      return client.CompleteTask({
        target: model.editor.assetId,
        commandId,
        input: { ...work, scheduleId: model.editor.scheduleId },
      })
    case 'RecordMeter': {
      const target = parseAssetId(model.fields.asset ?? '')
      if (Option.isNone(target) || reading === undefined) {
        return 'Select an asset and enter its meter reading.'
      }
      return client.RecordMeter({ target: target.value, commandId, input: { reading, correction } })
    }
    case 'LogService': {
      const target = parseAssetId(model.fields.asset ?? '')
      const title = text('title')
      if (Option.isNone(target) || title === '') {
        return 'Select an asset and enter the service title.'
      }
      return client.LogService({ target: target.value, commandId, input: { ...work, title } })
    }
    case 'RegisterAsset': {
      const metadata = assetMetadata(model.fields)
      if (typeof metadata === 'string') {
        return metadata
      }
      const unit = text('unit')
      if (reading !== undefined && !Schema.is(MeterUnit)(unit)) {
        return 'Select a meter unit for the initial reading.'
      }
      const input: Types.Mutable<Registration> = { ...metadata }
      if (Schema.is(MeterUnit)(unit)) {
        input.meterUnit = unit
      }
      if (reading !== undefined) {
        input.initialMeter = reading
      }
      return client.RegisterAsset({ target: AssetId.make(commandId), commandId, input })
    }
    case 'UpdateAsset': {
      const { assetId, original } = model.editor
      const metadata = assetMetadata(model.fields, original)
      if (typeof metadata === 'string') {
        return metadata
      }
      const input: Types.Mutable<AssetUpdate> = {}
      if (metadata.name !== original.name) {
        input.name = metadata.name
      }
      if (metadata.category !== original.category) {
        input.category = metadata.category
      }
      for (const field of assetTextFields) {
        if (metadata[field] !== original[field]) {
          input[field] = metadata[field] ?? null
        }
      }
      if (metadata.purchasedOn !== original.purchasedOn) {
        input.purchasedOn = metadata.purchasedOn ?? null
      }
      if (metadata.purchasePriceCents !== original.purchasePriceCents) {
        input.purchasePriceCents = metadata.purchasePriceCents ?? null
      }
      return Struct.keys(input).length === 0
        ? 'No changes to save.'
        : client.UpdateAsset({ target: assetId, commandId, input })
    }
    case undefined:
      return 'Open a form to save a log entry.'
  }
}

export const submit = (model: Model): Update.Return<Model, Message, Client> => {
  if (model.editor === null || model.sessionExpired || model.attempt?.status === 'saving') {
    return { model }
  }

  const allocation = DomainFoldkit.next(model.commandIds)
  const id = model.attempt?.id ?? allocation.commandId
  const command = commandFor(model, id)
  if (typeof command === 'string') {
    return { model: { ...model, problem: command, notice: null } }
  }

  return {
    model: {
      ...model,
      commandIds: model.attempt === null ? allocation.commandIds : model.commandIds,
      attempt: { id, status: 'saving' },
      problem: null,
      notice: null,
    },
    commands: [Command.mapMessage(command, (result) => Message.ReceivedResult({ result }))],
  }
}

const rejectionMessage = (rejection: unknown): string => {
  if (Schema.is(MeterRollback)(rejection)) {
    return `The current reading is ${rejection.current}. You entered ${rejection.submitted}. Check the reading or save it as a correction.`
  }
  if (Schema.is(ScheduleNotFound)(rejection)) {
    return 'This schedule is no longer active.'
  }
  if (Schema.is(NoMeterConfigured)(rejection)) {
    return 'This asset has no meter.'
  }
  if (Schema.is(AssetNotActive)(rejection)) {
    return 'This asset is no longer active.'
  }
  if (Schema.is(AssetAlreadyRegistered)(rejection)) {
    return 'This asset is already registered.'
  }
  return 'Logbook rejected the change.'
}

export const receiveResult =
  (result: typeof client.Message.Type) =>
  (model: Model): Model => {
    if (model.attempt?.id !== result.commandId) {
      return model
    }

    if (!('failure' in result)) {
      return {
        ...model,
        editor: model.screen === 'Quick Log' ? model.editor : null,
        fields: {},
        attempt: null,
        problem: null,
        correctionOffered: false,
        notice: 'Saved.',
      }
    }

    return Match.valueTags(result.failure, {
      Denied: ({ error }) => {
        const expired = Schema.is(Unauthorized)(error)
        return {
          ...model,
          attempt: null,
          problem: expired ? null : 'You cannot save this change.',
          sessionExpired: model.sessionExpired || expired,
        }
      },
      Unknown: (): Model => ({
        ...model,
        attempt: { id: result.commandId, status: 'unknown' },
        problem: 'Logbook could not confirm the save. Retry to check or save the same entry.',
      }),
      Rejected: ({ rejection }) => ({
        ...model,
        attempt: null,
        problem: rejectionMessage(rejection),
        correctionOffered: Schema.is(MeterRollback)(rejection),
      }),
    })
  }
