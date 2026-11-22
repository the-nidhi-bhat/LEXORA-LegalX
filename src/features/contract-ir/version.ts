/** IR version labels are `v<major>.<minor>`. Parse them by component:
 * stripping every non-digit turns v1.2 into 12 and v1.0 into 10. */

export function parseIrVersion(value: unknown): { major: number; minor: number } {
  const match = /^v?(\d+)(?:\.(\d+))?$/i.exec(String(value ?? '').trim())
  if (!match) return { major: 1, minor: 0 }
  const major = Number(match[1])
  const minor = match[2] === undefined ? 0 : Number(match[2])
  return {
    major: Number.isSafeInteger(major) && major > 0 ? major : 1,
    minor: Number.isSafeInteger(minor) && minor >= 0 ? minor : 0,
  }
}

/** Numeric version used by the backend API (the major component). */
export function irVersionNumber(value: unknown): number {
  return parseIrVersion(value).major
}

/** Label for the next major revision: v1.2 -> v2.0. */
export function nextIrMajorVersion(value: unknown): string {
  return `v${parseIrVersion(value).major + 1}.0`
}
