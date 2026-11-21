import type { WorkflowState } from './demo-state'
import type { SolidityGeneration, SolidityTestResults } from './solidity'

export type ClauseRecord = {
  id: string
  label: string
  text: string
  evidence: string
  supported: boolean
  irFields: string[]
  irVersion: string
}

export type TraceabilityRow = {
  clauseId: string
  clauseLabel: string
  clauseText: string
  evidence: string
  irField: string
  irValue: string
  validationStatus: 'valid' | 'invalid' | 'pending' | 'not_applicable'
  validationDetail: string
  parityStatus: 'matched' | 'mismatched' | 'pending' | 'not_applicable'
  parityDetail: string
  solidityElements: string[]
  testCases: { id: string; name: string; status: string }[]
  traceabilityStatus: 'complete' | 'partial' | 'unsupported' | 'missing_link'
  missingLinks: string[]
  supported: boolean
}

export type TraceabilitySnapshot = {
  irVersion: string
  createdAt: string
  rows: TraceabilityRow[]
  summary: { total: number; complete: number; partial: number; unsupported: number; missing: number }
}

const FIELD_TEST_MAP: Record<string, string[]> = {
  agreement_id: ['gen-success', 'deterministic'],
  parties: ['gen-success'],
  total_amount: ['milestone-consistency', 'overpayment', 'gen-success'],
  milestones: ['milestone-consistency', 'invalid-completion', 'duplicate-prevention', 'gen-success'],
  'milestones[].amount': ['milestone-consistency', 'overpayment'],
  'milestones[].completion': ['invalid-completion', 'state-transitions'],
  review_period_days: ['gen-success'],
  dispute_behavior: ['dispute-freeze'],
  payment_release: ['unauthorized-release', 'duplicate-prevention', 'approval-required', 'overpayment', 'state-transitions'],
  approval: ['unauthorized-release', 'approval-required', 'state-transitions'],
  governing_law: [],
}

const FIELD_SOLIDITY_MAP: Record<string, string[]> = {
  agreement_id: ['string public constant agreementId'],
  parties: ['address public immutable client', 'address public immutable provider', 'address public immutable owner', 'constructor(...)'],
  total_amount: ['uint256 public constant totalAmount', 'require(totalReleased + m.amount <= totalAmount, "EXCEEDS_AGREEMENT_AMOUNT")', '_sumMilestones()/MILESTONE_TOTAL_MISMATCH'],
  milestones: ['struct Milestone', 'mapping(uint256 => Milestone) public milestones', 'uint256 public constant milestoneCount', 'constructor milestone initialization'],
  'milestones[].amount': ['Milestone.amount', 'totalAmount/milestone sum checks'],
  'milestones[].completion': ['markMilestoneCompleted(uint256)', 'Milestone.completed'],
  review_period_days: ['uint256 public constant reviewPeriodDays'],
  dispute_behavior: ['enum DisputeStatus', 'raiseDispute()', 'resolveDispute()', 'disputeFreezePayments/DISPUTE_FROZEN'],
  payment_release: ['releaseMilestonePayment(uint256)', 'Milestone.released', 'PaymentReleased event', 'nonReentrant'],
  approval: ['approveMilestone(uint256)', 'onlyApprover modifier', 'Milestone.approved', 'APPROVAL_REQUIRED'],
  governing_law: [],
}

