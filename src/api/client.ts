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

function sleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>(resolve => {
    function finish() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    if (signal?.aborted) finish()
    else signal?.addEventListener('abort', finish, { once: true })
  })
}

/** Upper bound for a server-supplied Retry-After delay, so a bad header cannot stall the client. */
const MAX_RETRY_AFTER_MS = 30_000

/** Parse Retry-After (delta-seconds or HTTP-date) into milliseconds; null means absent/invalid. */
export function parseRetryAfter(header: string | null, now = Date.now(), maxMs = MAX_RETRY_AFTER_MS): number | null {
  if (!header) return null
  const value = header.trim()
  if (!value) return null
  if (/^\d+$/.test(value)) {
    const seconds = Number(value)
    return Number.isFinite(seconds) ? Math.min(seconds * 1000, maxMs) : null
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return Math.min(Math.max(parsed - now, 0), maxMs)
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = getApiBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = `${base}${normalizedPath}`
  if (!query) return url
  const [resource, fragment] = url.split(/#(.*)/s)
  const separator = resource.indexOf('?')
  const pathname = separator < 0 ? resource : resource.slice(0, separator)
  const qs = new URLSearchParams(separator < 0 ? '' : resource.slice(separator + 1))
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return pathname + (s ? `?${s}` : '') + (fragment === undefined ? '' : `#${fragment}`)
}

function toErrorEnvelope(code: ApiErrorCode | string, message: string, details?: unknown, requestId?: string): ApiErrorEnvelope {
  return { ok: false, error: { code, message, details }, requestId }
}

/** Only { error: { code | message, ... } } is a backend error envelope; other `error` fields are data. */
function isBackendErrorEnvelope(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const error = value as Record<string, unknown>
  return 'code' in error || 'message' in error
}

async function parseEnvelope<T>(res: Response): Promise<ApiEnvelope<T>> {
  const contentType = res.headers.get('content-type') || ''
  let body: any = null
  const mediaType = contentType.split(';')[0].trim().toLowerCase()
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    try { body = await res.json() } catch {
      if (res.ok && res.status !== 204 && res.status !== 205) {
        return toErrorEnvelope('INVALID_RESPONSE', 'Response contained invalid JSON')
      }
    }
  } else {
    try { body = await res.text() } catch { body = null }
  }
  if (body && typeof body === 'object' && ('ok' in body)) return body as ApiEnvelope<T>
  // Backend compatibility: FastAPI/custom envelope { error: { code, message, details }, request_id }
  if (body && typeof body === 'object' && !('ok' in body) && isBackendErrorEnvelope(body.error)) {
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
    if (init.signal?.aborted) return toErrorEnvelope('CANCELLED', 'Request cancelled')
    const controller = new AbortController()
    const cancel = () => controller.abort()
    init.signal?.addEventListener('abort', cancel, { once: true })
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
      const env = await parseEnvelope<T>(res)
      clearTimeout(timer)
      if (controller.signal.aborted) throw new DOMException('Request aborted', 'AbortError')
      if (init.signal?.aborted) return toErrorEnvelope('CANCELLED', 'Request cancelled')
      if (!env.ok && canRetry && attempt < retry && isRetryableStatus(res.status)) {
        attempt += 1
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'))
        await sleep(retryAfter ?? retryDelayMs * attempt, init.signal)
        continue
      }
      return env
    } catch (err: any) {
      clearTimeout(timer)
      if (init.signal?.aborted) return toErrorEnvelope('CANCELLED', 'Request cancelled')
      const aborted = err?.name === 'AbortError'
      lastError = toErrorEnvelope(aborted ? 'TIMEOUT' : 'NETWORK_ERROR', aborted ? 'Request timed out' : (err?.message || 'Network request failed'), { path, method })
      if (canRetry && attempt < retry) {
        attempt += 1
        await sleep(retryDelayMs * attempt, init.signal)
        continue
      }
      return lastError
    } finally {
      init.signal?.removeEventListener('abort', cancel)
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
    return await parseEnvelope<any>(res)
  } catch (err: any) {
    clearTimeout(timer)
    return toErrorEnvelope(err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', err?.message || 'Health request failed')
  }
}
