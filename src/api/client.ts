// @ts-ignore - Node strip-types test resolution needs extension; tsc flags .ts imports without allowImportingTsExtensions
import { API_RETRY_ATTEMPTS, API_RETRY_DELAY_MS, API_TIMEOUT_MS, getApiBaseUrl, isRetryableStatus } from './config.ts'
import type { ApiEnvelope, ApiErrorCode, ApiErrorEnvelope } from './types.ts'

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  timeoutMs?: number
  retry?: number
  retryDelayMs?: number
  json?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  csrfToken?: string
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = getApiBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = `${base}${normalizedPath}`
  if (!query) return url
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `${url}?${s}` : url
}

function toErrorEnvelope(code: ApiErrorCode | string, message: string, details?: unknown, requestId?: string): ApiErrorEnvelope {
  return { ok: false, error: { code, message, details }, requestId }
}

async function parseEnvelope<T>(res: Response): Promise<ApiEnvelope<T>> {
  const contentType = res.headers.get('content-type') || ''
  let body: any = null
  if (contentType.includes('application/json')) {
    try { body = await res.json() } catch { body = null }
  } else {
    try { body = await res.text() } catch { body = null }
  }
  if (body && typeof body === 'object' && ('ok' in body)) return body as ApiEnvelope<T>
  // Backend compatibility: FastAPI/custom envelope { error: { code, message, details }, request_id }
  if (body && typeof body === 'object' && body.error && !('ok' in body)) {
    const err = body.error || {}
    return toErrorEnvelope(err.code || (res.status === 401 ? 'UNAUTHORIZED' : res.status === 403 ? 'FORBIDDEN' : res.status === 404 ? 'NOT_FOUND' : 'UNKNOWN_ERROR'), err.message || `Request failed (${res.status})`, err.details ?? body, err.request_id || body.request_id || body.requestId)
  }
  if (res.ok) return { ok: true, data: (body ?? ({} as T)) as T }
  return toErrorEnvelope(res.status === 401 ? 'UNAUTHORIZED' : res.status === 403 ? 'FORBIDDEN' : res.status === 404 ? 'NOT_FOUND' : 'UNKNOWN_ERROR', typeof body === 'string' ? body : (body?.message || `Request failed (${res.status})`), body)
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { timeoutMs = API_TIMEOUT_MS, retry = API_RETRY_ATTEMPTS, retryDelayMs = API_RETRY_DELAY_MS, json, query, headers, csrfToken, ...init } = options
  const method = (init.method || 'GET').toUpperCase()
  const canRetry = method === 'GET' || method === 'HEAD'
  let attempt = 0
  let lastError: ApiErrorEnvelope | null = null
  while (attempt <= retry) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const requestHeaders = new Headers(headers)
      if (json !== undefined && !requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json')
      if (csrfToken && !requestHeaders.has('X-CSRF-Token')) requestHeaders.set('X-CSRF-Token', csrfToken)
      const res = await fetch(buildUrl(path, query), {
        credentials: init.credentials ?? 'include',
        ...init,
        method,
        headers: requestHeaders,
        body: json !== undefined ? JSON.stringify(json) : (init as any).body,
        signal: controller.signal,
      })
      clearTimeout(timer)
      const env = await parseEnvelope<T>(res)
      if (!env.ok && canRetry && attempt < retry && isRetryableStatus(res.status)) {
        attempt += 1
        await sleep(retryDelayMs * attempt)
        continue
      }
      return env
    } catch (err: any) {
      clearTimeout(timer)
      const aborted = err?.name === 'AbortError'
      lastError = toErrorEnvelope(aborted ? 'TIMEOUT' : 'NETWORK_ERROR', aborted ? 'Request timed out' : (err?.message || 'Network request failed'), { path, method })
      if (canRetry && attempt < retry) {
        attempt += 1
        await sleep(retryDelayMs * attempt)
        continue
      }
      return lastError
    }
  }
  return lastError || toErrorEnvelope('UNKNOWN_ERROR', 'Request failed')
}

export const apiClient = {
  get<T>(path: string, options?: RequestOptions) { return apiRequest<T>(path, { ...options, method: 'GET' }) },
  post<T>(path: string, json?: unknown, options?: RequestOptions) { return apiRequest<T>(path, { ...options, method: 'POST', json }) },
  put<T>(path: string, json?: unknown, options?: RequestOptions) { return apiRequest<T>(path, { ...options, method: 'PUT', json }) },
  patch<T>(path: string, json?: unknown, options?: RequestOptions) { return apiRequest<T>(path, { ...options, method: 'PATCH', json }) },
  del<T>(path: string, options?: RequestOptions) { return apiRequest<T>(path, { ...options, method: 'DELETE' }) },
}

