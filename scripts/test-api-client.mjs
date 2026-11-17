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
console.log('api client tests passed')
