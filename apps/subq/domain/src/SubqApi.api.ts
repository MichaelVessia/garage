import * as Domain from '@alchemy.run/domain'

import { Subq } from './Subq.model.ts'

export class SubqApi extends Domain.Api(
  'SubqApi',
  { model: Subq },
  { description: 'Manage a personal journal of body weights, medication injections, schedules, and weight goals.' }
) {}
