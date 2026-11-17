import type { WorkflowState } from './demo-state'
// @ts-ignore - Node strip-types test resolution
import { deriveTraceability, buildClausesFromIr } from './traceability.ts'
// @ts-ignore - Node strip-types test resolution
import { appendAuditEvent, buildVersionRecord, computeDrift, getAuditTrail, hashIr, hashSolidity, irMaterialView, nowIso, upsertVersionRecord, verifyAuditTrail, type AuditEventType } from './integrity.ts'

export function ensureIntegrityFields(workflow: WorkflowState): WorkflowState {
  let w: any = { ...workflow }
  if (!w.auditTrail || !Array.isArray(w.auditTrail.events)) {
    w.auditTrail = { implementation: 'locally_persisted_hash_chain', label: 'Locally persisted hash-linked audit trail (tamper-evident within local storage limitations; not immutable blockchain storage).', events: [] }
  }
  if (!Array.isArray(w.versionHistory)) w.versionHistory = []
  if (!w.drift) w.drift = { status: w.approvedSnapshot ? 'unchanged' : 'no_snapshot', checkedAt: '', irHashMatches: !!w.approvedSnapshot, solidityHashMatches: !!w.approvedSnapshot, currentIrHash: hashIr(w.ir), currentSolidityHash: w.solidity?.generation?.status === 'success' ? hashSolidity(w.solidity.generation.source) : null, snapshot: w.approvedSnapshot || null, changes: [], materialChange: false }
  if (!('approvedSnapshot' in w)) w.approvedSnapshot = null
  return w as WorkflowState
}

export function logEvent(workflow: WorkflowState, type: AuditEventType, summary: string, actor: { name: string; role: string }, opts: { beforeHash?: string | null; afterHash?: string | null; details?: any; irVersion?: string } = {}): WorkflowState {
  const w = ensureIntegrityFields(workflow)
  return appendAuditEvent(w, { type, summary, actor: actor.name, role: actor.role, beforeHash: opts.beforeHash ?? null, afterHash: opts.afterHash ?? null, details: opts.details, irVersion: opts.irVersion })
}

export function snapshotApproved(workflow: WorkflowState, actor: { name: string; role: string }): WorkflowState {
  if (!workflow.ir) return workflow
  const irHash = hashIr(workflow.ir)
  const gen = workflow.solidity?.generation
  const solidityHash = gen?.status === 'success' ? hashSolidity(gen.source) : null
  const approvedSnapshot = {
    irVersion: workflow.ir.version,
    irHash: irHash || '',
    irMaterial: irMaterialView(workflow.ir),
    solidityHash,
    solidityIrVersion: gen?.irVersion || null,
    solidityMetadata: gen?.metadata || null,
    approvedAt: nowIso(),
    approvedBy: actor.name,
    approvedRole: actor.role,
    note: 'Explicit human approval snapshot (never silently updated).',
  }
  let w: any = { ...ensureIntegrityFields(workflow), approvedSnapshot, drift: { status: 'unchanged', checkedAt: nowIso(), irHashMatches: true, solidityHashMatches: true, currentIrHash: irHash, currentSolidityHash: solidityHash, snapshot: approvedSnapshot, changes: [], materialChange: false } }
  // record version/approval history preservation
  const rec = buildVersionRecord(w, { actor: actor.name, role: actor.role, summary: `Approved snapshot recorded for IR ${workflow.ir.version}.`, approval: { status: 'approved', by: actor.name, at: approvedSnapshot.approvedAt, note: workflow.approval?.note || '' } })
  if (rec) w = upsertVersionRecord(w, rec)
  w = logEvent(w, 'human_approval', `Human approval granted for IR ${workflow.ir.version}; approved snapshot recorded.`, actor, { afterHash: irHash, details: { solidityHash } })
  return w as WorkflowState
}

export function recordVersion(workflow: WorkflowState, actor: { name: string; role: string }, summary: string): WorkflowState {
  let w = ensureIntegrityFields(workflow)
  const rec = buildVersionRecord(w, { actor: actor.name, role: actor.role, summary })
  if (rec) w = upsertVersionRecord(w, rec)
  return w
}

