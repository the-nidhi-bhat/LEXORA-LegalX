import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Regression guard: the parity harness must mirror the production vite config's
// __LEGALX_MEDIA__ define. Drift here caused a ReferenceError in FilmHero.tsx
// that crashed the app before render and broke the parity UI E2E suite.
const production = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
const parity = readFileSync(new URL('../vite.parity.config.ts', import.meta.url), 'utf8')

for (const [name, source] of [['vite.config.ts', production], ['vite.parity.config.ts', parity]]) {
  assert.ok(source.includes('__LEGALX_MEDIA__'), `${name} defines __LEGALX_MEDIA__`)
  assert.ok(source.includes('JSON.stringify(media)'), `${name} serializes media with JSON.stringify(media)`)
  assert.ok(source.includes('hasPublicAsset'), `${name} declares the hasPublicAsset helper`)
}

console.log('parity media define guard passed: vite.config.ts and vite.parity.config.ts both define __LEGALX_MEDIA__')
