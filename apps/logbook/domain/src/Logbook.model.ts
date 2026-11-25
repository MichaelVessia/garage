import * as Domain from '@alchemy.run/domain'
import * as Layer from 'effect/Layer'

import { Asset } from './Asset/Asset.aggregate.ts'
import { AssetActivity, AssetActivityLive } from './Asset/AssetActivity.view.ts'
import { AssetDetail, AssetDetailLive } from './Asset/AssetDetail.view.ts'
import { HomeCatalog, HomeCatalogLive } from './Home/HomeCatalog.view.ts'

export class Logbook extends Domain.Model('Logbook', {
  aggregates: [Asset],
  views: [AssetDetail, AssetActivity, HomeCatalog],
}) {}

export const LogbookHandlers = Layer.mergeAll(AssetDetailLive, AssetActivityLive, HomeCatalogLive)
