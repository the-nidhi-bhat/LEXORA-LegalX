import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pages = await readFile(new URL('../src/backend-pages.tsx', import.meta.url), 'utf8')
assert.ok(pages.includes('const [saving, setSaving] = useState(false)'), 'save has an in-flight state')
assert.ok(pages.includes('disabled={saving}'), 'save button is disabled while in flight')

// Run the actual save() body from the source with a controlled, slow API call to
// prove a double-click cannot submit twice.
const marker = '  const save = async () => {'
const start = pages.indexOf(marker)
assert.notEqual(start, -1, 'save handler exists')
const end = pages.indexOf('\n  }\n\n  if (loading)', start)
assert.notEqual(end, -1, 'save handler end found')
// The body is TypeScript; drop its only type annotation before evaluating it.
const body = pages.slice(start + marker.length, end).replace(/:\s*any\b/g, '')

let inFlight = false
let calls = 0
let finishUpdate
const ctx = {
  getSaving: () => inFlight,
  setSaving: (value) => { inFlight = value },
  setSaveState: () => {},
  setAgreement: () => {},
  activeId: () => 'agreement-1',
  title: 'Website project',
  csrf: () => 'csrf-token',
  errMsg: () => 'request failed',
  agreementsApi: {
    update: () => {
      calls += 1
      return new Promise((resolve) => { finishUpdate = resolve })
    },
  },
}
const factory = new Function('ctx', `
  const { setSaving, setSaveState, activeId, title, agreementsApi, csrf, errMsg, setAgreement, getSaving } = ctx;
  return async () => { const saving = getSaving(); ${body} };
`)
const save = factory(ctx)
const firstClick = save()
const secondClick = save()
assert.equal(calls, 1, 'second click while in flight must not issue another update')
assert.equal(inFlight, true, 'save is marked in flight before the request resolves')
finishUpdate({ ok: true, data: { id: 'agreement-1' } })
await Promise.all([firstClick, secondClick])
assert.equal(calls, 1, 'only one update was submitted')
assert.equal(inFlight, false, 'in-flight flag is released after completion')

console.log('save in-flight checks passed: double-click submits once and the flag resets')
