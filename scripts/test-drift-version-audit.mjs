import assert from 'node:assert/strict'
import { hashIr, hashSolidity, computeDrift, getAuditTrail, verifyAuditTrail, appendAuditEvent, buildVersionRecord, upsertVersionRecord, irMaterialView } from '../src/integrity.ts'
import { detectAndApplyDrift, snapshotApproved, ensureIntegrityFields, logEvent, recordVersion } from '../src/workflow-integrity.ts'
import { deriveExecution } from '../src/demo-state.ts'

const baseWorkflow = () => ({
  mode: 'demo',
  extraction: { status: 'success', message: '', sourceText: 'src' },
  ir: { version: 'v1.0', agreement_type: 'freelance_milestone', currency: 'INR', total_amount: 50000, milestones: [{ name: 'Design approval', amount: 20000 }, { name: 'Website delivery', amount: 30000 }], review_period_days: 5, dispute_behavior: 'freeze_affected_payment', governing_law: null, provenance: [] },
  validation: { status: 'valid', issues: [], checkedAt: 'now' },
  parity: { status: 'matched', score: 100, mismatches: [], checkedAt: 'now', executionParams: { total: 50000, milestones: [20000,30000], reviewDays: 5, disputeFreeze: true } },
  reviews: [], revisions: [],
  approval: { status: 'approved', by: 'Owner', at: 'now', note: 'approved' },
  solidity: { generation: { status: 'success', message: '', filename: 'c.sol', irVersion: 'v1.0', source: 'contract A', metadata: { deterministicHash: 'x' }, supported: [], unsupported: [], security: [], errors: [] }, compilation: { status: 'not_run', ranAt: '', message: '', tool: 'unavailable' }, tests: { status: 'passed', ranAt: 'now', summary: 'ok', cases: [] } },
  traceability: { clauses: [], snapshots: {}, history: [] },
  simulation: null,
  approvedSnapshot: null,
  drift: { status: 'no_snapshot', checkedAt: '', irHashMatches: false, solidityHashMatches: false, currentIrHash: null, currentSolidityHash: null, snapshot: null, changes: [], materialChange: false },
  versionHistory: [],
  auditTrail: { implementation: 'locally_persisted_hash_chain', label: 'Locally persisted hash-linked audit trail (tamper-evident within local storage limitations; not immutable blockchain storage).', events: [] },
  execution: { status: 'ready', reason: '' },
})

// --- Drift detection ---
let wf = baseWorkflow()
wf = snapshotApproved(wf, { name: 'Owner', role: 'owner' })
assert.ok(wf.approvedSnapshot?.irHash, 'approved snapshot recorded with IR hash')
assert.ok(wf.approvedSnapshot?.solidityHash, 'approved snapshot recorded with Solidity hash')

// unchanged
let drift = computeDrift(wf)
assert.equal(drift.status, 'unchanged')
assert.equal(drift.materialChange, false)

// modified IR detection (material fields) + approval invalidation + readiness blocking
let modified = JSON.parse(JSON.stringify(wf))
modified.ir.total_amount = 55000
modified.ir.milestones = [{ name: 'Design approval', amount: 25000 }, { name: 'Website delivery', amount: 30000 }]
const res = detectAndApplyDrift(modified, { name: 'Owner', role: 'owner' })
modified = res.workflow
assert.equal(res.report.status, 'drift_detected')
assert.equal(res.report.materialChange, true)
assert.ok(res.report.changes.some(c => c.field === 'total_amount' && c.material), 'total amount change detected')
assert.ok(res.report.changes.some(c => c.field === 'milestones' && c.material), 'milestone amount change detected')
assert.equal(modified.approval.status, 'blocked', 'stale approval invalidated on material drift')
assert.equal(deriveExecution(modified).status, 'blocked', 'execution readiness blocked on material drift')

// Solidity hash mismatch
let solMismatch = JSON.parse(JSON.stringify(wf))
solMismatch.solidity.generation.source = 'contract B changed'
const driftSol = computeDrift(solMismatch)
assert.equal(driftSol.status, 'drift_detected')
assert.ok(driftSol.changes.some(c => c.field === 'generated_solidity_hash'), 'solidity hash mismatch detected')
assert.equal(driftSol.solidityHashMatches, false)

// material vs non-material (no material fields changed but hash differs scenario is treated as material via hash change)
let nonMat = JSON.parse(JSON.stringify(wf))
// keep material view same by ensuring irMaterialView same; change non-material field like governing_law/provenance in IR not in material view
nonMat.ir.governing_law = 'Some law'
nonMat.ir.provenance = [{ field: 'x', source: 'y', support: 'supported' }]
const driftNon = computeDrift(nonMat)
assert.equal(driftNon.status, 'unchanged', 'non-material IR metadata change does not cause material drift when material hash matches')
assert.equal(driftNon.materialChange, false)

