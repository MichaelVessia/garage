import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'

import { AssetCategory, Cents, IsoDate } from '../Values.ts'

const requiredFields = {
  name: Schema.NonEmptyString,
  category: AssetCategory,
}

const optionalFields = {
  make: Schema.String,
  model: Schema.String,
  serialNumber: Schema.String,
  purchasedOn: IsoDate,
  purchasePriceCents: Cents,
  location: Schema.String,
  notes: Schema.String,
}

export const AssetMetadata = Schema.Struct({
  ...requiredFields,
  ...Struct.map(optionalFields, Schema.optionalKey),
})
type AssetMetadata = typeof AssetMetadata.Type

export const assetMetadataKeys = Struct.keys(AssetMetadata.fields)

export const AssetMetadataPatch = Schema.Struct({
  ...Struct.map(requiredFields, Schema.optionalKey),
  ...Struct.map(Struct.map(optionalFields, Schema.NullOr), Schema.optionalKey),
})
type AssetMetadataPatch = typeof AssetMetadataPatch.Type

export const applyAssetMetadataPatch = <Asset extends AssetMetadata>({
  asset,
  patch,
}: {
  readonly asset: Asset
  readonly patch: AssetMetadataPatch
}): Omit<Asset, keyof AssetMetadata> & AssetMetadata => {
  const { name = asset.name, category = asset.category } = patch
  const updated = { ...asset, name, category }
  for (const key of Struct.keys(optionalFields)) {
    const value = patch[key]
    if (value === null) {
      delete updated[key]
    } else if (value !== undefined) {
      Object.assign(updated, { [key]: value })
    }
  }
  return updated
}
