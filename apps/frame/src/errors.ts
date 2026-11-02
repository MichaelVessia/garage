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

class FrameEnvMissingError extends Schema.TaggedError<FrameEnvMissingError>()(
  'FrameEnvMissingError',
  envMissingFields('FRAME_ENV_MISSING')
) {}

class FrameEnvInvalidError extends Schema.TaggedError<FrameEnvInvalidError>()(
  'FrameEnvInvalidError',
  envMissingFields('FRAME_ENV_INVALID')
) {}

class CalendarUnreachableError extends Schema.TaggedError<CalendarUnreachableError>()(
  'CalendarUnreachableError',
  unreachableFields('CALENDAR_UNREACHABLE')
) {}

class CalendarHttpError extends Schema.TaggedError<CalendarHttpError>()(
  'CalendarHttpError',
  httpErrorFields('CALENDAR_HTTP_ERROR')
) {}

class CalendarDecodeError extends Schema.TaggedError<CalendarDecodeError>()(
  'CalendarDecodeError',
  decodeErrorFields('CALENDAR_DECODE_ERROR')
) {}

class HomeAssistantUnreachableError extends Schema.TaggedError<HomeAssistantUnreachableError>()(
  'HomeAssistantUnreachableError',
  unreachableFields('HOME_ASSISTANT_UNREACHABLE')
) {}

class HomeAssistantHttpError extends Schema.TaggedError<HomeAssistantHttpError>()(
  'HomeAssistantHttpError',
  httpErrorFields('HOME_ASSISTANT_HTTP_ERROR')
) {}

class HomeAssistantDecodeError extends Schema.TaggedError<HomeAssistantDecodeError>()(
  'HomeAssistantDecodeError',
  decodeErrorFields('HOME_ASSISTANT_DECODE_ERROR')
) {}

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

export const envMissing = makeEnvMissing(FrameEnvMissingError, 'FRAME_ENV_MISSING', envFix)

/** A set environment variable whose value the frame cannot use. The reason never includes a credential. */
export const envInvalid = (variable: string, reason: string) =>
  new FrameEnvInvalidError({ code: 'FRAME_ENV_INVALID', message: `${variable} is invalid: ${reason}`, fix: envFix })

// The service account key and access tokens are credentials, so adapter messages never include them or an
// upstream error message.
export const calendarUnreachable = makeUnreachable(
  CalendarUnreachableError,
  'CALENDAR_UNREACHABLE',
  'Verify this host can reach oauth2.googleapis.com and www.googleapis.com.'
)

export const calendarHttpError = makeHttpError(
  CalendarHttpError,
  'CALENDAR_HTTP_ERROR',
  'Google Calendar',
  'Check that GOOGLE_SERVICE_ACCOUNT_KEY is a current key and GOOGLE_CALENDAR_ID is shared with that account.'
)

export const calendarDecodeError = makeDecodeError(
  CalendarDecodeError,
  'CALENDAR_DECODE_ERROR',
  'Update the calendar mapping to match the Google Calendar event shape.'
)

export const homeAssistantUnreachable = makeUnreachable(
  HomeAssistantUnreachableError,
  'HOME_ASSISTANT_UNREACHABLE',
  'Verify this host can reach HOME_ASSISTANT_URL.'
)

export const homeAssistantHttpError = makeHttpError(
  HomeAssistantHttpError,
  'HOME_ASSISTANT_HTTP_ERROR',
  'Home Assistant',
  'Check HOME_ASSISTANT_TOKEN and the configured entity IDs.'
)

export const homeAssistantDecodeError = makeDecodeError(
  HomeAssistantDecodeError,
  'HOME_ASSISTANT_DECODE_ERROR',
  'Update the Home Assistant schemas to match the API response shape.'
)
