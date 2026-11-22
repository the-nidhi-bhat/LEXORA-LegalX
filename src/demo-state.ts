// @ts-ignore - Node strip-types test resolution
import { accountForRole, type DemoAccount, type Role } from './rbac.ts'

export const PROFILE_KEY = 'legalx:profile'
export const SETTINGS_KEY = 'legalx:settings'
export const AI_DRAFT_KEY = 'legalx:ai-draft'
export const NOTIFICATIONS_KEY = 'legalx:notifications'
export const INVITES_KEY = 'legalx:invites'
export const WALLET_KEY = 'legalx:wallet-connected'
export const MILESTONES_KEY = 'legalx:milestones'
export const WORKFLOW_KEY = 'legalx:workflow'

export type DemoProfile = {
  name: string
  email: string
  workspaceName: string
  role: Role
  jobTitle: string
  useCase: string
}

export type DemoSettings = {
  blockCriticalMismatches: boolean
  askForSourceClauses: boolean
  requireWalletConfirmation: boolean
  emailNotifications: boolean
}

const DEFAULT_PROFILE: DemoProfile = {
  name: 'Nirvan Shah',
  email: 'owner@legalx.demo',
  workspaceName: 'Acme Digital',
  role: 'owner',
  jobTitle: 'Product & AI lead',
  useCase: 'Freelance agreements',
}

const DEFAULT_SETTINGS: DemoSettings = {
  blockCriticalMismatches: true,
  askForSourceClauses: true,
  requireWalletConfirmation: true,
  emailNotifications: true,
}

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const value = storage()?.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch { return fallback }
}

function safeWrite<T>(key: string, value: T) {
  try { storage()?.setItem(key, JSON.stringify(value)) } catch { /* local demo state is best effort */ }
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) || 'LX').toUpperCase()
}

export function readStoredProfile(): DemoProfile | null {
  const value = safeRead<Partial<DemoProfile> | null>(PROFILE_KEY, null)
  if (!value || typeof value.name !== 'string' || !value.name.trim() || typeof value.email !== 'string') return null
  const role = ['owner', 'freelancer', 'legal_reviewer', 'org_admin', 'technical_auditor'].includes(value.role || '') ? value.role as Role : 'owner'
  const text = (key: 'workspaceName' | 'jobTitle' | 'useCase') => {
    const stored = value[key]
    return typeof stored === 'string' && stored.trim() ? stored.trim() : DEFAULT_PROFILE[key]
  }
  return { role, name: value.name.trim(), email: value.email.trim(),
    workspaceName: text('workspaceName'), jobTitle: text('jobTitle'), useCase: text('useCase') }
}

export function defaultProfile(role: Role = 'owner'): DemoProfile {
  const account = accountForRole(role)
  return { ...DEFAULT_PROFILE, role, name: account.name, email: account.email, workspaceName: account.workspaceName }
}

export function saveProfile(profile: DemoProfile): DemoProfile {
  const normalized = { ...DEFAULT_PROFILE, ...profile, name: profile.name.trim() || DEFAULT_PROFILE.name, email: profile.email.trim() || DEFAULT_PROFILE.email, workspaceName: profile.workspaceName.trim() || DEFAULT_PROFILE.workspaceName }
  safeWrite(PROFILE_KEY, normalized)
  window.dispatchEvent(new Event('legalx:state'))
  return normalized
}

export function readGuidedStep(stepCount: number): number {
  const step = Number(readText('legalx:guided-step', '0'))
  return Number.isInteger(step) && step >= 0 && step < stepCount ? step : 0
}

export function readSettings(): DemoSettings {
  const settings = { ...DEFAULT_SETTINGS }
  const stored = safeRead<Partial<DemoSettings> | null>(SETTINGS_KEY, null)
  for (const key of Object.keys(settings) as (keyof DemoSettings)[]) {
    const value = stored?.[key]
    if (typeof value === 'boolean') settings[key] = value
  }
  return settings
}

export function saveSettings(settings: DemoSettings): DemoSettings {
  const normalized = { ...DEFAULT_SETTINGS, ...settings }
  safeWrite(SETTINGS_KEY, normalized)
  window.dispatchEvent(new Event('legalx:state'))
  return normalized
}

export function effectiveAccount(role: Role): DemoAccount {
  const base = accountForRole(role)
  const profile = readStoredProfile()
  if (!profile || profile.role !== role) return base
  return { ...base, name: profile.name, email: profile.email, workspaceName: profile.workspaceName, initials: initialsFor(profile.name) }
}

