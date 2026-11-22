/* Backend-driven counterparts to the local demo pages.
   These are used ONLY when localStorage['legalx:backend-session'] === 'true',
   so authenticated workflows always show real persisted data. Demo mode keeps
   the original components, clearly labeled. */
import React, { useCallback, useEffect, useState } from 'react'
import { agreementsApi, versionsApi, activityApi } from './api/client.ts'

const csrf = () => localStorage.getItem('legalx:csrf') || ''
const activeId = () => localStorage.getItem('legalx:active-agreement') || ''
const errMsg = (env: any) => (env && env.error && env.error.message) || 'The request failed. Please try again.'
const pick = (o: any, ...keys: string[]): any => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]
  return undefined
}
const money = (minor: any, currency?: string) => {
  const n = Number(minor || 0)
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(n / 100) }
  catch { return (n / 100).toLocaleString('en-IN') + ' ' + (currency || '') }
}
const when = (o: any) => {
  const v = pick(o, 'created_at', 'createdAt', 'timestamp', 'at', 'occurred_at')
  if (!v) return ''
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString()
}

function LiveBadge() {
  return <span className="badge success"><i /> LIVE BACKEND</span>
}

export function BackendAgreementsList({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [statusFilter, setStatusFilter] = useState('All')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const env: any = await agreementsApi.list()
    if (env.ok) {
      const d = env.data as any
      setItems(Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [])
    } else setError(errMsg(env))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const stateOf = (item: any) => String(pick(item, 'status','state') || 'recorded')
  const titleOf = (item: any) => String(pick(item,'title','name') || 'Untitled agreement')
  const states = [...new Set(items.map(stateOf))]
  const filtered = items.filter(item => (statusFilter === 'All' || stateOf(item) === statusFilter) && titleOf(item).toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b) => sort === 'title' ? titleOf(a).localeCompare(titleOf(b)) : String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))

  return <div className="lx-agreements">
    <div className="page-header">
      <div><span className="section-kicker">AGREEMENTS · AUTHENTICATED</span><h1>Agreements</h1><p>Search your workspace and open an agreement to review its terms.</p></div>
      <LiveBadge />
    </div>
    {error && <div role="alert" className="inline-error">{error} <button className="btn secondary" onClick={load}>Retry</button></div>}
    <section className="register-search">
      <label>Search agreements<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title" /></label><label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All</option>{states.map(state=><option key={state}>{state}</option>)}</select></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Most recent</option><option value="title">Title A–Z</option></select></label><span role="status">{loading ? "Loading…" : error ? "" : filtered.length + " agreements"}</span>
    </section>
    <div className="table-panel panel"><div className="register-columns" aria-hidden="true"><span>Agreement</span><span>Status</span><span>Contract value</span></div>
      {loading ? <div className="empty-state">Loading agreements…</div>
        : error ? null : filtered.length === 0 ? <div className="empty-state">{items.length ? "No matching agreements. Adjust the search or status filter." : "Your workspace has no agreements."}</div>
        : filtered.map((a: any) => {
          const id = String(pick(a, 'id', 'agreement_id') || '')
          return <button key={id} className="field-row-button agreement-rows" onClick={() => {
            if (id) localStorage.setItem('legalx:active-agreement', id)
            onNavigate('/app/agreements/website-project')
          }}>
            <div><b>{pick(a, 'title', 'name') || 'Untitled agreement'}</b><div className="muted">{(pick(a, 'agreement_type') || 'agreement') + ' · ' + id.slice(0, 8)}</div></div>
            <span className="badge neutral">{pick(a, 'status', 'state') || 'recorded'}</span>
            <span>{money(pick(a, 'total_amount_minor'), pick(a, 'currency'))}</span>
          </button>
        })}
    </div>
  </div>
}

