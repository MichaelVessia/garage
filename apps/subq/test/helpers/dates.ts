import { DateTime } from 'effect'

export const testDate = (input: string): Date => DateTime.toDate(DateTime.makeUnsafe(input))
