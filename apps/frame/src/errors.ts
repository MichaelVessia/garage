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

class FrameEnvMissingError extends Schema.TaggedErrorClass<FrameEnvMissingError>()(
  'FrameEnvMissingError',
  envMissingFields('FRAME_ENV_MISSING')
) {}

class FrameEnvInvalidError extends Schema.TaggedErrorClass<FrameEnvInvalidError>()(
  'FrameEnvInvalidError',
  envMissingFields('FRAME_ENV_INVALID')
) {}

class CalendarUnreachableError extends Schema.TaggedErrorClass<CalendarUnreachableError>()(
  'CalendarUnreachableError',
  unreachableFields('CALENDAR_UNREACHABLE')
) {}

class CalendarHttpError extends Schema.TaggedErrorClass<CalendarHttpError>()(
  'CalendarHttpError',
  httpErrorFields('CALENDAR_HTTP_ERROR')
) {}

class CalendarDecodeError extends Schema.TaggedErrorClass<CalendarDecodeError>()(
  'CalendarDecodeError',
  decodeErrorFields('CALENDAR_DECODE_ERROR')
) {}

class HomeAssistantUnreachableError extends Schema.TaggedErrorClass<HomeAssistantUnreachableError>()(
  'HomeAssistantUnreachableError',
  unreachableFields('HOME_ASSISTANT_UNREACHABLE')
) {}

class HomeAssistantHttpError extends Schema.TaggedErrorClass<HomeAssistantHttpError>()(
  'HomeAssistantHttpError',
  httpErrorFields('HOME_ASSISTANT_HTTP_ERROR')
) {}

class HomeAssistantDecodeError extends Schema.TaggedErrorClass<HomeAssistantDecodeError>()(
  'HomeAssistantDecodeError',
  decodeErrorFields('HOME_ASSISTANT_DECODE_ERROR')
) {}

const CalendarError = Schema.Union([
  FrameEnvMissingError,
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

// The calendar URL is a credential, so adapter messages never include it or an upstream error message.
export const calendarUnreachable = makeUnreachable(
  CalendarUnreachableError,
  'CALENDAR_UNREACHABLE',
  'Verify this host can reach Google Calendar and CALENDAR_ICS_URL is the secret iCal address.'
)

export const calendarHttpError = makeHttpError(
  CalendarHttpError,
  'CALENDAR_HTTP_ERROR',
  'The calendar feed',
  'Check that CALENDAR_ICS_URL is current; resetting the secret address in Google invalidates the old one.'
)

export const calendarDecodeError = makeDecodeError(
  CalendarDecodeError,
  'CALENDAR_DECODE_ERROR',
  'Inspect the calendar feed for malformed iCalendar data.'
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
