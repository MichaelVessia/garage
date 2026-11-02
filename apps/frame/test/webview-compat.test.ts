import { assert, describe, it } from '@effect/vitest'

import { findIncompatibilities } from '../scripts/webview-compat.js'

describe('findIncompatibilities', () => {
  it('flags JavaScript APIs newer than Chrome 106', () => {
    const findings = findIncompatibilities(
      'assets/index.js',
      'const a = xs.toSorted((l, r) => l - r); Object.groupBy(xs, f)'
    )

    assert.deepStrictEqual(
      findings.map((finding) => finding.feature),
      ['Array.prototype.toSorted (Chrome 110)', 'Object.groupBy / Map.groupBy (Chrome 117)']
    )
  })

  it('flags CSS the WebView rejects', () => {
    const findings = findIncompatibilities(
      'assets/index.css',
      '.a{color:oklch(50% .1 200);background:#0000}.b:has(.c){height:100dvh}.d{&:hover{color:red}}'
    )

    assert.deepStrictEqual(
      findings.map((finding) => finding.feature),
      ['oklch()', ':has()', 'dynamic viewport units', '4- or 8-digit hex colour', 'CSS nesting']
    )
  })

  it('accepts supported output', () => {
    assert.deepStrictEqual(findIncompatibilities('assets/index.css', '.a{color:#111111;background:rgba(0,0,0,.5)}'), [])
    assert.deepStrictEqual(findIncompatibilities('assets/index.js', 'xs.slice().sort(); Object.hasOwn(o, k)'), [])
  })
})