function stringifyValue(ir: any, field: string): string {
  if (!ir) return '—'
  if (field === 'milestones' || field.startsWith('milestones[')) return JSON.stringify(ir.milestones || [])
  if (field === 'payment_release') return ir.dispute_behavior ? 'release on approved completed milestone' : '—'
  if (field === 'approval') return 'human/approver required before release'
  const v = ir[field]
  if (v === null || v === undefined || v === '') return 'missing'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function buildClausesFromIr(ir: any, sourceText = ''): ClauseRecord[] {
  const ver = ir?.version || 'v1.0'
  const prov = Array.isArray(ir?.provenance) ? ir.provenance : []
  const p = (field: string) => prov.find((x: any) => x.field === field)
  const base: Array<Omit<ClauseRecord, 'irVersion'>> = [
    { id: 'CL-AGR-001', label: 'Agreement ID / context', text: 'Agreement identifier and execution context', evidence: p('agreement_id')?.source || 'Derived from workflow context (AGR-WEB-001)', supported: true, irFields: ['agreement_id', 'agreement_type', 'currency', 'parties'] },
    { id: 'CL-TOTAL-001', label: 'Total agreement amount', text: 'Total consideration/value of the agreement', evidence: p('total_amount')?.source || 'Extracted total amount', supported: true, irFields: ['total_amount'] },
    { id: 'CL-MILE-001', label: 'Milestones and amounts', text: 'Milestone schedule, identifiers/names, and amounts', evidence: p('milestones')?.source || 'Extracted milestone terms', supported: true, irFields: ['milestones', 'milestones[].amount'] },
    { id: 'CL-COMP-001', label: 'Milestone completion conditions', text: 'Conditions for marking milestones completed/submitted', evidence: p('milestones')?.source || 'Completion implied by milestone delivery/approval terms', supported: true, irFields: ['milestones[].completion'] },
    { id: 'CL-REV-001', label: 'Review period', text: 'Time allowed to review each milestone/deliverable', evidence: p('review_period_days')?.source || 'Extracted review period', supported: true, irFields: ['review_period_days'] },
    { id: 'CL-DISP-001', label: 'Dispute behavior', text: 'Handling of disputes affecting payments', evidence: p('dispute_behavior')?.source || 'Extracted dispute behavior', supported: ir?.dispute_behavior === 'freeze_affected_payment', irFields: ['dispute_behavior'] },
    { id: 'CL-PAY-001', label: 'Payment release conditions', text: 'Conditions required before releasing milestone payments', evidence: p('milestones')?.source || 'Release conditioned on completion, approval, and no active dispute freeze', supported: true, irFields: ['payment_release', 'approval'] },
    { id: 'CL-GOV-001', label: 'Governing law (off-chain)', text: 'Jurisdiction/governing law clause', evidence: p('governing_law')?.source || 'Not supplied in agreement text', supported: false, irFields: ['governing_law'] },
  ]
  // keep IDs stable even if evidence text changes
  return base.map(c => ({ ...c, irVersion: ver }))
}

export function deriveTraceability(workflow: WorkflowState, opts?: { ir?: any; validation?: any; parity?: any; solidity?: SolidityGeneration; tests?: SolidityTestResults; clauses?: ClauseRecord[]; label?: string }): TraceabilitySnapshot {
  const ir = opts?.ir ?? workflow.ir
  const validation = opts?.validation ?? workflow.validation
  const parity = opts?.parity ?? workflow.parity
  const solidity = opts?.solidity ?? workflow.solidity?.generation
  const tests = opts?.tests ?? workflow.solidity?.tests
  const clauses = (opts?.clauses && opts.clauses.length ? opts.clauses : (workflow.traceability?.clauses || (ir ? buildClausesFromIr(ir, workflow.extraction?.sourceText || '') : []))) as ClauseRecord[]
  const validationIssues = Array.isArray(validation?.issues) ? validation.issues.join(' | ') : ''
  const parityMismatches: string[] = Array.isArray(parity?.mismatches) ? parity.mismatches : []
  const rows: TraceabilityRow[] = []

  for (const clause of clauses) {
    const fields = clause.irFields.length ? clause.irFields : ['(none)']
    for (const field of fields) {
      const missingLinks: string[] = []
      if (!clause.evidence || /not supplied|missing/i.test(clause.evidence)) missingLinks.push('evidence')
      if (!ir) missingLinks.push('ir')
      if (!field || field === '(none)') missingLinks.push('ir_field')

      const valRelevantIssue = validationIssues && (validationIssues.toLowerCase().includes(field.replace('[]','').toLowerCase()) || (field === 'total_amount' && /total/i.test(validationIssues)) || (field.includes('milestone') && /milestone/i.test(validationIssues)))
      const validationStatus = !ir ? 'pending' : (!clause.supported ? 'not_applicable' : (validation?.status === 'valid' ? 'valid' : validation?.status === 'invalid' ? (valRelevantIssue || validationIssues ? 'invalid' : 'invalid') : 'pending'))
      const validationDetail = !ir ? 'No Contract IR' : (!clause.supported ? 'Unsupported/off-chain clause (not execution-validated as Solidity term)' : (validation?.status === 'valid' ? 'Validated in current Contract IR' : validation?.status === 'invalid' ? (validationIssues || 'Validation failed') : 'Validation pending'))

      const fieldKey = field.replace(/\[\]\..*/, '[]').replace('milestones[].amount', 'milestones').replace('milestones[].completion', 'milestones')
      const parityRelevant = parityMismatches.some(m => field === m || fieldKey === m || (field.includes('milestone') && m === 'milestones') || (field === 'payment_release' && m === 'dispute_behavior'))
      const parityStatus = !clause.supported ? 'not_applicable' : (parity?.status === 'matched' ? 'matched' : parity?.status === 'mismatched' ? (parityRelevant ? 'mismatched' : 'matched') : 'pending')
      const parityDetail = !clause.supported ? 'Not part of executable parity scope' : (parity?.status === 'matched' ? 'Matches execution parameters' : parity?.status === 'mismatched' ? (parityRelevant ? `Mismatch: ${parityMismatches.join(', ')}` : 'No mismatch detected for this field') : 'Parity pending')

      const mapKey = field in FIELD_SOLIDITY_MAP ? field : (field.includes('milestone') && field.includes('amount') ? 'milestones[].amount' : field.includes('completion') ? 'milestones[].completion' : field)
      const solidityElements = clause.supported ? (FIELD_SOLIDITY_MAP[mapKey] || FIELD_SOLIDITY_MAP[fieldKey] || []) : []
      if (clause.supported && solidityElements.length === 0 && field !== 'governing_law') missingLinks.push('solidity_mapping')
      if (clause.supported && solidity?.status !== 'success') missingLinks.push('generated_solidity')
      else if (clause.supported && solidity?.irVersion && ir?.version && solidity.irVersion !== ir.version) missingLinks.push('solidity_ir_version')

      const testIds = clause.supported ? (FIELD_TEST_MAP[mapKey] || FIELD_TEST_MAP[fieldKey] || []) : []
      const testCases = testIds.map(id => {
        const found = tests?.cases?.find(c => c.id === id)
        return { id, name: found?.name || id, status: found?.status || (tests?.status ? 'not_run' : 'not_run') }
      })
      if (clause.supported && testCases.length === 0) missingLinks.push('test_mapping')
      if (clause.supported && (!tests || tests.status === 'not_run')) missingLinks.push('test_results')

      let traceabilityStatus: TraceabilityRow['traceabilityStatus'] = 'complete'
      if (!clause.supported) traceabilityStatus = 'unsupported'
      else if (missingLinks.some(l => ['ir','ir_field','evidence','solidity_mapping','test_mapping'].includes(l))) traceabilityStatus = 'missing_link'
      else if (missingLinks.length) traceabilityStatus = 'partial'

      rows.push({
        clauseId: clause.id,
        clauseLabel: clause.label,
        clauseText: clause.text,
        evidence: clause.evidence || 'Missing evidence',
        irField: field,
        irValue: stringifyValue(ir, field),
        validationStatus,
        validationDetail,
        parityStatus,
        parityDetail,
        solidityElements,
        testCases,
        traceabilityStatus,
        missingLinks: Array.from(new Set(missingLinks)),
        supported: clause.supported,
      })
    }
  }

  const summary = {
    total: rows.length,
    complete: rows.filter(r => r.traceabilityStatus === 'complete').length,
    partial: rows.filter(r => r.traceabilityStatus === 'partial').length,
    unsupported: rows.filter(r => r.traceabilityStatus === 'unsupported').length,
    missing: rows.filter(r => r.traceabilityStatus === 'missing_link').length,
  }
  return { irVersion: ir?.version || 'none', createdAt: new Date().toISOString(), rows, summary }
}

export function diffIrs(base: any, draft: any) {
  const changes: { field: string; from: string; to: string }[] = []
  const fields = ['total_amount', 'review_period_days', 'dispute_behavior', 'agreement_type', 'currency']
  for (const f of fields) {
    const a = base?.[f]; const b = draft?.[f]
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: f, from: a == null ? '—' : String(a), to: b == null ? '—' : String(b) })
  }
  const baseMs = Array.isArray(base?.milestones) ? base.milestones : []
  const draftMs = Array.isArray(draft?.milestones) ? draft.milestones : []
  const max = Math.max(baseMs.length, draftMs.length)
  for (let i = 0; i < max; i++) {
    const a = baseMs[i]; const b = draftMs[i]
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ field: `milestones[${i}]`, from: a ? `${a.name}: ${a.amount}` : '—', to: b ? `${b.name}: ${b.amount}` : '—' })
    }
  }
  const baseSum = baseMs.reduce((s: number, m: any) => s + (Number(m.amount) || 0), 0)
  const draftSum = draftMs.reduce((s: number, m: any) => s + (Number(m.amount) || 0), 0)
  return { changes, baseSum, draftSum, milestoneCountChanged: baseMs.length !== draftMs.length }
}

export function affectedFromDiff(changes: { field: string }[], baseRows: TraceabilityRow[]) {
  const changed = new Set(changes.map(c => c.field.startsWith('milestones') ? 'milestones' : c.field))
  return baseRows.filter(r => changed.has(r.irField) || (changed.has('milestones') && r.irField.startsWith('milestones')) || (changed.has('dispute_behavior') && (r.irField === 'dispute_behavior' || r.irField === 'payment_release')))
}