export function readJson<T>(key: string, fallback: T): T { return safeRead(key, fallback) }
export function writeJson<T>(key: string, value: T): T { safeWrite(key, value); window.dispatchEvent(new Event('legalx:state')); return value }
export function readText(key: string, fallback = ''): string { try { return storage()?.getItem(key) || fallback } catch { return fallback } }
export function writeText(key: string, value: string): string { try { storage()?.setItem(key, value) } catch { /* best effort */ } window.dispatchEvent(new Event('legalx:state')); return value }

// --- Integrated workflow (demo/local implementation; no external API fabricated) ---
export type SolidityGenerationState = { status: 'idle'|'success'|'error'|'blocked'; message: string; filename: string; irVersion: string; source: string; metadata: any; supported: string[]; unsupported: string[]; security: { control: string; status: 'enforced'|'n/a'; detail: string }[]; errors: string[] }
export type SolidityCompilationState = { status: 'not_run'|'passed'|'failed'; ranAt: string; message: string; tool: string }
export type SolidityTestsState = { status: 'not_run'|'passed'|'failed'; ranAt: string; summary: string; cases: { id: string; name: string; status: 'passed'|'failed'|'skipped'; detail: string }[] }
export type WorkflowReview = { id: string; by: string; role: Role; at: string; status: 'comment' | 'changes_requested' | 'approved_note'; note: string }
export type WorkflowRevision = { id: string; at: string; summary: string; irVersion: string }
export type WorkflowClause = { id: string; label: string; text: string; evidence: string; supported: boolean; irFields: string[]; irVersion: string }
export type WorkflowTraceabilityRow = { clauseId: string; clauseLabel: string; clauseText: string; evidence: string; irField: string; irValue: string; validationStatus: string; validationDetail: string; parityStatus: string; parityDetail: string; solidityElements: string[]; testCases: { id: string; name: string; status: string }[]; traceabilityStatus: string; missingLinks: string[]; supported: boolean }
export type WorkflowTraceabilitySnapshot = { irVersion: string; createdAt: string; rows: WorkflowTraceabilityRow[]; summary: { total: number; complete: number; partial: number; unsupported: number; missing: number } }
export type WorkflowTraceabilityState = { clauses: WorkflowClause[]; snapshots: Record<string, WorkflowTraceabilitySnapshot>; history: WorkflowTraceabilitySnapshot[] }
export type WorkflowSimulationState = { active: boolean; baseIrVersion: string; baseIr: any | null; draftIr: any | null; baseClauses: WorkflowClause[]; draftClauses: WorkflowClause[]; validation: { status: 'pending' | 'valid' | 'invalid'; issues: string[]; checkedAt: string }; parity: { status: 'pending' | 'matched' | 'mismatched' | 'blocked'; score: number; mismatches: string[]; checkedAt: string; executionParams: { total: number; milestones: number[]; reviewDays: number; disputeFreeze: boolean } }; solidity: { generation: SolidityGenerationState; compilation: SolidityCompilationState; tests: SolidityTestsState }; diff: { changes: { field: string; from: string; to: string }[]; baseSum: number; draftSum: number; milestoneCountChanged: boolean }; simulationApprovedForGeneration: boolean; note: string }

export type WorkflowApprovedSnapshot = { irVersion: string; irHash: string; irMaterial: any; solidityHash: string | null; solidityIrVersion: string | null; solidityMetadata: any | null; approvedAt: string; approvedBy: string; approvedRole: string; note: string }
export type WorkflowDriftChange = { field: string; expected: string; current: string; material: boolean }
export type WorkflowDriftReport = { status: 'no_snapshot' | 'unchanged' | 'drift_detected'; checkedAt: string; irHashMatches: boolean; solidityHashMatches: boolean; currentIrHash: string | null; currentSolidityHash: string | null; snapshot: WorkflowApprovedSnapshot | null; changes: WorkflowDriftChange[]; materialChange: boolean }
export type WorkflowVersionRecord = { irVersion: string; createdAt: string; createdBy: string; createdRole: string; summary: string; ir: any; irHash: string; clauses: any[]; traceabilitySnapshot: any | null; solidity: { hash: string | null; irVersion: string | null; metadata: any | null; status: string }; tests: { status: string; summary: string; ranAt: string }; approval: { status: string; by: string; at: string; note: string } | null; links: { sourceEvidence: string[] } }
export type WorkflowAuditEvent = { id: string; type: string; agreementId: string; irVersion: string; actor: string; role: string; timestamp: string; summary: string; beforeHash: string | null; afterHash: string | null; prevEventHash: string | null; eventHash: string; details?: any }
export type WorkflowAuditTrail = { implementation: 'locally_persisted_hash_chain'; label: string; events: WorkflowAuditEvent[] }

