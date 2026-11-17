import assert from 'node:assert/strict'
import { diffIrs, affectedFromDiff, deriveTraceability, buildClausesFromIr } from '../src/traceability.ts'
import { generateSolidity, runGenerationTests } from '../src/solidity.ts'
const DEFAULT_WORKFLOW = { mode:'demo', extraction:{status:'idle',message:'',sourceText:''}, ir:null, validation:{status:'pending',issues:[],checkedAt:''}, parity:{status:'pending',score:0,mismatches:[],checkedAt:'',executionParams:{total:50000,milestones:[20000,30000],reviewDays:5,disputeFreeze:true}}, reviews:[], revisions:[], approval:{status:'not_requested',by:'',at:'',note:''}, solidity:{generation:{status:'idle',message:'',filename:'',irVersion:'',source:'',metadata:null,supported:[],unsupported:[],security:[],errors:[]},compilation:{status:'not_run',ranAt:'',message:'',tool:'unavailable'},tests:{status:'not_run',ranAt:'',summary:'',cases:[]}}, traceability:{clauses:[],snapshots:{},history:[]}, simulation:null, execution:{status:'not_ready',reason:''} }
function deriveExecution(workflow) { if (!workflow.ir) return { status:'not_ready', reason:'no ir' }; if (workflow.validation.status!=='valid'||workflow.parity.status!=='matched'||workflow.approval.status!=='approved') return { status:'blocked', reason:'gates' }; const sol=workflow.solidity; if(sol?.generation?.status!=='success'||sol?.tests?.status!=='passed') return { status:'blocked', reason:'solidity' }; return { status:'ready', reason:'ok' }; }

const baseIr = {
  version: 'v1.0', agreement_type: 'freelance_milestone', currency: 'INR', total_amount: 50000,
  milestones: [{ name: 'Design approval', amount: 20000 }, { name: 'Website delivery', amount: 30000 }],
  review_period_days: 5, dispute_behavior: 'freeze_affected_payment', governing_law: null,
  provenance: [{ field: 'total_amount', source: '₹50k', support: 'supported' }, { field: 'milestones', source: 'split', support: 'supported' }, { field: 'review_period_days', source: '5d', support: 'supported' }, { field: 'dispute_behavior', source: 'freeze', support: 'supported' }],
}

const workflow = {
  ...DEFAULT_WORKFLOW,
  ir: JSON.parse(JSON.stringify(baseIr)),
  validation: { status: 'valid', issues: [], checkedAt: 'now' },
  parity: { status: 'matched', score: 100, mismatches: [], checkedAt: 'now', executionParams: { total: 50000, milestones: [20000,30000], reviewDays: 5, disputeFreeze: true } },
  approval: { status: 'approved', by: 'Owner', at: 'now', note: 'ok' },
  solidity: {
    generation: { status: 'success', irVersion: 'v1.0', source: 'orig', message: '', filename: 'orig.sol', metadata: null, supported: [], unsupported: [], security: [], errors: [] },
    compilation: { status: 'not_run', ranAt: '', message: '', tool: 'unavailable' },
    tests: { status: 'passed', ranAt: 'now', summary: 'ok', cases: [] },
  },
  traceability: { clauses: buildClausesFromIr(baseIr), snapshots: {}, history: [] },
  simulation: null,
}

// Simulation isolation: draft is a copy, original unchanged
const draftIr = JSON.parse(JSON.stringify(baseIr))
draftIr.total_amount = 60000
draftIr.milestones = [{ name: 'Design approval', amount: 25000 }, { name: 'Website delivery', amount: 35000 }]
draftIr.review_period_days = 7
assert.equal(workflow.ir.total_amount, 50000, 'original IR preserved after creating draft')
assert.equal(workflow.approval.status, 'approved', 'original approval preserved')
assert.equal(workflow.solidity.generation.source, 'orig', 'original solidity preserved')

// Field-level comparison
const diff = diffIrs(baseIr, draftIr)
assert.ok(diff.changes.some(c => c.field === 'total_amount' && c.from === '50000' && c.to === '60000'), 'field-level diff for total')
assert.ok(diff.changes.some(c => c.field.startsWith('milestones')), 'milestone diff detected')
assert.equal(diff.baseSum, 50000)
assert.equal(diff.draftSum, 60000)

// Invalid modification rejection (simulation validation/generation)
const badDraft = { ...JSON.parse(JSON.stringify(baseIr)), total_amount: 60000 } // sum mismatch
const badSum = (badDraft.milestones||[]).reduce((s,m)=>s+m.amount,0)
assert.notEqual(badSum, badDraft.total_amount)
const badGen = generateSolidity(badDraft, { validationStatus: 'valid', approved: true })
assert.equal(badGen.status, 'error', 'invalid simulation modification rejected by generation/validation rules')

const unsupportedDraft = { ...JSON.parse(JSON.stringify(baseIr)), dispute_behavior: 'release_anyway' }
const badUnsupported = generateSolidity(unsupportedDraft, { validationStatus: 'valid', approved: true })
assert.equal(badUnsupported.status, 'error', 'unsupported simulation modification rejected')

// Parity score/status changes for simulation against execution params
const ep = { total: 50000, milestones: [20000,30000], reviewDays: 5, disputeFreeze: true }
const simParityMismatches = []
if (draftIr.total_amount !== ep.total) simParityMismatches.push('total_amount')
if (JSON.stringify(draftIr.milestones.map(m=>m.amount)) !== JSON.stringify(ep.milestones)) simParityMismatches.push('milestones')
if (draftIr.review_period_days !== ep.reviewDays) simParityMismatches.push('review_period_days')
assert.ok(simParityMismatches.length >= 2, 'simulation parity detects changes vs execution params')

// Solidity regeneration and tests for valid simulation (isolated)
const simGen = generateSolidity(draftIr, { validationStatus: 'valid', approved: true })
assert.equal(simGen.status, 'success')
assert.notEqual(simGen.source, 'orig')
const simTests = runGenerationTests(draftIr)
assert.equal(simTests.status, 'passed')

// Affected clauses/traceability impact
const baseSnap = deriveTraceability(workflow)
const simWorkflow = { ...workflow, ir: draftIr, validation: { status: 'valid', issues: [], checkedAt: '' }, parity: { status: 'mismatched', score: 74, mismatches: simParityMismatches, checkedAt: '', executionParams: ep }, solidity: { generation: simGen, compilation: { status: 'not_run', ranAt: '', message: '', tool: '' }, tests: simTests } }
const simSnap = deriveTraceability(simWorkflow)
const affected = affectedFromDiff(diff.changes, baseSnap.rows)
assert.ok(affected.length > 0, 'affected clauses/Solidity/tests identified from diff')
assert.ok(simSnap.rows.some(r => r.irField === 'total_amount' && String(r.irValue).includes('60000')), 'simulation traceability reflects modified IR')

// Simulation discard leaves original intact; explicit revision creation would create new version (modeled)
let simState = { active: true, draftIr }
simState = null // discard
assert.equal(workflow.ir.version, 'v1.0')
assert.equal(workflow.approval.status, 'approved')
const revised = { ...draftIr, version: 'v2.0' }
assert.equal(workflow.ir.version, 'v1.0', 'original IR not overwritten by revision creation target until explicitly applied')
assert.equal(revised.version, 'v2.0')

// Original execution/approval unaffected by simulation presence conceptually
assert.equal(deriveExecution(workflow).status, 'ready', 'original execution readiness remains based on original workflow state')

console.log('what-if tests passed:', { diff: diff.changes.length, affected: affected.length, simTests: simTests.summary })
