/** Accessor helpers for localStorage that never throw when browser storage is
 * unavailable or disabled (private browsing, blocked cookies, embedded views).
 * Callers outside a try/catch must use these instead of touching localStorage. */

export function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable; best effort */ }
}

export function safeRemove(key: string): void {
  try { localStorage.removeItem(key) } catch { /* storage unavailable; best effort */ }
}

export function safeKeys(): string[] {
  try { return Object.keys(localStorage) } catch { return [] }
}
