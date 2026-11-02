import {
  decodeErrorFields,
  envMissingFields,
  httpErrorFields,
  makeDecodeError,
  makeEnvMissing,
  makeHttpError,
  makeUnreachable,
  unreachableFields,
} from '@garage/integration-http'
import * as Schema from 'effect/Schema'

class FrameEnvMissingError extends Schema.TaggedError<FrameEnvMissingError, { readonly brand: unique symbol }>()(
  'FrameEnvMissingError',
  envMissingFields('FRAME_ENV_MISSING')
) {}

class FrameEnvInvalidError extends Schema.TaggedError<FrameEnvInvalidError, { readonly brand: unique symbol }>()(
  'FrameEnvInvalidError',
  envMissingFields('FRAME_ENV_INVALID')
) {}

class CalendarUnreachableError extends Schema.TaggedError<
  CalendarUnreachableError,
  { readonly brand: unique symbol }
>()('CalendarUnreachableError', unreachableFields('CALENDAR_UNREACHABLE')) {}

class CalendarHttpError extends Schema.TaggedError<CalendarHttpError, { readonly brand: unique symbol }>()(
  'CalendarHttpError',
  httpErrorFields('CALENDAR_HTTP_ERROR')
) {}

class CalendarDecodeError extends Schema.TaggedError<CalendarDecodeError, { readonly brand: unique symbol }>()(
  'CalendarDecodeError',
  decodeErrorFields('CALENDAR_DECODE_ERROR')
) {}

class HomeAssistantUnreachableError extends Schema.TaggedError<
  HomeAssistantUnreachableError,
  { readonly brand: unique symbol }
>()('HomeAssistantUnreachableError', unreachableFields('HOME_ASSISTANT_UNREACHABLE')) {}

class HomeAssistantHttpError extends Schema.TaggedError<HomeAssistantHttpError, { readonly brand: unique symbol }>()(
  'HomeAssistantHttpError',
  httpErrorFields('HOME_ASSISTANT_HTTP_ERROR')
) {}

class HomeAssistantDecodeError extends Schema.TaggedError<
  HomeAssistantDecodeError,
  { readonly brand: unique symbol }
>()('HomeAssistantDecodeError', decodeErrorFields('HOME_ASSISTANT_DECODE_ERROR')) {}

const CalendarError = Schema.Union([
  FrameEnvMissingError,
  FrameEnvInvalidError,
  CalendarUnreachableError,
  CalendarHttpError,
  CalendarDecodeError,
])

export type CalendarError = typeof CalendarError.Type

const HomeAssistantError = Schema.Union([
  FrameEnvMissingError,
  FrameEnvInvalidError,
  HomeAssistantUnreachableError,
  HomeAssistantHttpError,
  HomeAssistantDecodeError,
])

export type HomeAssistantError = typeof HomeAssistantError.Type

const envFix = "Provision the frame's environment file on the deployment host; see apps/frame/README.md."

export const envMissing = makeEnvMissing({ error: FrameEnvMissingError, code: 'FRAME_ENV_MISSING', fix: envFix })

/** A set environment variable whose value the frame cannot use. The reason never includes a credential. */
export const envInvalid = ({
  variable,
  reason,
}: {
  readonly variable: string
  readonly reason: string
}): FrameEnvInvalidError =>
  FrameEnvInvalidError.make({ code: 'FRAME_ENV_INVALID', message: `${variable} is invalid: ${reason}`, fix: envFix })

/** An adapter failure: a fixed message and, optionally, the cause kept for diagnosis. */
interface AdapterFailure {
  readonly message: string
  readonly cause?: unknown
}

// The service account key and access tokens are credentials, so adapter messages never include them or an
// upstream error message.
export const calendarUnreachable: (failure: AdapterFailure) => CalendarUnreachableError = makeUnreachable({
  error: CalendarUnreachableError,
  code: 'CALENDAR_UNREACHABLE',
  fix: 'Verify this host can reach oauth2.googleapis.com and www.googleapis.com.',
})

export const calendarHttpError = makeHttpError({
  error: CalendarHttpError,
  code: 'CALENDAR_HTTP_ERROR',
  displayName: 'Google Calendar',
  fix: 'Check that GOOGLE_SERVICE_ACCOUNT_KEY is a current key and GOOGLE_CALENDAR_ID is shared with that account.',
})

export const calendarDecodeError: (failure: AdapterFailure) => CalendarDecodeError = makeDecodeError({
  error: CalendarDecodeError,
  code: 'CALENDAR_DECODE_ERROR',
  fix: 'Update the calendar mapping to match the Google Calendar event shape.',
})

export const homeAssistantUnreachable: (failure: AdapterFailure) => HomeAssistantUnreachableError = makeUnreachable({
  error: HomeAssistantUnreachableError,
  code: 'HOME_ASSISTANT_UNREACHABLE',
  fix: 'Verify this host can reach HOME_ASSISTANT_URL.',
})

export const homeAssistantHttpError = makeHttpError({
  error: HomeAssistantHttpError,
  code: 'HOME_ASSISTANT_HTTP_ERROR',
  displayName: 'Home Assistant',
  fix: 'Check HOME_ASSISTANT_TOKEN and the configured entity IDs.',
})

export const homeAssistantDecodeError: (failure: AdapterFailure) => HomeAssistantDecodeError = makeDecodeError({
  error: HomeAssistantDecodeError,
  code: 'HOME_ASSISTANT_DECODE_ERROR',
  fix: 'Update the Home Assistant schemas to match the API response shape.',
})