export type WorkflowState = {
  mode: 'demo' | 'service'
  extraction: { status: 'idle' | 'loading' | 'success' | 'error'; message: string; sourceText: string }
  ir: {
    version: string
    agreement_type: string
    currency: string
    total_amount: number
    milestones: { name: string; amount: number }[]
    review_period_days: number
    dispute_behavior: string
    governing_law: string | null
    provenance: { field: string; source: string; support: 'supported' | 'human_review' | 'unsupported' }[]
  } | null
  validation: { status: 'pending' | 'valid' | 'invalid'; issues: string[]; checkedAt: string }
  parity: { status: 'pending' | 'matched' | 'mismatched' | 'blocked'; score: number; mismatches: string[]; checkedAt: string; executionParams: { total: number; milestones: number[]; reviewDays: number; disputeFreeze: boolean } }
  reviews: WorkflowReview[]
  revisions: WorkflowRevision[]
  approval: { status: 'not_requested' | 'pending' | 'approved' | 'blocked'; by: string; at: string; note: string }
  solidity: { generation: SolidityGenerationState; compilation: SolidityCompilationState; tests: SolidityTestsState }
  traceability: WorkflowTraceabilityState
  simulation: WorkflowSimulationState | null
  approvedSnapshot: WorkflowApprovedSnapshot | null
  drift: WorkflowDriftReport
  versionHistory: WorkflowVersionRecord[]
  auditTrail: WorkflowAuditTrail
  execution: { status: 'blocked' | 'ready' | 'not_ready'; reason: string }
}

export const DEFAULT_WORKFLOW: WorkflowState = {
  mode: 'demo',
  extraction: { status: 'idle', message: '', sourceText: '' },
  ir: null,
  validation: { status: 'pending', issues: [], checkedAt: '' },
  parity: { status: 'pending', score: 0, mismatches: [], checkedAt: '', executionParams: { total: 50000, milestones: [20000, 30000], reviewDays: 5, disputeFreeze: true } },
  reviews: [],
  revisions: [],
  approval: { status: 'not_requested', by: '', at: '', note: '' },
  solidity: {
    generation: { status: 'idle', message: 'No Solidity generated yet.', filename: '', irVersion: '', source: '', metadata: null, supported: [], unsupported: [], security: [], errors: [] },
    compilation: { status: 'not_run', ranAt: '', message: 'Compilation not run (no Solidity compiler/tooling detected in this environment).', tool: 'unavailable' },
    tests: { status: 'not_run', ranAt: '', summary: 'Automated contract tests not run.', cases: [] },
  },
  traceability: { clauses: [], snapshots: {}, history: [] },
  simulation: null,
  approvedSnapshot: null,
  drift: { status: 'no_snapshot', checkedAt: '', irHashMatches: false, solidityHashMatches: false, currentIrHash: null, currentSolidityHash: null, snapshot: null, changes: [], materialChange: false },
  versionHistory: [],
  auditTrail: { implementation: 'locally_persisted_hash_chain', label: 'Locally persisted hash-linked audit trail (tamper-evident within local storage limitations; not immutable blockchain storage).', events: [] },
  execution: { status: 'not_ready', reason: 'Complete extraction, validation, parity, human approval, Solidity generation, and automated contract tests.' },
}

