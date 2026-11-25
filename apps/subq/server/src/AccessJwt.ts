import type { JsonWebKey } from '@cloudflare/workers-types'
import { Unauthorized } from '@garage/subq-domain/Session.middleware'
import * as Arr from 'effect/Array'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Base64Url from 'effect/encoding/Base64Url'
import * as HttpClient from 'effect/http/HttpClient'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

const JwtHeader = Schema.fromJsonString(
  Schema.Struct({
    alg: Schema.Literal('RS256'),
    kid: Schema.NonEmptyString,
  })
)
const Claims = Schema.fromJsonString(
  Schema.Struct({
    iss: Schema.String,
    aud: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
    exp: Schema.Finite,
    nbf: Schema.optionalKey(Schema.Finite),
    email: Schema.optionalKey(Schema.NonEmptyString),
    common_name: Schema.optionalKey(Schema.NonEmptyString),
  })
)
type Claims = typeof Claims.Type

const RsaPublicKey = Schema.Struct({
  kid: Schema.NonEmptyString,
  kty: Schema.Literal('RSA'),
  n: Schema.NonEmptyString,
  e: Schema.NonEmptyString,
  alg: Schema.optionalKey(Schema.Literal('RS256')),
  use: Schema.optionalKey(Schema.Literal('sig')),
})
const Jwks = Schema.Struct({ keys: Schema.Array(Schema.Unknown) })
const rs256 = 'RSASSA-PKCS1-v1_5'
const jwksTtl = Duration.toMillis(Duration.minutes(5))

interface CachedKeys {
  readonly issuer: string
  readonly expiresAt: number
  readonly keys: ReadonlyArray<typeof RsaPublicKey.Type>
}

const parseJwt = (token: string) => {
  const parts = Str.split(token, '.')
  const [header, payload, signature] = parts
  if (
    parts.length !== 3 ||
    header === undefined ||
    payload === undefined ||
    signature === undefined ||
    !Arr.every(parts, (part) => /^[A-Za-z0-9_-]+$/u.test(part))
  ) {
    return Option.none()
  }
  return Option.all({
    header: Base64Url.decodeString(header).pipe(Result.getOrUndefined, Schema.decodeUnknownOption(JwtHeader)),
    claims: Base64Url.decodeString(payload).pipe(Result.getOrUndefined, Schema.decodeUnknownOption(Claims)),
    signature: Base64Url.decode(signature).pipe(Result.getOrUndefined, Option.fromUndefinedOr),
  }).pipe(Option.map((jwt) => ({ ...jwt, signed: `${header}.${payload}` })))
}

interface Verification {
  readonly token: string
  readonly issuer: string
  readonly audience: string
}

export class AccessJwt extends Context.Service<
  AccessJwt,
  {
    readonly verify: (input: Verification) => Effect.Effect<Claims, Unauthorized>
  }
>()('@garage/subq-server/AccessJwt', {
  make: Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const http = HttpClient.filterStatusOk(client)
    const fetchKeys = (issuer: string) =>
      http.get(`${issuer}/cdn-cgi/access/certs`).pipe(
        Effect.flatMap((response) => response.json),
        Effect.map(Schema.decodeUnknownOption(Jwks)),
        Effect.timeout('5 seconds'),
        Effect.option,
        Effect.map(Option.flatten),
        Effect.map(Option.getOrElse(() => ({ keys: [] }))),
        Effect.map(({ keys }) =>
          Arr.flatMap(keys, (key) => Option.toArray(Schema.decodeUnknownOption(RsaPublicKey)(key)))
        )
      )
    // Share the public keys across Worker requests. Keep the fetch in the current request.
    const cache = yield* Ref.make(Option.none<CachedKeys>())

    const verify = Effect.fn('subq.accessJwt.verify')(function* ({ token, issuer, audience }: Verification) {
      const jwt = parseJwt(token)
      if (Option.isNone(jwt)) {
        return yield* Unauthorized.make({})
      }
      const { header, claims, signature, signed } = jwt.value
      const nowMillis = yield* Clock.currentTimeMillis
      const now = nowMillis / 1000
      if (
        claims.iss !== issuer ||
        ![claims.aud].flat().includes(audience) ||
        claims.exp <= now ||
        (claims.nbf !== undefined && claims.nbf > now)
      ) {
        return yield* Unauthorized.make({})
      }

      const snapshot = yield* Ref.get(cache)
      const cachedKey = snapshot.pipe(
        Option.filter((entry) => entry.issuer === issuer && entry.expiresAt > nowMillis),
        Option.flatMap((entry) => Arr.findFirst(entry.keys, (key) => key.kid === header.kid))
      )
      const key = yield* Option.match(cachedKey, {
        onSome: Effect.succeed,
        onNone: () =>
          Effect.gen(function* () {
            const keys = yield* fetchKeys(issuer)
            if (Arr.isReadonlyArrayNonEmpty(keys)) {
              yield* Ref.update(cache, (current) =>
                current === snapshot ? Option.some({ issuer, expiresAt: nowMillis + jwksTtl, keys }) : current
              )
            }
            return yield* Arr.findFirst(keys, (key) => key.kid === header.kid).pipe(
              Effect.fromOption(() => Unauthorized.make({}))
            )
          }),
      })
      const jwk = key satisfies JsonWebKey
      const publicKey = yield* Effect.tryPromise({
        try: () => crypto.subtle.importKey('jwk', jwk, { name: rs256, hash: 'SHA-256' }, false, ['verify']),
        catch: () => Unauthorized.make({}),
      })
      const verified = yield* Effect.tryPromise({
        try: () => crypto.subtle.verify(rs256, publicKey, new Uint8Array(signature), new TextEncoder().encode(signed)),
        catch: () => Unauthorized.make({}),
      })
      return verified ? claims : yield* Unauthorized.make({})
    })
    return { verify }
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make)
}