// --- Version management ---
let vwf = baseWorkflow()
vwf = ensureIntegrityFields(vwf)
const rec1 = buildVersionRecord(vwf, { actor: 'System', role: 'system', summary: 'IR v1.0 created from extraction.' })
assert.ok(rec1 && rec1.irVersion === 'v1.0', 'version record created')
assert.equal(rec1.solidity.hash, hashSolidity('contract A'), 'correct IR-to-Solidity association/hash')
vwf = upsertVersionRecord(vwf, rec1)

// revision/history preservation
let vwf2 = JSON.parse(JSON.stringify(vwf))
vwf2.ir.version = 'v2.0'; vwf2.ir.total_amount = 60000; vwf2.ir.milestones[0].amount = 25000; vwf2.ir.milestones[1].amount = 35000
vwf2.solidity.generation = { ...vwf2.solidity.generation, status: 'success', irVersion: 'v2.0', source: 'contract v2' }
const rec2 = buildVersionRecord(vwf2, { actor: 'Owner', role: 'owner', summary: 'Revision v2.0 created.' })
vwf2 = upsertVersionRecord(vwf2, rec2)
assert.equal(vwf2.versionHistory.length, 2, 'historical versions preserved')
assert.ok(vwf2.versionHistory.find(v => v.irVersion === 'v1.0'), 'previous version preserved')
assert.ok(vwf2.versionHistory.find(v => v.irVersion === 'v2.0'), 'new version recorded')

// previous approval preservation (do not overwrite approved version)
const approvedRec = { ...rec1, approval: { status: 'approved', by: 'Owner', at: 't1', note: 'ok' } }
let vwf3 = upsertVersionRecord(baseWorkflow(), approvedRec)
const rec1Updated = { ...buildVersionRecord(vwf3, { actor: 'System', role: 'system', summary: 'updated' }), irVersion: 'v1.0' }
vwf3 = upsertVersionRecord(vwf3, rec1Updated)
assert.equal(vwf3.versionHistory[0].approval.status, 'approved', 'previous approval preserved on upsert')

// version comparison helper data (diffable fields)
const a = vwf2.versionHistory.find(v=>v.irVersion==='v1.0')
const b = vwf2.versionHistory.find(v=>v.irVersion==='v2.0')
assert.notEqual(JSON.stringify(a.ir), JSON.stringify(b.ir), 'versions differ and can be compared')
assert.notEqual(a.irHash, b.irHash, 'version hashes differ')

// --- Audit trail ---
let awf = baseWorkflow()
awf = ensureIntegrityFields(awf)
awf = logEvent(awf, 'agreement_created', 'Agreement created.', { name: 'System', role: 'system' }, { afterHash: 'h1' })
awf = logEvent(awf, 'contract_ir_generation', 'IR generated.', { name: 'System', role: 'system' }, { beforeHash: 'h1', afterHash: 'h2' })
awf = logEvent(awf, 'simulation_created', 'Simulation created (isolated).', { name: 'Owner', role: 'owner' }, { details: { baseIrVersion: 'v1.0' } })
awf = logEvent(awf, 'simulation_discarded', 'Simulation discarded.', { name: 'Owner', role: 'owner' }, {})

const trail = getAuditTrail(awf)
assert.equal(trail.events.length, 4, 'events created')
assert.equal(trail.implementation, 'locally_persisted_hash_chain')
assert.ok(trail.events.every((e,i)=> e.prevEventHash === (i===0?null:trail.events[i-1].eventHash)), 'event ordering and previous-hash links')

// chain verification
let ver = verifyAuditTrail(awf)
assert.equal(ver.valid, true, 'valid hash chain verifies')

// modified event detection
let tampered = JSON.parse(JSON.stringify(awf))
tampered.auditTrail.events[1].summary = 'tampered summary'
ver = verifyAuditTrail(tampered)
assert.equal(ver.valid, false, 'modified event detected')
assert.ok(ver.issues.some(i => i.includes('hash mismatch')), 'hash mismatch reported')

// missing event detection / broken link
let broken = JSON.parse(JSON.stringify(awf))
broken.auditTrail.events.splice(1,1) // remove middle event -> link break
ver = verifyAuditTrail(broken)
assert.equal(ver.valid, false, 'missing event / broken chain detected')
assert.ok(ver.issues.some(i => i.includes('broken previous-hash link')), 'broken link reported')

// version references
assert.equal(trail.events[1].irVersion, 'v1.0')

// simulation isolation (original IR unchanged while simulation events recorded)
assert.equal(awf.ir.version, 'v1.0')
assert.equal(awf.ir.total_amount, 50000)

console.log('drift/version/audit tests passed', {
  drift: res.report.status,
  versions: vwf2.versionHistory.length,
  auditEvents: trail.events.length,
  auditValid: verifyAuditTrail(awf).valid,
})
