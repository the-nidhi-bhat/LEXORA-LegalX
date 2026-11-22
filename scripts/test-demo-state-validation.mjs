import assert from 'node:assert/strict'

// QI-003 / QI-004: exercise the persistence readers against malformed data.
// The window mock must exist before the dynamic import because the module
// reads window.localStorage at call time.
const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
  },
  addEventListener() {},
  dispatchEvent() {},
}

const state = await import('../src/demo-state.ts')

// QI-003: every persisted profile string field must be a trimmed string;
// wrong-typed fields fall back to the built-in defaults.
store.set(state.PROFILE_KEY, JSON.stringify({
  name: '  Nirvan  ',
  email: 'owner@legalx.demo',
  role: 'owner',
  workspaceName: 123,
  jobTitle: {},
  useCase: [],
}))
const profile = state.readStoredProfile()
assert.ok(profile, 'valid name/email still produce a profile')
for (const field of ['name', 'email', 'workspaceName', 'jobTitle', 'useCase']) {
  assert.equal(typeof profile[field], 'string', `${field} is returned as a string`)
}
assert.equal(profile.name, 'Nirvan', 'name is trimmed')
assert.equal(profile.email, 'owner@legalx.demo', 'email is preserved')
assert.equal(profile.workspaceName, 'Acme Digital', 'invalid workspaceName uses default')
assert.equal(profile.jobTitle, 'Product & AI lead', 'invalid jobTitle uses default')
assert.equal(profile.useCase, 'Freelance agreements', 'invalid useCase uses default')
assert.equal(profile.role, 'owner', 'valid role is preserved')
const account = state.effectiveAccount('owner')
assert.equal(account.name, 'Nirvan', 'effectiveAccount uses the validated profile name')
assert.equal(account.workspaceName, 'Acme Digital', 'effectiveAccount uses the validated workspace')
store.set(state.PROFILE_KEY, JSON.stringify({ name: 42, email: 'owner@legalx.demo' }))
assert.equal(state.readStoredProfile(), null, 'invalid name type still returns null')

// QI-004: only real booleans are accepted from persisted settings.
store.set(state.SETTINGS_KEY, JSON.stringify({
  blockCriticalMismatches: 'false',
  askForSourceClauses: null,
  requireWalletConfirmation: false,
  emailNotifications: 1,
}))
const settings = state.readSettings()
for (const key of ['blockCriticalMismatches', 'askForSourceClauses', 'requireWalletConfirmation', 'emailNotifications']) {
  assert.equal(typeof settings[key], 'boolean', `${key} is returned as a boolean`)
}
assert.equal(settings.blockCriticalMismatches, true, 'string value falls back to default')
assert.equal(settings.askForSourceClauses, true, 'null value falls back to default')
assert.equal(settings.requireWalletConfirmation, false, 'valid false value is preserved')
assert.equal(settings.emailNotifications, true, 'numeric value falls back to default')

console.log('demo state validation tests passed')
