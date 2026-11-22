import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/FilmHero.tsx', import.meta.url), 'utf8')
const productFilm = source.slice(source.indexOf('export function ProductFilm()'))
assert.ok(productFilm, 'ProductFilm component is present')

// QI-005: replay failures must be caught and announced; the captions track
// must remain untouched.
assert.match(productFilm, /play\(\)\.catch\(/, 'replay handles a rejected play() promise')
assert.match(productFilm, /role="alert"/, 'failure is exposed as an alert')
assert.match(productFilm, /aria-live/, 'failure is announced by a live region')
assert.match(productFilm, /<track\b/, 'captions track is still rendered')

console.log('film replay tests passed')
