import * as Domain from '@alchemy.run/domain'

import { Actor } from './Actor.ts'

export class CurrentActor extends Domain.RequestContext<CurrentActor>()('Logbook/CurrentActor', Actor) {}
