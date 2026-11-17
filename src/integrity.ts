// @ts-ignore - Node strip-types test resolution needs extension; tsc in this project flags it
import { hashObject, sha256Hex } from './hash.ts'
import type { WorkflowState } from './demo-state'

export type AuditEventType =
  | 'agreement_created'
  | 'clause_extraction'
  | 'contract_ir_generation'
  | 'validation'
  | 'parity_verification'
  | 'review_comment'
  | 'revision_creation'
  | 'human_approval'
  | 'solidity_generation'
  | 'test_results'
  | 'simulation_created'
  | 'simulation_discarded'
  | 'drift_detection'
  | 'approval_invalidation'
  | 'execution_readiness_change'

export type AuditEvent = {
  id: string
  type: AuditEventType
  agreementId: string
  irVersion: string
  actor: string
  role: string
  timestamp: string
  summary: string
  beforeHash: string | null
  afterHash: string | null
  prevEventHash: string | null
  eventHash: string
  details?: any
}

export type AuditTrail = {
  implementation: 'locally_persisted_hash_chain'
  label: string
  events: AuditEvent[]
}

export type ApprovedSnapshot = {
  irVersion: string
  irHash: string
  solidityHash: string | null
  solidityIrVersion: string | null
  solidityMetadata: any | null
  approvedAt: string
  approvedBy: string
  approvedRole: string
  note: string
}

export type DriftChange = {
  field: string
  expected: string
  current: string
  material: boolean
}

export type DriftReport = {
  status: 'no_snapshot' | 'unchanged' | 'drift_detected'
  checkedAt: string
  irHashMatches: boolean
  solidityHashMatches: boolean
  currentIrHash: string | null
  currentSolidityHash: string | null
  snapshot: ApprovedSnapshot | null
  changes: DriftChange[]
  materialChange: boolean
}

export type VersionRecord = {
  irVersion: string
  createdAt: string
  createdBy: string
  createdRole: string
  summary: string
  ir: any
  irHash: string
  clauses: any[]
  traceabilitySnapshot: any | null
  solidity: { hash: string | null; irVersion: string | null; metadata: any | null; status: string }
  tests: { status: string; summary: string; ranAt: string }
  approval: { status: string; by: string; at: string; note: string } | null
  links: { sourceEvidence: string[] }
}

export function nowIso() { return new Date().toISOString(); }

export function irMaterialView(ir: any) {
  if (!ir) return null;
  return {
    agreement_id: ir.agreement_id || 'AGR-WEB-001',
    parties: ir.parties || { client: 'Client', provider: 'FreelanceDeveloper' },
    agreement_type: ir.agreement_type,
    currency: ir.currency,
    total_amount: ir.total_amount,
    milestones: (ir.milestones || []).map((m: any, i: number) => ({ id: i + 1, name: m?.name, amount: m?.amount })),
    review_period_days: ir.review_period_days,
    dispute_behavior: ir.dispute_behavior,
    payment_release_conditions: {
      requires_completion: true,
      requires_approval: true,
      dispute_freeze: ir.dispute_behavior === 'freeze_affected_payment',
    },
    approval_requirements: { human_approval_required: true, approver_gated_release: true },
  };
}

export function hashIr(ir: any): string | null { return ir ? hashObject(irMaterialView(ir)) : null; }
export function hashSolidity(source: string | null | undefined): string | null { return source ? sha256Hex(source) : null; }

