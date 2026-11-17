// Centralized API configuration. No secrets, no hardcoded localhost URLs.
// Prefer same-origin /api/v1 when deployed behind a reverse proxy.
// For Vite, set VITE_API_BASE_URL (e.g. https://api.example.com/api/v1) if needed.

export function getApiBaseUrl(): string {
  const viteEnv = (typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined) || {}
  const proc = (globalThis as any).process
  const envBase = (viteEnv.VITE_API_BASE_URL ?? proc?.env?.VITE_API_BASE_URL) as string | undefined
  const base = (envBase && String(envBase).trim()) || '/api/v1'
  return base.replace(/\/$/, '')
}

export const API_TIMEOUT_MS = 15000
export const API_RETRY_ATTEMPTS = 2
export const API_RETRY_DELAY_MS = 400

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}
