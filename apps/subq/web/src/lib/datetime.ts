import * as DateTime from 'effect/DateTime'

const pad = (value: number): string => String(value).padStart(2, '0')

// Format a Date as an `input[type=datetime-local]` value (local timezone).
export const toLocalDatetimeString = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`

export const toLocalDateString = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

// Parse an `input[type=datetime-local]` value (local timezone, no offset
// suffix) into a UTC DateTime. The Date constructor is the only API that
// parses offset-less strings in the user's local timezone.
export const fromLocalDatetimeString = (value: string): DateTime.Utc => {
  // @effect-diagnostics-next-line globalDate:off
  const local = new Date(value) // oxlint-disable-line effect/use-clock-service
  return DateTime.makeUnsafe(local)
}

export const fromLocalDateString = (value: string): DateTime.Utc => {
  // @effect-diagnostics-next-line globalDate:off
  const local = new Date(`${value}T00:00`) // oxlint-disable-line effect/use-clock-service
  return DateTime.makeUnsafe(local)
}

export const utcToLocalDatetimeString = (dt: DateTime.Utc): string => dt.pipe(DateTime.toDate, toLocalDatetimeString)

export const utcToLocalDateString = (dt: DateTime.Utc): string => dt.pipe(DateTime.toDate, toLocalDateString)

export const epochToDate = (ms: number): Date => DateTime.toDate(DateTime.makeUnsafe(ms))

const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
})

const shortDateFormat = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
})

export const formatDateTime = (dt: DateTime.Utc): string => dateTimeFormat.format(DateTime.toDate(dt))

export const formatDate = (dt: DateTime.Utc): string => dateFormat.format(DateTime.toDate(dt))

export const formatShortDate = (dt: DateTime.Utc): string => shortDateFormat.format(DateTime.toDate(dt))