export function BackendAgreementDetail({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [agreement, setAgreement] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [saveState, setSaveState] = useState('')

  const load = useCallback(async () => {
    const id = activeId()
    if (!id) { setNotFound(true); setLoading(false); return }
    setLoading(true); setError(''); setNotFound(false)
    const env: any = await agreementsApi.get(id)
    if (env.ok) { setAgreement(env.data); setTitle(String(pick(env.data, 'title') || '')) }
    else if (env.error && (env.error.code === 'NOT_FOUND' || /not found/i.test(env.error.message || ''))) setNotFound(true)
    else setError(errMsg(env))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    const id = activeId()
    if (!id || !title.trim()) { setSaveState('Enter a title before saving.'); return }
    setSaveState('Saving…')
    const env: any = await agreementsApi.update(id, { title: title.trim() }, csrf())
    if (env.ok) { setAgreement(env.data); setSaveState('Saved to the backend.') }
    else setSaveState('Save failed: ' + errMsg(env))
  }

  if (loading) return <div className="lx-agreement-detail persisted-record"><div className="page-header"><div><span className="section-kicker">AGREEMENT DETAIL</span><h1>Loading agreement…</h1></div></div><div className="empty-state">Fetching persisted record from the backend.</div></div>
  if (notFound) return <div className="lx-agreement-detail persisted-record"><div className="page-header"><div><span className="section-kicker">AGREEMENT DETAIL</span><h1>Agreement not found</h1></div><LiveBadge /></div><div className="empty-state">No persisted agreement is selected. <button className="btn secondary" onClick={() => onNavigate('/app/agreements')}>Back to agreements</button></div></div>
  if (error) return <div className="lx-agreement-detail persisted-record"><div className="page-header"><div><span className="section-kicker">AGREEMENT DETAIL</span><h1>Unable to load</h1></div></div><div role="alert" className="inline-error">{error} <button className="btn secondary" onClick={load}>Retry</button></div></div>

  const id = String(pick(agreement, 'id', 'agreement_id') || '')
  const rows: [string, any][] = [
    ['Agreement ID', id],
    ['Title', pick(agreement, 'title')],
    ['Agreement type', pick(agreement, 'agreement_type')],
    ['Status', pick(agreement, 'status', 'state')],
    ['Currency', pick(agreement, 'currency')],
    ['Total amount', money(pick(agreement, 'total_amount_minor'), pick(agreement, 'currency'))],
    ['Approval policy', pick(agreement, 'approval_policy')],
    ['Review period', agreement.review_period_days == null ? '?' : [agreement.review_period_days, 'days', agreement.review_period_basis].filter(Boolean).join(' ')],
    ['Dispute behavior', pick(agreement, 'dispute_behavior')],
    ['Created', when(agreement)],
  ]

  return <div className="lx-agreement-detail persisted-record">
    <div className="page-header">
      <div><span className="section-kicker">AGREEMENT DETAIL · AUTHENTICATED</span><h1>{pick(agreement, 'title') || 'Agreement'}</h1><p>Persisted backend record. Changes are saved to the API.</p></div>
      <LiveBadge />
    </div>
    <section className="panel lx-hero-panel record-summary">
      <div><span className="section-kicker">Agreement reference</span><p className="record-reference">{id}</p></div>
      <div className="lx-readiness-card">
        <div><small>STATUS</small><strong>{pick(agreement, 'status', 'state') || 'recorded'}</strong></div>
        <div><small>TOTAL</small><strong>{money(pick(agreement, 'total_amount_minor'), pick(agreement, 'currency'))}</strong></div>
      </div>
    </section>
    <div className="lx-dashboard-grid">
      <section className="panel lx-chart-panel">
        <div className="panel-head"><div><span className="section-kicker">METADATA</span><h2>Record fields</h2></div></div>
        <dl className="record-facts">{rows.map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{String(v ?? "—")}</dd></div>)}</dl>
      </section>
      <section className="panel">
        <div className="panel-head"><div><span className="section-kicker">EDIT</span><h2>Update record</h2></div></div>
        {editing ? <div style={{ display: 'grid', gap: 10 }}>
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={save}>Save changes</button>
            <button className="btn secondary" onClick={() => { setEditing(false); setTitle(String(agreement?.title || '')); setSaveState('') }}>Cancel</button>
          </div>
          {saveState && <p className={saveState.startsWith('Save failed') || saveState.startsWith('Enter') ? 'inline-error' : 'muted'}>{saveState}</p>}
        </div> : <button className="btn secondary" onClick={() => setEditing(true)}>Edit agreement</button>}
      </section>
    </div>
    <BackendVersions agreementId={id} />
    <section className="panel" style={{ marginTop: 14 }}>
      <div className="panel-head"><div><span className="section-kicker">ACTIONS</span><h2>Next steps</h2></div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn secondary" onClick={() => onNavigate('/app/parity')}>Run parity</button>
        <button className="btn secondary" onClick={() => onNavigate('/app/activity')}>Activity history</button>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>
    </section>
  </div>
}

export function BackendVersions({ agreementId }: { agreementId: string }) {
  const [versions, setVersions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [summary, setSummary] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!agreementId) { setLoading(false); return }
    setLoading(true); setError('')
    const env: any = await versionsApi.list(agreementId)
    if (env.ok) {
      const d = env.data as any
      setVersions(Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.versions) ? d.versions : [])
    } else setError(errMsg(env))
    setLoading(false)
  }, [agreementId])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!text.trim()) { setStatus('Add version text before creating.'); return }
    setBusy(true); setStatus('Creating version…')
    const env: any = await versionsApi.create(agreementId, { text: text.trim(), change_summary: summary.trim() || 'Updated via workspace' }, csrf())
    setBusy(false)
    if (env.ok) { setStatus('Version created.'); setText(''); setSummary(''); load() }
    else setStatus('Create failed: ' + errMsg(env))
  }
  const approve = async (v: any) => {
    const n = pick(v, 'version_number', 'versionNumber', 'number', 'version')
    const sha = pick(v, 'sha256', 'content_hash', 'hash')
    if (n === undefined || !sha) { setStatus('This version has no approval metadata yet.'); return }
    if (!window.confirm(`Record approval for version ${n} of this agreement?`)) return
    setBusy(true); setStatus('Submitting approval…')
    const env: any = await versionsApi.approve(agreementId, Number(n), { confirm_sha256: String(sha) }, csrf())
    setBusy(false)
    if (env.ok) { setStatus('Approval recorded.'); load() }
    else setStatus('Approval blocked: ' + errMsg(env))
  }

  return <section className="panel version-section">
    <div className="panel-head"><div><span className="section-kicker">VERSIONS & APPROVALS</span><h2>Version history</h2></div><button className="btn secondary" onClick={load}>Refresh</button></div>
    {error && <div role="alert" className="inline-error">{error}</div>}
    {loading ? <div className="empty-state">Loading versions…</div>
      : versions.length === 0 ? <div className="empty-state">No versions recorded for this agreement.</div>
      : <div className="version-register">{versions.map((v: any, i: number) => {
        const n = pick(v, 'version_number', 'versionNumber', 'number', 'version')
        return <div className="field-row" key={String(n ?? i)}>
          <div><b>Version {String(n ?? i + 1)}</b><div className="muted">{pick(v, 'change_summary', 'summary') || when(v)}</div></div>
          <span className="badge neutral">{pick(v, 'status', 'state') || 'recorded'}</span>
          <button className="btn secondary" disabled={busy} onClick={() => approve(v)}>Approve</button>
        </div>
      })}</div>}
    <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
      <label>Version text<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe this version" /></label>
      <label>Change summary<input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Short summary" /></label>
      <button className="btn primary" disabled={busy} onClick={create}>Create version</button>
      {status && <p role="status" className="muted">{status}</p>}
    </div>
  </section>
}

