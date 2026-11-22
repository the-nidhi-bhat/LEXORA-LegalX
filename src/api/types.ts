// Centralized API types aligned to planned /api/v1 envelope contracts.
// Do not invent endpoints or assume backend availability; these are frontend-ready types.

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'MISSING_CLARIFICATION'
  | 'PARITY_BLOCKED'
  | 'WRONG_NETWORK'
  | 'INTEGRATION_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export interface ApiSuccessEnvelope<T> {
  ok: true
  data: T
  requestId?: string
}

export interface ApiErrorEnvelope {
  ok: false
  error: {
    code: ApiErrorCode | string
    message: string
    details?: unknown
  }
  requestId?: string
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope

export interface AgreementSummary {
  id: string
  title: string
  status: string
  agreementType?: string
  parties?: string[]
  updatedAt?: string
  createdAt?: string
  owner?: string
  version?: string
}

export interface AgreementListParams {
  search?: string
  status?: string
  party?: string
  dateFrom?: string
  dateTo?: string
  agreementType?: string
}

export interface UploadInitRequest {
  filename: string
  contentType?: string
  size?: number
}

export interface UploadInitResponse {
  uploadId?: string
  url?: string
  fields?: Record<string, string>
}

export interface ContractIrFieldEvidence {
  field: string
  value?: unknown
  source?: string
  evidenceRef?: string
  confidence?: number
  ambiguous?: boolean
  missing?: boolean
}

export interface ContractIrResponse {
  version?: string
  agreementType?: string
  parties?: unknown
  dates?: unknown
  amounts?: unknown
  obligations?: unknown
  clauses?: Array<{ id?: string; text?: string; type?: string; evidence?: string; confidence?: number; ambiguous?: boolean; missing?: boolean }>
  evidenceReferences?: Array<{ id?: string; ref?: string; label?: string }>
  missingClauses?: string[]
  ambiguousClauses?: string[]
  extractionConfidence?: number
  [key: string]: unknown
}

export interface ParityFieldResult {
  field: string
  status: 'matched' | 'mismatched' | 'blocked' | 'unsupported' | 'pending'
  expected?: unknown
  actual?: unknown
  reason?: string
}

export interface ParityResponse {
  status?: string
  score?: number
  matched?: ParityFieldResult[]
  mismatched?: ParityFieldResult[]
  blockingReasons?: string[]
  history?: Array<{ at?: string; status?: string; score?: number; summary?: string }>
  [key: string]: unknown
}

export interface ReviewActionRequest {
  action: 'approve' | 'reject' | 'request_changes'
  comment?: string
}

export interface VersionRecordResponse {
  id?: string
  version?: string
  createdAt?: string
  createdBy?: string
  summary?: string
  changedClauses?: unknown[]
  metadata?: Record<string, unknown>
  approvalHistory?: unknown[]
  [key: string]: unknown
}
