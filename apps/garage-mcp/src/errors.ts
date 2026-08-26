import type { SabnzbdError } from '@garage/sabnzbd'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'

/** Safe, structured representation of an expected Garage MCP tool failure. */
export const GarageMcpFailure = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  fix: Schema.String,
})
/** Safe, structured representation of an expected Garage MCP tool failure. */
export type GarageMcpFailure = typeof GarageMcpFailure.Type

/** Declared tool error whose MCP text content contains a structured, credential-free failure. */
export class GarageMcpToolError extends Schema.TaggedErrorClass<GarageMcpToolError>()('GarageMcpToolError', {
  code: Schema.String,
  detail: Schema.String,
  fix: Schema.String,
  message: Schema.String,
}) {}

const encodeFailure = Schema.encodeSync(Schema.fromJsonString(GarageMcpFailure))

/** Convert a safe public failure value into the MCP tool error representation. */
export const garageMcpToolError = (failure: GarageMcpFailure): GarageMcpToolError =>
  new GarageMcpToolError({
    code: failure.code,
    detail: failure.message,
    fix: failure.fix,
    message: encodeFailure(failure),
  })

/** Convert a SABnzbd package error into a deployment-appropriate, credential-free MCP failure. */
export const sabnzbdToolError = (error: SabnzbdError): GarageMcpToolError =>
  Match.value(error.code).pipe(
    Match.when('SABNZBD_ENV_MISSING', (code) =>
      garageMcpToolError({
        code,
        message: 'Garage MCP is missing required SABnzbd configuration.',
        fix: 'Provision SABNZBD_URL and SABNZBD_API_KEY through the Garage MCP secret environment, then restart the service.',
      })
    ),
    Match.when('SABNZBD_UNREACHABLE', (code) =>
      garageMcpToolError({
        code,
        message: 'Garage MCP could not reach SABnzbd.',
        fix: 'Verify the private network path and the provisioned SABNZBD_URL, then retry.',
      })
    ),
    Match.when('SABNZBD_HTTP_ERROR', (code) =>
      garageMcpToolError({
        code,
        message: 'SABnzbd rejected the Garage MCP request.',
        fix: 'Verify the provisioned API key and inspect SABnzbd logs without exposing credentials.',
      })
    ),
    Match.when('SABNZBD_DECODE_ERROR', (code) =>
      garageMcpToolError({
        code,
        message: 'SABnzbd returned a response that Garage MCP could not decode.',
        fix: 'Update the SABnzbd wire schema for the running server version.',
      })
    ),
    Match.exhaustive
  )