export function computeDrift(workflow: WorkflowState): DriftReport {
  const snapshot = (workflow as any).approvedSnapshot as ApprovedSnapshot | null | undefined;
  const ir = workflow.ir;
  const currentIrHash = hashIr(ir);
  const gen = workflow.solidity?.generation;
  const currentSolidityHash = gen?.status === 'success' ? hashSolidity(gen.source) : null;
  if (!snapshot) {
    return { status: 'no_snapshot', checkedAt: nowIso(), irHashMatches: false, solidityHashMatches: false, currentIrHash, currentSolidityHash, snapshot: null, changes: [], materialChange: false };
  }
  const changes: DriftChange[] = [];
  const expectedIr: any = (snapshot as any).irMaterial || null;
  const currentIr = irMaterialView(ir);
  const cmp = (field: string, a: any, b: any, material = true) => {
    const sa = canonicalizeSafe(a); const sb = canonicalizeSafe(b);
    if (sa !== sb) changes.push({ field, expected: sa, current: sb, material });
  };
  if (expectedIr && currentIr) {
    cmp('total_amount', expectedIr.total_amount, currentIr.total_amount);
    cmp('parties', expectedIr.parties, currentIr.parties);
    cmp('milestones', expectedIr.milestones, currentIr.milestones);
    cmp('review_period_days', expectedIr.review_period_days, currentIr.review_period_days);
    cmp('dispute_behavior', expectedIr.dispute_behavior, currentIr.dispute_behavior);
    cmp('payment_release_conditions', expectedIr.payment_release_conditions, currentIr.payment_release_conditions);
    cmp('approval_requirements', expectedIr.approval_requirements, currentIr.approval_requirements);
  } else if (currentIrHash !== snapshot.irHash) {
    changes.push({ field: 'contract_ir', expected: snapshot.irHash, current: String(currentIrHash), material: true });
  }
  const irHashMatches = currentIrHash === snapshot.irHash;
  const solidityHashMatches = (snapshot.solidityHash || null) === (currentSolidityHash || null);
  if (snapshot.solidityHash && snapshot.solidityHash !== currentSolidityHash) {
    changes.push({ field: 'generated_solidity_hash', expected: snapshot.solidityHash, current: String(currentSolidityHash || 'missing'), material: true });
  }
  const materialChange = changes.some(c => c.material);
  return { status: (irHashMatches && solidityHashMatches && !materialChange) ? 'unchanged' : 'drift_detected', checkedAt: nowIso(), irHashMatches, solidityHashMatches, currentIrHash, currentSolidityHash, snapshot, changes, materialChange };
}

function canonicalizeSafe(v: any): string { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { return String(v); } }

export function computeEventHash(ev: Omit<AuditEvent, 'eventHash'>): string {
  return hashObject({ id: ev.id, type: ev.type, agreementId: ev.agreementId, irVersion: ev.irVersion, actor: ev.actor, role: ev.role, timestamp: ev.timestamp, summary: ev.summary, beforeHash: ev.beforeHash, afterHash: ev.afterHash, prevEventHash: ev.prevEventHash, details: ev.details || null });
}

export function appendAuditEvent(workflow: WorkflowState, partial: Omit<AuditEvent, 'id' | 'eventHash' | 'prevEventHash' | 'timestamp' | 'agreementId' | 'irVersion'> & { id?: string; timestamp?: string; agreementId?: string; irVersion?: string }): WorkflowState {
  const trail = getAuditTrail(workflow);
  const prev = trail.events.length ? trail.events[trail.events.length - 1] : null;
  const base: Omit<AuditEvent, 'eventHash'> = {
    id: partial.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: partial.type,
    agreementId: partial.agreementId || (workflow.ir as any)?.agreement_id || 'AGR-WEB-001',
    irVersion: partial.irVersion || workflow.ir?.version || 'none',
    actor: partial.actor || 'system',
    role: partial.role || 'system',
    timestamp: partial.timestamp || nowIso(),
    summary: partial.summary,
    beforeHash: partial.beforeHash ?? null,
    afterHash: partial.afterHash ?? null,
    prevEventHash: prev ? prev.eventHash : null,
    details: partial.details,
  };
  const event: AuditEvent = { ...base, eventHash: computeEventHash(base) };
  return { ...(workflow as any), auditTrail: { ...trail, events: [...trail.events, event] } } as WorkflowState;
}