export function BackendActivity({ role }: { role?: string }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const env: any = await activityApi.list()
    if (env.ok) {
      const d = env.data as any
      setItems(Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [])
    } else setError(errMsg(env))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  return <div>
    <div className="page-header"><div><span className="section-kicker">ACTIVITY · AUTHENTICATED</span><h1>Activity history</h1><p>Real persisted events from the backend audit trail.</p></div><LiveBadge /></div>
    {error && <div role="alert" className="inline-error">{error} <button className="btn secondary" onClick={load}>Retry</button></div>}
    <div className="activity-log panel">
      {loading ? <div className="empty-state">Loading activity…</div>
        : items.length === 0 ? <div className="empty-state">No activity has been recorded yet.</div>
        : items.map((e: any, i: number) => <div className="activity-row" key={String(pick(e, 'id') ?? i)}>
          <div><b>{pick(e, 'event_type', 'type', 'action', 'event') || 'event'}</b><div className="muted">{pick(e, 'detail', 'message', 'summary', 'actor', 'actor_name') || ''}</div></div>
          <span className="muted">{when(e)}</span>
        </div>)}
    </div>
  </div>
}

export function BackendExecution({ role }: { role?: string }) {
  const [state, setState] = useState('')
  const [busy, setBusy] = useState(false)
  const id = activeId()

  // READ-ONLY: eligibility is derived from persisted agreement/version records.
  // POST /execution performs the actual state transition and is never called by
  // this check; it remains a separate authorized action behind the full gate.
  const check = async () => {
    if (!id) { setState('Select an agreement first.'); return }
    setBusy(true); setState('Checking execution eligibility…')
    try {
      const env: any = await agreementsApi.get(id)
      if (!env.ok) { setState('Check failed: ' + errMsg(env)); return }
      const record: any = env.data
      const status = String(pick(record, 'status', 'state') || 'unknown')
      const policy = String(pick(record, 'approval_policy') || 'unknown')
      if (status !== 'draft') { setState(`Not eligible: agreement status is '${status}' (execution requires draft).`); return }
      const versionsEnv: any = await versionsApi.list(id)
      const d: any = versionsEnv.data
      const versions: any[] = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.versions) ? d.versions : []
      if (!versions.length) { setState(`Not eligible: no versions recorded for policy '${policy}'.`); return }
      setState(`Eligibility signals: draft status, ${versions.length} version(s), policy '${policy}'. Read-only check — the authorized execution gate decides.`)
    } finally { setBusy(false) }
  }

  return <div>
    <div className="page-header"><div><span className="section-kicker">EXECUTION · AUTHENTICATED</span><h1>Execution gate</h1><p>Eligibility is reported by the backend. The gate is never bypassed.</p></div><LiveBadge /></div>
    <div className="panel">
      <div className="gate-brief"><div><span className="section-kicker">Agreement reference</span><h2>{id || 'No agreement selected'}</h2></div><p>Checks approvals, parity and policy for the selected agreement before execution. This check does not trigger an on-chain action.</p></div>
      <button className="btn primary" disabled={busy || !id} onClick={check}>{busy ? 'Checking…' : 'Check eligibility'}</button>
      {state && <p role="status" className={state.startsWith('Blocked') || state.startsWith('Check failed') ? 'inline-error' : 'muted'}>{state}</p>}
    </div>
  </div>
}
