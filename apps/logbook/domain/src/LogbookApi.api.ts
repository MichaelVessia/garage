import * as Domain from '@alchemy.run/domain'

import { Logbook } from './Logbook.model.ts'

export class LogbookApi extends Domain.Api(
  'LogbookApi',
  { model: Logbook },
  { description: 'Manage household assets and read maintenance records, activity, and the home catalog.' }
) {}
