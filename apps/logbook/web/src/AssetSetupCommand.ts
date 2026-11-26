import { LinkId, ScheduleId, WarrantyId } from '@garage/logbook-domain/Asset/Asset.id'
import { Cadence, IsoDate, MeterReading } from '@garage/logbook-domain/Values'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import type * as Types from 'effect/Types'

import { AssetSetupAction } from './Model.ts'
import type { AssetSetupEditor, Field, Model } from './Model.ts'
import { AssetChange, SaveAsset } from './SaveAsset.ts'

const parseDate = Schema.decodeUnknownOption(IsoDate)
const parseReading = Schema.decodeUnknownOption(
  Schema.FiniteFromString.check(Schema.makeFilter(Schema.is(MeterReading)))
)

const isWebUrl = (url: string): boolean => {
  if (!URL.canParse(url)) {
    return false
  }
  const { protocol } = new URL(url)
  return protocol === 'https:' || protocol === 'http:'
}

type SetupFields = {
  readonly editor: AssetSetupEditor
  readonly text: (field: Field) => string
}
type ScheduleInput = Types.Mutable<typeof AssetChange.cases.AddSchedule.Type.input>
type WarrantyInput = Types.Mutable<typeof AssetChange.cases.RecordWarranty.Type.input>

const scheduleCadence = ({ editor, text }: SetupFields): Option.Option<Cadence> => {
  const days = Number(text('days'))
  const every = Number(text('every'))
  const meterUnit = Option.fromUndefinedOr(editor.meterUnit)
  switch (text('cadence') || 'IntervalDays') {
    case 'IntervalDays':
      return Cadence.cases.IntervalDays.makeOption({ days })
    case 'MeterInterval':
      return Option.flatMap(meterUnit, (unit) => Cadence.cases.MeterInterval.makeOption({ every, unit }))
    case 'Either':
      return Option.flatMap(meterUnit, (unit) => Cadence.cases.Either.makeOption({ days, every, unit }))
    case 'Seasonal':
      return Cadence.cases.Seasonal.makeOption({ month: Number(text('month')), day: Number(text('day')) })
    default:
      return Option.none()
  }
}

export const assetSetupCommand = ({
  editor,
  commandId,
  fields,
  costCents,
}: {
  readonly editor: AssetSetupEditor
  readonly commandId: string
  readonly fields: Model['fields']
  readonly costCents: Option.Option<number>
}) => {
  const text = (field: Field) => Str.trim(fields[field] ?? '')
  const { assetId: target, action } = editor
  const notes = text('notes')
  const url = text('url')
  const label = text('label')
  if (url !== '' && !isWebUrl(url)) {
    return 'Enter a link that starts with https:// or http://.'
  }

  return AssetSetupAction.match(action, {
    AddSchedule: ({ replacesScheduleId }) => {
      const title = text('title')
      if (title === '') {
        return 'Enter the schedule title.'
      }
      const cadence = scheduleCadence({ editor, text })
      if (Option.isNone(cadence)) {
        return 'Enter a valid interval or annual date for this cadence.'
      }
      const replacing = replacesScheduleId !== undefined
      const date = replacing || !Cadence.guards.MeterInterval(cadence.value) ? text('lastCompletedOn') : ''
      const meter = replacing || 'unit' in cadence.value ? text('lastCompletedMeter') : ''
      const lastCompletedOn = Option.getOrUndefined(parseDate(date))
      const lastCompletedMeter = meter === '' ? undefined : Option.getOrUndefined(parseReading(meter))
      if (date !== '' && lastCompletedOn === undefined) {
        return 'Enter a valid last completion date.'
      }
      if (meter !== '' && lastCompletedMeter === undefined) {
        return 'Enter a last completion meter reading of zero or more.'
      }
      const input: ScheduleInput = { scheduleId: ScheduleId.make(commandId), title, cadence: cadence.value }
      if (replacesScheduleId !== undefined) {
        input.replacesScheduleId = replacesScheduleId
      }
      if (Option.isSome(costCents)) {
        input.estimatedCostCents = costCents.value
      }
      if (notes !== '') {
        input.notes = notes
      }
      if (lastCompletedOn !== undefined) {
        input.lastCompletedOn = lastCompletedOn
      }
      if (lastCompletedMeter !== undefined) {
        input.lastCompletedMeter = lastCompletedMeter
      }
      return SaveAsset.make({ target, commandId, change: AssetChange.AddSchedule({ input }) })
    },
    ArchiveSchedule: ({ scheduleId }) =>
      SaveAsset.make({ target, commandId, change: AssetChange.ArchiveSchedule({ input: { scheduleId } }) }),
    RecordWarranty: ({ replacesWarrantyId }) => {
      const expiresOn = parseDate(text('expiresOn'))
      const coverage = text('coverage')
      if (label === '' || Option.isNone(expiresOn)) {
        return 'Enter the warranty name and a valid expiration date.'
      }
      const input: WarrantyInput = { warrantyId: WarrantyId.make(commandId), label, expiresOn: expiresOn.value }
      if (replacesWarrantyId !== undefined) {
        input.replacesWarrantyId = replacesWarrantyId
      }
      if (coverage !== '') {
        input.coverage = coverage
      }
      if (notes !== '') {
        input.notes = notes
      }
      if (url !== '') {
        input.url = url
      }
      return SaveAsset.make({ target, commandId, change: AssetChange.RecordWarranty({ input }) })
    },
    RemoveWarranty: ({ warrantyId }) =>
      SaveAsset.make({ target, commandId, change: AssetChange.RemoveWarranty({ input: { warrantyId } }) }),
    SetSpec: ({ previousKey }) => {
      const key = previousKey !== undefined && fields.key === previousKey ? previousKey : text('key')
      const value = text('value')
      if (key === '' || value === '') {
        return 'Enter the specification name and value.'
      }
      const input: Types.Mutable<typeof AssetChange.cases.SetSpec.Type.input> = { key, value }
      if (previousKey !== undefined) {
        input.previousKey = previousKey
      }
      if (url !== '') {
        input.url = url
      }
      return SaveAsset.make({ target, commandId, change: AssetChange.SetSpec({ input }) })
    },
    RemoveSpec: ({ key }) => SaveAsset.make({ target, commandId, change: AssetChange.RemoveSpec({ input: { key } }) }),
    AttachLink: ({ replacesLinkId }) => {
      if (label === '' || url === '') {
        return 'Enter the link name and URL.'
      }
      const link = { linkId: LinkId.make(commandId), label, url }
      const input = replacesLinkId === undefined ? link : { ...link, replacesLinkId }
      return SaveAsset.make({ target, commandId, change: AssetChange.AttachLink({ input }) })
    },
    RemoveLink: ({ linkId }) =>
      SaveAsset.make({ target, commandId, change: AssetChange.RemoveLink({ input: { linkId } }) }),
  })
}