export function readWorkflow(): WorkflowState {
  const raw = readJson<Partial<WorkflowState>>(WORKFLOW_KEY, {})
  return {
    ...DEFAULT_WORKFLOW,
    ...raw,
    extraction: { ...DEFAULT_WORKFLOW.extraction, ...(raw.extraction || {}) },
    validation: { ...DEFAULT_WORKFLOW.validation, ...(raw.validation || {}) },
    parity: { ...DEFAULT_WORKFLOW.parity, ...(raw.parity || {}), executionParams: { ...DEFAULT_WORKFLOW.parity.executionParams, ...(raw.parity?.executionParams || {}) } },
    approval: { ...DEFAULT_WORKFLOW.approval, ...(raw.approval || {}) },
    solidity: {
      generation: { ...DEFAULT_WORKFLOW.solidity.generation, ...((raw as any).solidity?.generation || {}), supported: Array.isArray((raw as any).solidity?.generation?.supported) ? (raw as any).solidity.generation.supported : [], unsupported: Array.isArray((raw as any).solidity?.generation?.unsupported) ? (raw as any).solidity.generation.unsupported : [], security: Array.isArray((raw as any).solidity?.generation?.security) ? (raw as any).solidity.generation.security : [], errors: Array.isArray((raw as any).solidity?.generation?.errors) ? (raw as any).solidity.generation.errors : [] },
      compilation: { ...DEFAULT_WORKFLOW.solidity.compilation, ...((raw as any).solidity?.compilation || {}) },
      tests: { ...DEFAULT_WORKFLOW.solidity.tests, ...((raw as any).solidity?.tests || {}), cases: Array.isArray((raw as any).solidity?.tests?.cases) ? (raw as any).solidity.tests.cases : [] },
    },
    traceability: {
      clauses: Array.isArray((raw as any).traceability?.clauses) ? (raw as any).traceability.clauses : [],
      snapshots: (raw as any).traceability?.snapshots && typeof (raw as any).traceability.snapshots === 'object' ? (raw as any).traceability.snapshots : {},
      history: Array.isArray((raw as any).traceability?.history) ? (raw as any).traceability.history : [],
    },
    simulation: (raw as any).simulation ?? null,
    approvedSnapshot: (raw as any).approvedSnapshot ?? null,
    drift: { ...DEFAULT_WORKFLOW.drift, ...((raw as any).drift || {}), changes: Array.isArray((raw as any).drift?.changes) ? (raw as any).drift.changes : [] },
    versionHistory: Array.isArray((raw as any).versionHistory) ? (raw as any).versionHistory : [],
    auditTrail: { ...DEFAULT_WORKFLOW.auditTrail, ...((raw as any).auditTrail || {}), events: Array.isArray((raw as any).auditTrail?.events) ? (raw as any).auditTrail.events : [] },
    execution: { ...DEFAULT_WORKFLOW.execution, ...(raw.execution || {}) },
    reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
    revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
    ir: raw.ir ?? null,
  }
}

export function deriveExecution(workflow: WorkflowState): { status: WorkflowState['execution']['status']; reason: string } {
  if (!workflow.ir) return { status: 'not_ready', reason: 'Contract IR has not been generated.' }
  if (workflow.validation.status !== 'valid') return { status: 'blocked', reason: workflow.validation.issues[0] || 'Contract IR validation must pass before execution.' }
  if (workflow.parity.status === 'mismatched' || workflow.parity.status === 'blocked') return { status: 'blocked', reason: `Parity mismatch blocks execution (${workflow.parity.mismatches.join(', ') || 'critical mismatch'}).` }
  if (workflow.parity.status !== 'matched') return { status: 'not_ready', reason: 'Run parity verification before requesting execution readiness.' }
  if ((workflow as any).drift?.status === 'drift_detected' && (workflow as any).drift?.materialChange) return { status: 'blocked', reason: 'Material drift detected against approved snapshot. Re-review and reapprove before execution readiness.' }
  if (workflow.approval.status !== 'approved') return { status: 'blocked', reason: 'Human approval is required before execution readiness.' }
  const sol = (workflow as any).solidity || DEFAULT_WORKFLOW.solidity
  if (!sol || sol.generation?.status !== 'success') return { status: 'blocked', reason: sol?.generation?.errors?.[0] || sol?.generation?.message || 'Solidity generation from validated, approved Contract IR is required.' }
  if (sol.generation?.irVersion && workflow.ir && sol.generation.irVersion !== workflow.ir.version) return { status: 'blocked', reason: 'Generated Solidity is out of date with the current Contract IR version. Regenerate and retest.' }
  if (sol.compilation?.status === 'failed') return { status: 'blocked', reason: sol.compilation.message || 'Solidity compilation failed.' }
  if (sol.tests?.status !== 'passed') return { status: 'blocked', reason: sol.tests?.summary || 'Required automated contract tests must pass before execution readiness.' }
  const compileNote = sol.compilation?.status === 'passed' ? 'compiled and tests passed' : 'compilation not run (tooling unavailable), automated generation/security tests passed'
  return { status: 'ready', reason: `Validated, parity-matched, human-approved, Solidity generated, ${compileNote} (demo/local).` }
}

export function writeWorkflow(next: WorkflowState): WorkflowState {
  const derived = { ...next, execution: deriveExecution(next) }
  return writeJson(WORKFLOW_KEY, derived)
}
