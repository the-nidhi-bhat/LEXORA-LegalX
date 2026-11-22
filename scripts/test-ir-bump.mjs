import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { nextIrMajorVersion } from '../src/features/contract-ir/version.ts'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ir = await readFile(new URL('../src/features/contract-ir/ContractIR.tsx', import.meta.url), 'utf8')

// B-39: a revision bumps the major component, never the concatenated digits.
assert.equal(nextIrMajorVersion('v1.2'), 'v2.0', 'v1.2 must not become v13.0')
assert.equal(nextIrMajorVersion('v1.0'), 'v2.0', 'v1.0 must not become v11.0')
assert.equal(nextIrMajorVersion('v2.3'), 'v3.0', 'v2.3 must not become v24.0')
assert.equal(nextIrMajorVersion('v12.4'), 'v13.0', 'already-major-12 still bumps cleanly')
assert.equal(nextIrMajorVersion(undefined), 'v2.0', 'missing version falls back to v1.0')

assert.ok(ir.includes("import { nextIrMajorVersion } from './version'"), 'Contract IR imports the bump helper')
assert.ok(ir.includes('const bumped = nextIrMajorVersion(cur.ir?.version || \'v1\');'), 'simulation revision uses the helper')
assert.ok(app.includes("import { irVersionNumber, nextIrMajorVersion } from './features/contract-ir/version'"), 'App imports the bump helper')
assert.ok(app.includes("version: prev.ir ? nextIrMajorVersion(prev.ir.version) : 'v1.0'"), 'regeneration bump uses the helper')
assert.ok(app.includes("const bumped = nextIrMajorVersion(current.ir.version || 'v1');"), 'explicit revision bump uses the helper')
assert.ok(!app.includes('replace(/[^0-9]/g') && !ir.includes('replace(/[^0-9]/g'), 'digit-stripping bump is gone everywhere')

console.log('IR bump checks passed: revisions bump the major component (v1.2 -> v2.0)')