/* ------------------------------------------------------------------------
   Endpoint helpers wired to the real FastAPI backend.
   Every helper returns ApiEnvelope<T> ({ ok, data } | { ok:false, error })
   so callers can fall back to local demo state without hiding failures.
   All paths below are relative to getApiBaseUrl() (/api/v1 by default).
   ------------------------------------------------------------------------ */

export interface UserOut {
  id: string; email: string; name: string; initials: string; role: string
  organization_id: string; organization_name: string
}
export interface SessionOut {
  user: UserOut; permissions: string[]; csrf_token: string; expires_at: string
}

export const authApi = {
  signIn: (email: string, password: string) =>
    apiClient.post<SessionOut>('/auth/session', { email, password }),
  me: () => apiClient.get<SessionOut>('/me'),
  signOut: (csrfToken?: string) =>
    apiClient.del<Record<string, never>>('/auth/session', csrfToken ? { csrfToken } : undefined),
}

export const agreementsApi = {
  list: (params?: Record<string, string | number | boolean | undefined | null>) =>
    apiClient.get<any>('/agreements', { query: params }),
  get: (id: string) => apiClient.get<any>(`/agreements/${encodeURIComponent(id)}`),
  create: (body: unknown) => apiClient.post<any>('/agreements', body),
  update: (id: string, body: unknown, csrfToken?: string) =>
    apiClient.patch<any>(`/agreements/${encodeURIComponent(id)}`, body, csrfToken ? { csrfToken } : undefined),
  versions: (id: string) => apiClient.get<any>(`/agreements/${encodeURIComponent(id)}/versions`),
}

export const versionsApi = {
  list: (agreementId: string) =>
    apiClient.get<any>(`/agreements/${encodeURIComponent(agreementId)}/versions`),
  create: (agreementId: string, body: unknown, csrfToken?: string) =>
    apiClient.post<any>(`/agreements/${encodeURIComponent(agreementId)}/versions`, body, csrfToken ? { csrfToken } : undefined),
  approve: (agreementId: string, versionNumber: number | string, body: unknown, csrfToken?: string) =>
    apiClient.post<any>(`/agreements/${encodeURIComponent(agreementId)}/versions/${encodeURIComponent(String(versionNumber))}/approve`, body, csrfToken ? { csrfToken } : undefined),
}

export const activityApi = {
  list: (params?: Record<string, string | number | boolean | undefined | null>) =>
    apiClient.get<any>('/activity', { query: params }),
}

export const executionApi = {
  run: (agreementId: string, body?: unknown, csrfToken?: string) =>
    apiClient.post<any>(`/agreements/${encodeURIComponent(agreementId)}/execution`, body ?? {}, csrfToken ? { csrfToken } : undefined),
}

export const parityApi = {
  verify: (agreementId: string, version: number | string, executionParameters: unknown, csrfToken?: string) =>
    apiClient.post<any>(`/agreements/${encodeURIComponent(agreementId)}/versions/${encodeURIComponent(String(version))}/verify`, { execution_parameters: executionParameters }, csrfToken ? { csrfToken } : undefined),
  trustPassport: (agreementId: string, version: number | string, csrfToken?: string) =>
    apiClient.get<any>(`/agreements/${encodeURIComponent(agreementId)}/trust-passport`, { query: { version }, ...(csrfToken ? { csrfToken } : {}) }),
}

/** Health endpoint has no /api/v1 prefix; call it directly via absolute path. */
export async function healthApi(): Promise<ApiEnvelope<any>> {
  const timeoutMs = API_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('/api/health', { credentials: 'include', signal: controller.signal })
    clearTimeout(timer)
    const ct = res.headers.get('content-type') || ''
    const body = ct.includes('application/json') ? await res.json() : await res.text()
    if (res.ok) return { ok: true, data: body }
    return toErrorEnvelope('UNKNOWN_ERROR', (body as any)?.message || `Health request failed (${res.status})`, body)
  } catch (err: any) {
    clearTimeout(timer)
    return toErrorEnvelope(err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', err?.message || 'Health request failed')
  }
}
