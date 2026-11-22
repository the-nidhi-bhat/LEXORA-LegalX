import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { irVersionNumber, nextIrMajorVersion, parseIrVersion } from '../src/features/contract-ir/version.ts'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

// B-38: v1.2 is version 1 for the backend, not the digit soup "12".
assert.equal(irVersionNumber('v1.2'), 1, 'v1.2 maps to major version 1')
assert.equal(irVersionNumber('v1.0'), 1, 'v1.0 maps to major version 1')
assert.equal(irVersionNumber('v2.3'), 2, 'v2.3 maps to major version 2')
assert.equal(irVersionNumber(undefined), 1, 'missing version falls back to 1')
assert.deepEqual(parseIrVersion('v1.2'), { major: 1, minor: 2 }, 'components are parsed separately')

// B-39 helper is available for the revision bump used in the next fix.
assert.equal(nextIrMajorVersion('v1.2'), 'v2.0', 'v1.2 bumps to v2.0, not v13.0')
assert.equal(nextIrMajorVersion('v1.0'), 'v2.0', 'v1.0 bumps to v2.0, not v11.0')

assert.match(app, /import \{[^}]*irVersionNumber[^}]*\} from '\.\/features\/contract-ir\/version'/, 'App imports the version helper')
assert.ok(app.includes('const version = irVersionNumber(ir?.version || \'v1\')'), 'backend verification uses the parsed version')
assert.ok(!app.includes("parseInt(String(ir?.version || 'v1').replace(/[^0-9]/g, ''), 10)"), 'digit-stripping derivation is gone')

console.log('version number checks passed: v1.2 derives version 1 and revision labels parse by component')
