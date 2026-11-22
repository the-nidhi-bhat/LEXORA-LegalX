import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pages = await readFile(new URL('../src/backend-pages.tsx', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const executionRouter = await readFile(new URL('../api/app/routers/execution.py', import.meta.url), 'utf8')

const componentStart = pages.indexOf('export function BackendExecution')
assert.notEqual(componentStart, -1, 'BackendExecution component exists')
const component = pages.slice(componentStart)
const checkStart = component.indexOf('const check = async () => {')
assert.notEqual(checkStart, -1, 'check handler exists')
const checkEnd = component.indexOf('\n  return <div>', checkStart)
assert.notEqual(checkEnd, -1, 'check handler is followed by the rendered panel')
const check = component.slice(checkStart, checkEnd)

// B-37: "Check eligibility" must be a read-only observation, never an execution.
for (const forbidden of [
  'executionApi',
  '/execution',
  'apiClient.post',
  "confirm: false",
]) {
  assert.ok(!check.includes(forbidden), `eligibility check must not contain ${forbidden}`)
}
assert.ok(check.includes('agreementsApi.get('), 'check reads the persisted agreement')
assert.ok(check.includes('versionsApi.list('), 'check reads version/approval metadata')
assert.ok(component.includes('Check eligibility'), 'check control is still present')
assert.ok(component.includes('Read-only'), 'the UI labels the check as read-only')

// The real execution path must still exist, behind the authorized backend gate.
assert.ok(client.includes('executionApi'), 'authorized execution API remains available')
assert.ok(client.includes('/execution'), 'execution endpoint helper remains available')
assert.ok(executionRouter.includes('require("verification:run")'), 'execution still requires the verification:run gate')
assert.ok(executionRouter.includes('agreement.status != "draft"'), 'execution still enforces the draft-state gate')

console.log('eligibility read-only checks passed: check uses GET data only, POST /execution remains a separate authorized action')
