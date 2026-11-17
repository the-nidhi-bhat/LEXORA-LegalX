import assert from 'node:assert/strict'
import { buildClausesFromIr, deriveTraceability } from '../src/traceability.ts'
const DEFAULT_WORKFLOW = { mode:'demo', extraction:{status:'idle',message:'',sourceText:''}, ir:null, validation:{status:'pending',issues:[],checkedAt:''}, parity:{status:'pending',score:0,mismatches:[],checkedAt:'',executionParams:{total:50000,milestones:[20000,30000],reviewDays:5,disputeFreeze:true}}, reviews:[], revisions:[], approval:{status:'not_requested',by:'',at:'',note:''}, solidity:{generation:{status:'idle',message:'',filename:'',irVersion:'',source:'',metadata:null,supported:[],unsupported:[],security:[],errors:[]},compilation:{status:'not_run',ranAt:'',message:'',tool:'unavailable'},tests:{status:'not_run',ranAt:'',summary:'',cases:[]}}, traceability:{clauses:[],snapshots:{},history:[]}, simulation:null, execution:{status:'not_ready',reason:''} }

const baseIr = {
  version: 'v1.0',
  agreement_type: 'freelance_milestone',
  currency: 'INR',
  total_amount: 50000,
  milestones: [{ name: 'Design approval', amount: 20000 }, { name: 'Website delivery', amount: 30000 }],
  review_period_days: 5,
  dispute_behavior: 'freeze_affected_payment',
  governing_law: null,
  provenance: [
    { field: 'agreement_id', source: 'Workflow agreement context (AGR-WEB-001)', support: 'supported' },
    { field: 'total_amount', source: '₹50,000', support: 'supported' },
    { field: 'milestones', source: '₹20k + ₹30k', support: 'supported' },
    { field: 'review_period_days', source: '5 days', support: 'supported' },
    { field: 'dispute_behavior', source: 'freeze payment', support: 'supported' },
    { field: 'governing_law', source: 'Not supplied in agreement text', support: 'unsupported' },
  ],
}

const clauses = buildClausesFromIr(baseIr, 'source text')
assert.ok(clauses.length >= 6, 'stable clause records created')
assert.ok(clauses.every(c => c.id && c.irVersion === 'v1.0'), 'clauses have stable IDs and IR version')
assert.ok(clauses.some(c => c.irFields.includes('total_amount') && c.evidence.includes('50,000')), 'clause-to-evidence and clause-to-IR mapping')

// Complete chain with valid/matched/generated/tested state
const workflow = {
  ...DEFAULT_WORKFLOW,
  ir: baseIr,
  extraction: { status: 'success', message: 'ok', sourceText: 'source' },
  validation: { status: 'valid', issues: [], checkedAt: 'now' },
  parity: { status: 'matched', score: 100, mismatches: [], checkedAt: 'now', executionParams: { total: 50000, milestones: [20000,30000], reviewDays: 5, disputeFreeze: true } },
  solidity: {
    generation: { status: 'success', irVersion: 'v1.0', source: 'contract', supported: [], unsupported: [], security: [], errors: [], message: '', filename: '', metadata: null },
    compilation: { status: 'not_run', ranAt: '', message: '', tool: 'unavailable' },
    tests: { status: 'passed', ranAt: 'now', summary: 'ok', cases: [
      { id: 'gen-success', name: 'Successful contract generation', status: 'passed', detail: '' },
      { id: 'milestone-consistency', name: 'Milestone amount consistency', status: 'passed', detail: '' },
      { id: 'unauthorized-release', name: 'Unauthorized payment release prevention', status: 'passed', detail: '' },
      { id: 'duplicate-prevention', name: 'Duplicate milestone payment prevention', status: 'passed', detail: '' },
      { id: 'dispute-freeze', name: 'Dispute-based payment freezing', status: 'passed', detail: '' },
      { id: 'approval-required', name: 'Approval requirements', status: 'passed', detail: '' },
      { id: 'overpayment', name: 'Payment amount exceeding agreement value prevention', status: 'passed', detail: '' },
      { id: 'invalid-completion', name: 'Invalid milestone completion rejection', status: 'passed', detail: '' },
      { id: 'state-transitions', name: 'Contract state transitions', status: 'passed', detail: '' },
      { id: 'deterministic', name: 'Deterministic Solidity generation', status: 'passed', detail: '' },
    ] },
  },
  traceability: { clauses, snapshots: {}, history: [] },
}

const snap = deriveTraceability(workflow)
assert.equal(snap.irVersion, 'v1.0')
assert.ok(snap.rows.some(r => r.irField === 'total_amount' && r.solidityElements.length > 0 && r.testCases.length > 0), 'IR-to-Solidity and Solidity-to-test mapping present')
assert.ok(snap.rows.some(r => r.irField === 'milestones' && r.solidityElements.some(s => /Milestone|milestone/i.test(s))), 'milestone mapped to Solidity elements')
assert.ok(snap.rows.every(r => r.validationStatus && r.parityStatus && r.traceabilityStatus), 'rows include validation/parity/traceability statuses')

// Unsupported clause clearly displayed
const gov = snap.rows.find(r => r.irField === 'governing_law')
assert.ok(gov && gov.traceabilityStatus === 'unsupported' && gov.supported === false, 'unsupported clause marked clearly')

// Missing evidence / missing links
const missingEvidenceIr = { ...baseIr, provenance: baseIr.provenance.filter(p => p.field !== 'review_period_days') }
const clausesMissing = buildClausesFromIr(missingEvidenceIr)
const wfMissing = { ...workflow, ir: missingEvidenceIr, traceability: { clauses: clausesMissing, snapshots: {}, history: [] }, solidity: { ...workflow.solidity, generation: { ...workflow.solidity.generation, status: 'idle', irVersion: '' }, tests: { status: 'not_run', ranAt: '', summary: '', cases: [] } } }
const snapMissing = deriveTraceability(wfMissing)
const reviewRow = snapMissing.rows.find(r => r.irField === 'review_period_days')
assert.ok(reviewRow && (reviewRow.missingLinks.includes('evidence') || reviewRow.missingLinks.includes('generated_solidity') || reviewRow.missingLinks.includes('test_results')), 'missing evidence/links identified')

// Version preservation and revision mapping (history snapshots preserved)
const snapV1 = deriveTraceability(workflow)
const v2Ir = { ...baseIr, version: 'v2.0', total_amount: 55000, milestones: [{ name: 'Design approval', amount: 25000 }, { name: 'Website delivery', amount: 30000 }] }
const clausesV2 = buildClausesFromIr(v2Ir).map(c => ({ ...c, irVersion: 'v2.0' }))
const wfV2 = { ...workflow, ir: v2Ir, traceability: { clauses: clausesV2, snapshots: { 'v1.0': snapV1 }, history: [snapV1] }, solidity: { ...workflow.solidity, generation: { ...workflow.solidity.generation, status: 'idle', irVersion: '' }, tests: { status: 'not_run', ranAt: '', summary: '', cases: [] } } }
const snapV2 = deriveTraceability(wfV2)
assert.equal(snapV2.irVersion, 'v2.0')
assert.ok(wfV2.traceability.history.find(h => h.irVersion === 'v1.0'), 'previous version traceability preserved in history')
assert.ok(snapV2.rows.some(r => r.irField === 'total_amount' && String(r.irValue).includes('55000')), 'revision mapping updated for new IR values')

console.log('traceability tests passed:', snap.summary)