export function getAuditTrail(workflow: WorkflowState): AuditTrail {
  const t = (workflow as any).auditTrail;
  if (t && Array.isArray(t.events)) return { implementation: 'locally_persisted_hash_chain', label: t.label || 'Locally persisted hash-linked audit trail (tamper-evident within local storage limitations; not immutable blockchain storage).', events: t.events };
  return { implementation: 'locally_persisted_hash_chain', label: 'Locally persisted hash-linked audit trail (tamper-evident within local storage limitations; not immutable blockchain storage).', events: [] };
}

export function verifyAuditTrail(workflow: WorkflowState) {
  const trail = getAuditTrail(workflow);
  const issues: string[] = [];
  for (let i = 0; i < trail.events.length; i++) {
    const ev = trail.events[i];
    const expectedPrev = i === 0 ? null : trail.events[i - 1].eventHash;
    if (ev.prevEventHash !== expectedPrev) issues.push(`Event ${ev.id} has broken previous-hash link (missing/reordered/modified chain).`);
    const recomputed = computeEventHash({ ...ev });
    if (recomputed !== ev.eventHash) issues.push(`Event ${ev.id} hash mismatch (event content modified).`);
    if (!ev.id || !ev.type || !ev.timestamp) issues.push(`Event ${i} missing required fields.`);
  }
  return { valid: issues.length === 0, issues, count: trail.events.length };
}

export function buildVersionRecord(workflow: WorkflowState, opts: { actor: string; role: string; summary: string; approval?: any }): VersionRecord | null {
  if (!workflow.ir) return null;
  const ir = workflow.ir;
  const irHash = hashIr(ir) || '';
  const gen = workflow.solidity?.generation;
  const solidityHash = gen?.status === 'success' ? hashSolidity(gen.source) : null;
  const traceSnap = (workflow.traceability?.snapshots || {})[ir.version] || null;
  const evidence = Array.isArray(ir.provenance) ? ir.provenance.map((p: any) => `${p.field}: ${p.source}`) : [];
  return {
    irVersion: ir.version,
    createdAt: nowIso(),
    createdBy: opts.actor,
    createdRole: opts.role,
    summary: opts.summary,
    ir: JSON.parse(JSON.stringify(ir)),
    irHash,
    clauses: JSON.parse(JSON.stringify(workflow.traceability?.clauses || [])),
    traceabilitySnapshot: traceSnap ? JSON.parse(JSON.stringify(traceSnap)) : null,
    solidity: { hash: solidityHash, irVersion: gen?.irVersion || null, metadata: gen?.metadata ? JSON.parse(JSON.stringify(gen.metadata)) : null, status: gen?.status || 'idle' },
    tests: { status: workflow.solidity?.tests?.status || 'not_run', summary: workflow.solidity?.tests?.summary || '', ranAt: workflow.solidity?.tests?.ranAt || '' },
    approval: opts.approval ? JSON.parse(JSON.stringify(opts.approval)) : (workflow.approval?.status === 'approved' ? JSON.parse(JSON.stringify(workflow.approval)) : null),
    links: { sourceEvidence: evidence },
  };
}

export function upsertVersionRecord(workflow: WorkflowState, record: VersionRecord): WorkflowState {
  const versions = Array.isArray((workflow as any).versionHistory) ? [...(workflow as any).versionHistory] : [];
  const idx = versions.findIndex((v: any) => v.irVersion === record.irVersion);
  if (idx >= 0) {
    const existing = versions[idx];
    // prevent accidental overwrite of approved versions: preserve existing approval if present
    versions[idx] = { ...record, approval: existing.approval || record.approval, createdAt: existing.createdAt || record.createdAt };
  } else {
    versions.push(record);
  }
  versions.sort((a: any, b: any) => String(a.irVersion).localeCompare(String(b.irVersion)));
  return { ...(workflow as any), versionHistory: versions } as WorkflowState;
}
