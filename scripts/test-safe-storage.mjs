import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { safeGet, safeKeys, safeRemove, safeSet } from '../src/components/safeStorage.ts'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const pages = await readFile(new URL('../src/backend-pages.tsx', import.meta.url), 'utf8')

// B-40: a blocked/disabled localStorage must never take down rendering.
const blocked = new Proxy({}, {
  get() { throw new Error('SecurityError: storage access denied') },
  set() { throw new Error('SecurityError: storage access denied') },
  has() { throw new Error('SecurityError: storage access denied') },
  ownKeys() { throw new Error('SecurityError: storage access denied') },
})
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: blocked })
assert.equal(safeGet('legalx:role'), null, 'blocked read degrades to null')
assert.doesNotThrow(() => safeSet('legalx:role', 'owner'), 'blocked write is swallowed')
assert.doesNotThrow(() => safeRemove('legalx:role'), 'blocked delete is swallowed')
assert.deepEqual(safeKeys(), [], 'blocked enumeration degrades to an empty list')

// A usable storage still behaves normally through the wrapper.
const store = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
  },
})
safeSet('key', 'value')
assert.equal(safeGet('key'), 'value', 'write/read round trip')
safeRemove('key')
assert.equal(safeGet('key'), null, 'remove works through the wrapper')

// The wrapper must actually be wired into the startup/render paths.
assert.ok(app.includes("from './components/safeStorage'"), 'App imports the safe accessors')
assert.ok(pages.includes("from './components/safeStorage'"), 'backend pages import the safe accessors')
assert.ok(app.includes('function readNetworkMode(): NetworkMode { const mode = safeGet('), 'network mode read is guarded')
assert.ok(pages.includes("const csrf = () => safeGet('legalx:csrf') || ''"), 'csrf read is guarded')
assert.ok(pages.includes("const activeId = () => safeGet('legalx:active-agreement') || ''"), 'active agreement read is guarded')
assert.ok(!app.includes('localStorage.getItem('), 'no bare localStorage read remains in App')
assert.ok(!pages.includes('localStorage.getItem('), 'no bare localStorage read remains in backend pages')
assert.ok(!pages.includes('localStorage.setItem('), 'no bare localStorage write remains in backend pages')
assert.ok(app.includes("key.startsWith('legalx:')"), 'safe local-only reset boundary is preserved')
const directWrites = app.split('\n').filter(line => line.includes('localStorage.setItem('))
assert.equal(directWrites.length, 1, 'only the asserted ai-parsed literal remains direct')
assert.ok(directWrites[0].trim().startsWith('try {') && directWrites[0].includes('} catch {'), 'that literal is wrapped in try/catch')
assert.ok(directWrites[0].includes("localStorage.setItem('legalx:ai-parsed', 'true')"), 'asserted literal is byte-identical')

console.log('safe storage checks passed: blocked localStorage degrades safely and UI reads/writes use the wrapper')
