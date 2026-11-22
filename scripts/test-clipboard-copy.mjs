import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/features/contract-ir/ContractIR.tsx', import.meta.url), 'utf8')
assert.ok(source.includes("const [copyError, setCopyError] = useState('')"), 'copy has a failure state')
assert.ok(source.includes('{copyError && <p role="alert" className="inline-error"'), 'copy failure is surfaced in the UI')
assert.ok(!source.includes('navigator.clipboard?.writeText(JSON.stringify(ir, null, 2)); setCopied(true);'), 'no unconditional success after a clipboard call')

const marker = '  const copyIr = () => {'
const start = source.indexOf(marker)
assert.notEqual(start, -1, 'copy handler exists')
const end = source.indexOf('\n  if (!ir) return <div>', start)
assert.notEqual(end, -1, 'copy handler end found')
const body = source.slice(start + marker.length, end).replace(/\n\s*};\s*$/, '')
assert.ok(body.includes('.catch('), 'clipboard rejection is handled')

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function harness(writeText) {
  const state = { copied: false, copyError: '', notices: [] }
  const setCopied = (value) => { state.copied = value }
  const setCopyError = (value) => { state.copyError = value }
  const windowMock = {
    dispatchEvent: (event) => { state.notices.push(event.detail) },
    setTimeout: () => 0,
  }
  const factory = new Function('navigator', 'window', 'ir', 'setCopied', 'setCopyError', `return () => { ${body} }`)
  const copy = factory({ clipboard: { writeText } }, windowMock, { version: 'v1.2' }, setCopied, setCopyError)
  return { state, copy }
}

const rejected = harness(() => Promise.reject(new Error('permission denied')))
rejected.copy()
await tick()
assert.equal(rejected.state.copied, false, 'rejected write must not be shown as copied')
assert.match(rejected.state.copyError, /Copy failed/, 'failure state is set')
assert.ok(rejected.state.notices.some((n) => n.includes('Nothing was copied')), 'failure notice is emitted')
assert.ok(!rejected.state.notices.some((n) => n.includes('copied locally')), 'no false success notice')

const resolved = harness(() => Promise.resolve())
resolved.state.copyError = 'previous failure'
resolved.copy()
await tick()
assert.equal(resolved.state.copied, true, 'successful write is still shown as copied')
assert.equal(resolved.state.copyError, '', 'stale failure is cleared')
assert.ok(resolved.state.notices.some((n) => n.includes('copied locally')), 'success notice is emitted')

console.log('clipboard copy checks passed: rejection surfaces failure, success still reports copied')
