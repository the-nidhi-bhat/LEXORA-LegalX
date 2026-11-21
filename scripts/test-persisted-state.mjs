import assert from 'node:assert/strict'
import { readStoredProfile, PROFILE_KEY, readSettings, SETTINGS_KEY } from '../src/demo-state.ts'

const records = new Map()
globalThis.window = { localStorage: { getItem: key => records.get(key) ?? null } }
records.set(PROFILE_KEY, JSON.stringify({ name: ' Reviewer ', email: 'r@example.test', workspaceName: {}, jobTitle: 1, useCase: ' Review ' }))
const profile = readStoredProfile()
assert.equal(profile.workspaceName, 'Acme Digital')
assert.equal(profile.jobTitle, 'Product & AI lead')
assert.equal(profile.useCase, 'Review')
assert.equal(profile.name, 'Reviewer')
