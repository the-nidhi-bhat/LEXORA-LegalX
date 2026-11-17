// @ts-ignore - Node strip-types test resolution needs extension; tsc flags .ts imports without allowImportingTsExtensions
import { API_RETRY_ATTEMPTS, API_RETRY_DELAY_MS, API_TIMEOUT_MS, getApiBaseUrl, isRetryableStatus } from './config.ts'
import type { ApiEnvelope, ApiErrorCode, ApiErrorEnvelope } from './types.ts'

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  timeoutMs?: number
  retry?: number
  retryDelayMs?: number
  json?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
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
  if (res.ok) return { ok: true, data: (body ?? ({} as T)) as T }
  return toErrorEnvelope(res.status === 401 ? 'UNAUTHORIZED' : res.status === 403 ? 'FORBIDDEN' : res.status === 404 ? 'NOT_FOUND' : 'UNKNOWN_ERROR', typeof body === 'string' ? body : (body?.message || `Request failed (${res.status})`), body)
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { timeoutMs = API_TIMEOUT_MS, retry = API_RETRY_ATTEMPTS, retryDelayMs = API_RETRY_DELAY_MS, json, query, headers, ...init } = options
  const method = (init.method || 'GET').toUpperCase()
  const canRetry = method === 'GET' || method === 'HEAD'
  let attempt = 0
  let lastError: ApiErrorEnvelope | null = null
  while (attempt <= retry) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(buildUrl(path, query), {
        ...init,
        method,
        headers: {
          ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(headers || {}),
        },
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

// Planned endpoint helpers (frontend-ready; availability depends on backend contracts/implementation).
export const agreementsApi = {
  list: (params?: Record<string, any>) => apiClient.get('/agreements', { query: params }),
  get: (id: string) => apiClient.get(`/agreements/${encodeURIComponent(id)}`),
  create: (body: unknown) => apiClient.post('/agreements', body),
  reviewAction: (id: string, body: unknown) => apiClient.post(`/agreements/${encodeURIComponent(id)}/review`, body),
  versions: (id: string) => apiClient.get(`/agreements/${encodeURIComponent(id)}/versions`),
}
