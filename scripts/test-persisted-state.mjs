import assert from 'node:assert/strict'
import { readGuidedStep, readStoredProfile, PROFILE_KEY, readSettings, SETTINGS_KEY } from '../src/demo-state.ts'

const records = new Map()
globalThis.window = { localStorage: { getItem: key => records.get(key) ?? null } }
records.set(PROFILE_KEY, JSON.stringify({ name: ' Reviewer ', email: 'r@example.test', workspaceName: {}, jobTitle: 1, useCase: ' Review ' }))
const profile = readStoredProfile()
assert.equal(profile.workspaceName, 'Acme Digital')
assert.equal(profile.jobTitle, 'Product & AI lead')
assert.equal(profile.useCase, 'Review')
assert.equal(profile.name, 'Reviewer')

records.set(SETTINGS_KEY, JSON.stringify({ emailNotifications: false, blockCriticalMismatches: 'false', extra: true }))
assert.deepEqual(readSettings(), { emailNotifications: false, blockCriticalMismatches: true, askForSourceClauses: true, requireWalletConfirmation: true })

for (const [stored, expected] of [['NaN', 0], ['1.5', 0], ['-1', 0], ['5', 0], ['3', 3]]) {
  records.set('legalx:guided-step', stored)
  assert.equal(readGuidedStep(5), expected)
}
