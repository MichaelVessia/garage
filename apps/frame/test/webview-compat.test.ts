import { assert, describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'

import { findIncompatibilities } from '../scripts/webview-compat.js'

describe('findIncompatibilities', () => {
  it('flags JavaScript APIs newer than Chrome 106', () => {
    const findings = findIncompatibilities({
      file: 'assets/index.js',
      text: 'const a = xs.toSorted((l, r) => l - r); Object.groupBy(xs, f)',
    })

    assert.deepStrictEqual(
      Arr.map(findings, (finding) => finding.feature),
      ['Array.prototype.toSorted (Chrome 110)', 'Object.groupBy / Map.groupBy (Chrome 117)']
    )
  })

  it('flags CSS the WebView rejects', () => {
    const findings = findIncompatibilities({
      file: 'assets/index.css',
      text: '.a{color:oklch(50% .1 200);background:#0000}.b:has(.c){height:100dvh}.d{&:hover{color:red}}',
    })

    assert.deepStrictEqual(
      Arr.map(findings, (finding) => finding.feature),
      ['oklch()', ':has()', 'dynamic viewport units', '4- or 8-digit hex colour', 'CSS nesting']
    )
  })

  it('accepts supported output', () => {
    assert.deepStrictEqual(
      findIncompatibilities({ file: 'assets/index.css', text: '.a{color:#111111;background:rgba(0,0,0,.5)}' }),
      []
    )
    assert.deepStrictEqual(
      findIncompatibilities({ file: 'assets/index.js', text: 'xs.slice().sort(); Object.hasOwn(o, k)' }),
      []
    )
  })
})
