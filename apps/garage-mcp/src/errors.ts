import type { AutocaliwebError } from '@garage/autocaliweb'
import type { SabnzbdError } from '@garage/sabnzbd'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'

/** Safe, structured representation of an expected Garage MCP tool failure. */
const GarageMcpFailure = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  fix: Schema.String,
})

/** Safe, structured representation of an expected Garage MCP tool failure. */
export type GarageMcpFailure = typeof GarageMcpFailure.Type

/** Declared tool error whose MCP text content contains a structured, credential-free failure. */
export class GarageMcpToolError extends Schema.TaggedError<GarageMcpToolError, { readonly brand: unique symbol }>()(
  'GarageMcpToolError',
  {
    code: Schema.String,
    detail: Schema.String,
    fix: Schema.String,
    message: Schema.String,
  }
) {}

const encodeFailure = Schema.encodeEffect(Schema.fromJsonString(GarageMcpFailure))

/** Fail with the MCP tool error representation of a safe public failure value. */
export const failGarageMcpTool = (failure: GarageMcpFailure): Effect.Effect<never, GarageMcpToolError> =>
  encodeFailure(failure).pipe(
    // A struct of strings always encodes to JSON; a failure here is a defect.
    Effect.orDie,
    Effect.flatMap((message) =>
      Effect.fail(
        GarageMcpToolError.make({
          code: failure.code,
          detail: failure.message,
          fix: failure.fix,
          message,
        })
      )
    )
  )

/** Fail with a deployment-appropriate, credential-free MCP failure for an AutoCaliWeb package error. */
export const failAutocaliwebTool = (error: AutocaliwebError): Effect.Effect<never, GarageMcpToolError> =>
  Match.value(error.code).pipe(
    Match.when('AUTOCALIWEB_ENV_MISSING', (code) =>
      failGarageMcpTool({
        code,
        message: 'Garage MCP is missing required AutoCaliWeb configuration.',
        fix: 'Provision AUTOCALIWEB_URL, AUTOCALIWEB_USERNAME, and AUTOCALIWEB_PASSWORD through the Garage MCP secret environment, then restart the service.',
      })
    ),
    Match.when('AUTOCALIWEB_UNREACHABLE', (code) =>
      failGarageMcpTool({
        code,
        message: 'Garage MCP could not reach AutoCaliWeb.',
        fix: 'Verify the private network path and the provisioned AUTOCALIWEB_URL, then retry.',
      })
    ),
    Match.when('AUTOCALIWEB_HTTP_ERROR', (code) =>
      failGarageMcpTool({
        code,
        message: 'AutoCaliWeb rejected the Garage MCP request.',
        fix: 'Verify the provisioned Basic auth credentials and inspect AutoCaliWeb logs without exposing credentials.',
      })
    ),
    Match.when('AUTOCALIWEB_DECODE_ERROR', (code) =>
      failGarageMcpTool({
        code,
        message: 'AutoCaliWeb returned a response that Garage MCP could not decode.',
        fix: 'Update the AutoCaliWeb OPDS or JSON schema for the running server version.',
      })
    ),
    Match.exhaustive
  )

/** Fail with a deployment-appropriate, credential-free MCP failure for a SABnzbd package error. */
export const failSabnzbdTool = (error: SabnzbdError): Effect.Effect<never, GarageMcpToolError> =>
  Match.value(error.code).pipe(
    Match.when('SABNZBD_ENV_MISSING', (code) =>
      failGarageMcpTool({
        code,
        message: 'Garage MCP is missing required SABnzbd configuration.',
        fix: 'Provision SABNZBD_URL and SABNZBD_API_KEY through the Garage MCP secret environment, then restart the service.',
      })
    ),
    Match.when('SABNZBD_UNREACHABLE', (code) =>
      failGarageMcpTool({
        code,
        message: 'Garage MCP could not reach SABnzbd.',
        fix: 'Verify the private network path and the provisioned SABNZBD_URL, then retry.',
      })
    ),
    Match.when('SABNZBD_HTTP_ERROR', (code) =>
      failGarageMcpTool({
        code,
        message: 'SABnzbd rejected the Garage MCP request.',
        fix: 'Verify the provisioned API key and inspect SABnzbd logs without exposing credentials.',
      })
    ),
    Match.when('SABNZBD_DECODE_ERROR', (code) =>
      failGarageMcpTool({
        code,
        message: 'SABnzbd returned a response that Garage MCP could not decode.',
        fix: 'Update the SABnzbd wire schema for the running server version.',
      })
    ),
    Match.exhaustive
  )
