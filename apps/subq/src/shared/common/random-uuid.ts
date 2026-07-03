import * as Effect from 'effect/Effect'
import * as Random from 'effect/Random'

const randomByte = Random.nextIntBetween(0, 255)

const hexByte = (byte: number): string => byte.toString(16).padStart(2, '0')

export const randomUuid = Effect.fn('randomUuid')(function* () {
  const byte0 = yield* randomByte
  const byte1 = yield* randomByte
  const byte2 = yield* randomByte
  const byte3 = yield* randomByte
  const byte4 = yield* randomByte
  const byte5 = yield* randomByte
  const byte6 = yield* randomByte
  const byte7 = yield* randomByte
  const byte8 = yield* randomByte
  const byte9 = yield* randomByte
  const byte10 = yield* randomByte
  const byte11 = yield* randomByte
  const byte12 = yield* randomByte
  const byte13 = yield* randomByte
  const byte14 = yield* randomByte
  const byte15 = yield* randomByte
  const versionByte = 0x40 + (byte6 % 0x10)
  const variantByte = 0x80 + (byte8 % 0x40)

  return `${hexByte(byte0)}${hexByte(byte1)}${hexByte(byte2)}${hexByte(byte3)}-${hexByte(byte4)}${hexByte(
    byte5
  )}-${hexByte(versionByte)}${hexByte(byte7)}-${hexByte(variantByte)}${hexByte(byte9)}-${hexByte(
    byte10
  )}${hexByte(byte11)}${hexByte(byte12)}${hexByte(byte13)}${hexByte(byte14)}${hexByte(byte15)}`
})