export function detectAndApplyDrift(workflow: WorkflowState, actor: { name: string; role: string }): { workflow: WorkflowState; report: ReturnType<typeof computeDrift> } {
  let w = ensureIntegrityFields(workflow)
  const report = computeDrift(w)
  w = { ...w, drift: report as any } as WorkflowState
  if (report.status === 'drift_detected' && report.materialChange && w.approvedSnapshot) {
    const beforeHash = (w.approvedSnapshot as any).irHash || null
    const afterHash = report.currentIrHash
    // invalidate stale approval and execution readiness; require re-review/reapproval
    const prevApproval = w.approval
    w = { ...w, approval: { status: 'blocked', by: prevApproval?.by || '', at: nowIso(), note: 'Stale approval invalidated due to material drift against approved snapshot. Re-review and reapprove required.' } } as WorkflowState
    // re-run validation, parity and traceability as required after detected changes
    if (w.ir) {
      const ir = w.ir
      const issues: string[] = []
      if (!ir.total_amount || ir.total_amount <= 0) issues.push('Total amount is missing or invalid.')
      if (!ir.milestones?.length) issues.push('At least one milestone is required.')
      const milestoneSum = (ir.milestones || []).reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
      if (ir.total_amount && milestoneSum !== ir.total_amount) issues.push(`Milestone amounts (${milestoneSum}) do not match total (${ir.total_amount}).`)
      if (!ir.review_period_days || ir.review_period_days < 1) issues.push('Review period must be at least 1 day.')
      if (!ir.dispute_behavior) issues.push('Dispute behavior is required.')
      w = { ...w, validation: { status: issues.length ? 'invalid' : 'valid', issues, checkedAt: nowIso() } } as WorkflowState
      const ep = w.parity?.executionParams || { total: 50000, milestones: [20000, 30000], reviewDays: 5, disputeFreeze: true }
      const mm: string[] = []
      if (ir.total_amount !== ep.total) mm.push('total_amount')
      if (JSON.stringify((ir.milestones || []).map((m: any) => m.amount)) !== JSON.stringify(ep.milestones)) mm.push('milestones')
      if (ir.review_period_days !== ep.reviewDays) mm.push('review_period_days')
      if ((ir.dispute_behavior === 'freeze_affected_payment') !== ep.disputeFreeze) mm.push('dispute_behavior')
      w = { ...w, parity: { status: w.validation.status === 'valid' ? (mm.length ? 'mismatched' : 'matched') : 'pending', score: w.validation.status === 'valid' ? (mm.length ? 74 : 100) : 0, mismatches: mm, checkedAt: nowIso(), executionParams: ep } } as WorkflowState
      // refresh traceability snapshot mapping for current version
      const snap = deriveTraceability(w)
      const snapshots = { ...(w.traceability?.snapshots || {}), [snap.irVersion]: snap }
      w = { ...w, traceability: { ...(w.traceability || { clauses: buildClausesFromIr(ir), snapshots: {}, history: [] }), snapshots } } as WorkflowState
    }
    w = logEvent(w, 'drift_detection', `Material drift detected against approved snapshot for IR ${w.ir?.version || 'none'} (${report.changes.filter(c=>c.material).map(c=>c.field).join(', ')}).`, actor, { beforeHash, afterHash, details: { changes: report.changes } })
    w = logEvent(w, 'approval_invalidation', 'Stale approval and execution readiness invalidated; re-review/reapproval required.', actor, { beforeHash, afterHash })
    w = logEvent(w, 'execution_readiness_change', 'Execution readiness changed to blocked due to material drift and approval invalidation.', actor, { beforeHash, afterHash, details: { status: 'blocked', reason: 'material_drift' } })
  } else if (report.status === 'drift_detected') {
    w = logEvent(w, 'drift_detection', `Drift detected (non-material or no prior approved snapshot impact) for IR ${w.ir?.version || 'none'}.`, actor, { beforeHash: (w.approvedSnapshot as any)?.irHash || null, afterHash: report.currentIrHash, details: { changes: report.changes } })
  } else if (report.status === 'unchanged') {
    w = logEvent(w, 'drift_detection', `Drift check: current IR/artifacts match approved snapshot for IR ${w.ir?.version || 'none'}.`, actor, { beforeHash: (w.approvedSnapshot as any)?.irHash || null, afterHash: report.currentIrHash, details: { unchanged: true } })
  } else {
    w = logEvent(w, 'drift_detection', 'Drift check run: no approved snapshot recorded.', actor, { afterHash: report.currentIrHash })
  }
  return { workflow: w as WorkflowState, report }
}

export { getAuditTrail, verifyAuditTrail, computeDrift, hashIr, hashSolidity }
