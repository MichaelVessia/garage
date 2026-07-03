import * as DateTime from 'effect/DateTime'

export const testDate = (input: string): Date => DateTime.toDate(DateTime.makeUnsafe(input))
