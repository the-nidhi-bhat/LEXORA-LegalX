import assert from 'node:assert/strict'

// Basic config tests (no hardcoded localhost, centralized base URL behavior)
process.env.VITE_API_BASE_URL = 'https://api.example.test/api/v1/'
const { getApiBaseUrl, isRetryableStatus } = await import('../src/api/config.ts')
assert.equal(getApiBaseUrl(), 'https://api.example.test/api/v1', 'base URL trims trailing slash and uses env config')
delete process.env.VITE_API_BASE_URL
// re-import cache note: config function reads env at call time, so behavior should reflect
assert.equal(getApiBaseUrl(), '/api/v1', 'defaults to relative /api/v1 (no localhost hardcode)')
assert.equal(isRetryableStatus(503), true)
assert.equal(isRetryableStatus(429), true)
assert.equal(isRetryableStatus(404), false)

const api = await import('../src/api/client.ts')
assert.equal(typeof api.apiRequest, 'function')
assert.equal(typeof api.apiClient.get, 'function')
assert.equal(typeof api.apiClient.post, 'function')
assert.equal(typeof api.agreementsApi.list, 'function')

// Backend-shaped error envelope nests request_id inside the error object;
// it must still surface as requestId on the normalized error envelope.
globalThis.fetch = async () => ({
  ok: false,
  status: 401,
  headers: { get: (name) => (name === 'content-type' ? 'application/json' : null) },
  json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials', details: [], request_id: 'req-regression-401' } }),
})
const errorEnv = await api.apiRequest('/auth/session', { method: 'POST', json: { email: 'x', password: 'y' } })
assert.equal(errorEnv.ok, false, 'backend error envelope maps to an error envelope')
assert.equal(errorEnv.error.code, 'UNAUTHORIZED', 'backend error code is preserved')
assert.equal(errorEnv.requestId, 'req-regression-401', 'nested error.request_id is surfaced as requestId')
console.log('api client tests passed')
