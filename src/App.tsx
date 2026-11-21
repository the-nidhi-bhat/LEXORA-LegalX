import { ScenarioList, WalkProgress } from './components/Walkthrough'
import { Badge, Button, Icon, PageHeader, type IconName } from './components/ui'
import { ContractIR } from './features/contract-ir/ContractIR'
import { PublicStory } from './PublicStory'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_ACCOUNTS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_NAV, type Role, canAccessRoute, hasPermission, maskFinancials } from './rbac'
import { AI_DRAFT_KEY, INVITES_KEY, MILESTONES_KEY, NOTIFICATIONS_KEY, WALLET_KEY, defaultProfile, effectiveAccount, readJson, readSettings, readStoredProfile, readText, readWorkflow, saveProfile, saveSettings, writeJson, writeText, writeWorkflow, type DemoSettings, type WorkflowState } from './demo-state'
import { generateSolidity, runGenerationTests } from './solidity'
import { buildClausesFromIr, deriveTraceability } from './traceability'
import { computeDrift, detectAndApplyDrift, ensureIntegrityFields, getAuditTrail, hashIr, hashSolidity, logEvent, recordVersion, snapshotApproved, verifyAuditTrail } from './workflow-integrity'
import { authApi, agreementsApi, parityApi } from './api/client.ts'
const loadRecords = () => import('./backend-pages')
const BackendAgreementsList = React.lazy(() => loadRecords().then(module => ({ default: module.BackendAgreementsList })))
const BackendAgreementDetail = React.lazy(() => loadRecords().then(module => ({ default: module.BackendAgreementDetail })))
const BackendActivity = React.lazy(() => loadRecords().then(module => ({ default: module.BackendActivity })))
const BackendExecution = React.lazy(() => loadRecords().then(module => ({ default: module.BackendExecution })))

const routes = ['/', '/product', '/how-it-works', '/solutions', '/security', '/pricing', '/about', '/faq', '/contact', '/sign-in', '/sign-up', '/demo', '/app', '/app/agreements', '/app/ai-workspace', '/app/contract-ir', '/app/parity', '/app/smart-contracts', '/app/milestones', '/app/transactions', '/app/activity', '/app/team', '/app/notifications', '/app/help', '/app/settings']
const DEMO_INPUT = `Client wants a website for ₹50,000. Pay ₹20,000 after the design is approved and ₹30,000 when the website is delivered. Client has 5 days to review each milestone. If there is a disagreement, freeze the payment until both parties resolve it.`
const milestones = [{ id: 'design', label: 'Design approval', amount: '₹20,000', percent: 40, detail: 'Release after written approval', status: 'Released' }, { id: 'delivery', label: 'Website delivery', amount: '₹30,000', percent: 60, detail: 'Release after final handoff', status: 'Pending' }]
const clauses = [{ id: 'amount', label: 'Total amount', legal: '₹50,000', code: '50000 INR', tone: 'lime', copy: 'Both outputs resolve to the same total consideration.' }, { id: 'milestone', label: 'Milestone split', legal: '₹20k + ₹30k', code: '[20000, 30000]', tone: 'blue', copy: 'Two payment milestones map to two escrow releases.' }, { id: 'deadline', label: 'Review window', legal: '5 calendar days', code: 'reviewWindow = 5 days', tone: 'purple', copy: 'The review window is an executable timing constraint.' }, { id: 'dispute', label: 'Dispute behavior', legal: 'Payment freeze', code: 'frozen = true', tone: 'coral', copy: 'A raised dispute locks the affected payment.' }]
const navGroups = [{ label: 'Workspace', items: [['Overview', '/app', 'grid'], ['Agreements', '/app/agreements', 'file'], ['AI Workspace', '/app/ai-workspace', 'spark']] }, { label: 'Verification', items: [['Contract IR', '/app/contract-ir', 'database'], ['Parity Verification', '/app/parity', 'scan'], ['Smart Contracts', '/app/smart-contracts', 'code']] }, { label: 'Operations', items: [['Milestones', '/app/milestones', 'layers'], ['Transactions', '/app/transactions', 'wallet'], ['Activity', '/app/activity', 'activity'], ['Team Workspace', '/app/team', 'users']] }, { label: 'Support', items: [['Notifications', '/app/notifications', 'bell'], ['Help & Support', '/app/help', 'help'], ['Settings', '/app/settings', 'settings']] }] as const

type NetworkMode = 'normal' | 'slow' | 'offline'
function readNetworkMode(): NetworkMode { const mode = localStorage.getItem('legalx:network-mode'); return mode === 'offline' || mode === 'slow' ? mode : 'normal' }
function guardDemoOperation(operation: string): { allowed: boolean; message: string } { const mode = readNetworkMode(); if (mode === 'offline') return { allowed: false, message: operation + ' blocked offline. No success was recorded.' }; if (mode === 'slow') return { allowed: false, message: operation + ' pending on a slow network. Waiting for confirmation; no success was recorded.' }; return { allowed: true, message: '' } }
function go(path: string) { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')) }
const THEME_KEY = 'legalx:theme'
type Theme = 'light' | 'dark'
function readTheme(): Theme { try { return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' } }
function applyTheme(theme: Theme) { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101820' : '#f5f1e8'); try { window.localStorage.setItem(THEME_KEY, theme) } catch { /* best effort */ } window.dispatchEvent(new Event('legalx:theme')) }
function ThemeToggle() { const [theme, setTheme] = useState<Theme>(() => readTheme()); useEffect(() => { const saved = readTheme(); document.documentElement.dataset.theme = saved; setTheme(saved); const handler = () => setTheme(readTheme()); window.addEventListener('legalx:theme', handler); return () => window.removeEventListener('legalx:theme', handler) }, []); const next = theme === 'light' ? 'dark' : 'light'; return <button className="theme-toggle" type="button" aria-label={`Switch to ${next} mode`} aria-pressed={theme === 'dark'} onClick={() => { setTheme(next); applyTheme(next) }}><span aria-hidden="true" className="theme-symbol">{theme === 'light' ? '☀' : '☾'}</span><span>{theme === 'light' ? 'Light' : 'Dark'}</span></button> }
function Logo({ light = false }: { light?: boolean }) {
  return <a className={light ? 'noir-wordmark on-dark' : 'noir-wordmark'} href="/" aria-label="LegalX home" onClick={event => {event.preventDefault(); go('/')}}>
    <svg aria-hidden="true" viewBox="0 0 34 36"><path d="M3 29 17 4l14 25H3Zm6 0 8-14 8 14M7 22h20M17 4v11" /></svg>
    <strong>LegalX</strong>
  </a>
}
function PublicNav({ active = '' }: { active?: string }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])
  const links = [['Product','/product'],['Workflow','/how-it-works'],['Solutions','/solutions'],['Security','/security'],['Pricing','/pricing']]
  return <header className="folio-mast"><div className="folio-mast-inner">
    <Logo />
    <nav id="public-navigation" aria-label="Primary" className={open ? 'folio-nav open' : 'folio-nav'}>
      {links.map(([label, href]) => <a href={href} key={href} aria-current={active===href?'page':undefined}>{label}</a>)}
      <a className="nav-mobile-signin" href="/sign-in">Sign in</a>
    </nav>
    <div className="folio-nav-end"><ThemeToggle/><a className="folio-signin" href="/sign-in">Sign in <span aria-hidden="true">↗</span></a>
      <button type="button" ref={trigger} className="folio-menu" aria-label={open?'Close navigation':'Open navigation'} aria-controls="public-navigation" aria-expanded={open} onClick={()=>setOpen(!open)}><Icon name={open?'x':'menu'} size={19}/></button>
    </div>
  </div></header>
}
function Footer() {
  return <footer className="folio-footer">
    <div className="folio-footer-top"><div><Logo/><p>Contract intelligence by Lexora.</p></div>
    {[['Product',['Workspace','/app'],['Product overview','/product'],['Workflow','/how-it-works'],['Guided demo','/demo'],['Parity comparison','/app/parity']],['Company',['About','/about'],['Security','/security'],['Contact','/contact']],['Resources',['Solutions','/solutions'],['Plans','/pricing'],['FAQ','/faq']]].map(([label,...links])=><div key={String(label)}><strong>{label}</strong>{links.map(link=><a key={link[1]} href={link[1]}>{link[0]}</a>)}</div>)}</div>
    <div className="folio-colophon"><span>© 2026 Lexora</span><span>Prototype workspace · Human review required</span><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
  </footer>
}

function LandingWorkflowShowcase() {
  const stages = [
    { id: 'agreement', label: 'Agreement Input', icon: 'file' as IconName, detail: 'Plain English/Hinglish terms captured as source text (demo).' },
    { id: 'extract', label: 'Clause Extraction', icon: 'spark' as IconName, detail: 'Deterministic extraction identifies parties, amounts, milestones, review window, dispute behavior.' },
    { id: 'ir', label: 'Contract IR', icon: 'database' as IconName, detail: 'Canonical structured IR with provenance/evidence (source of truth).' },
    { id: 'validation', label: 'Validation', icon: 'shield' as IconName, detail: 'Rule checks run; missing/invalid terms block downstream steps.' },
    { id: 'parity', label: 'Parity Verification', icon: 'scan' as IconName, detail: 'Independent IR vs execution comparison; mismatches block execution.' },
    { id: 'approval', label: 'Human Approval', icon: 'users' as IconName, detail: 'Explicit human gate; material drift requires re-review/reapproval.' },
    { id: 'solidity', label: 'Solidity Generation', icon: 'code' as IconName, detail: 'Deterministic generation from validated & approved IR (no runtime compilation in demo).' },
  ];
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [extractStep, setExtractStep] = useState(0);
  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced && !playing) { setExtractStep(4); return; }
    if (!playing) return;
    const t = window.setInterval(() => setActive(i => (i + 1) % stages.length), 2600);
    return () => window.clearInterval(t);
  }, [playing]);
  useEffect(() => {
    if (active !== 1) { setExtractStep(active > 1 ? 4 : 0); return; }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setExtractStep(4); return }
    setExtractStep(0);
    const timers = [300,700,1100,1500].map((ms,idx)=>window.setTimeout(()=>setExtractStep(idx+1),ms));
    return () => timers.forEach(window.clearTimeout);
  }, [active]);
  const current = stages[active];
  const fields = [
    { k: 'total_amount', v: '₹50,000', ok: extractStep >= 1 },
    { k: 'milestone_1', v: '₹20,000 · design', ok: extractStep >= 2 },
    { k: 'milestone_2', v: '₹30,000 · delivery', ok: extractStep >= 3 },
    { k: 'review/dispute', v: '5 days · freeze', ok: extractStep >= 4 },
  ];
  const parityRows = [
    { label: 'Total amount', ir: '₹50,000', ex: '₹50,000', ok: true },
    { label: 'Milestones', ir: '20k + 30k', ex: '20k + 30k', ok: true },
    { label: 'Review window', ir: '5 days', ex: '5 days', ok: true },
    { label: 'Dispute behavior', ir: 'freeze', ex: 'freeze', ok: true },
  ];
  return <div className="case-study">
    <div className="case-menu" aria-label="Workflow stages">{stages.map((stage,i)=><button key={stage.id} type="button" aria-pressed={i===active} onClick={()=>{setActive(i);setPlaying(false)}}><Icon name={stage.icon} size={16}/><span>{stage.label}</span><small>{String(i+1).padStart(2,'0')}</small></button>)}</div>
    <article className="case-page">
      <div className="case-folio"><span>Website development agreement</span><span>Sample · {String(active+1).padStart(2,'0')} / 07</span></div>
      <div key={active} className="case-evidence"><h3>{current.label}</h3><p>{current.detail}</p>
      {active===0 && <blockquote>“Client wants a website for ₹50,000. Pay ₹20,000 after design approval and ₹30,000 on delivery. Client has five days to review each milestone. If there is a disagreement, freeze the payment.”</blockquote>}
      {active===1 && <dl>{fields.map(f=><div key={f.k}><dt>{f.k}</dt><dd>{f.ok?f.v:'Extracting…'}</dd></div>)}</dl>}
      {active===2 && <pre>{JSON.stringify({agreement_type:'freelance_milestone',total_amount:50000,milestones:[20000,30000],review_period_days:5,dispute_behavior:'freeze'},null,2)}</pre>}
      {active===3 && <dl><div><dt>Milestones</dt><dd>₹20,000 + ₹30,000</dd></div><div><dt>Agreement total</dt><dd>₹50,000</dd></div><div><dt>Validation</dt><dd>Milestone sum matches</dd></div></dl>}
      {active===4 && <div className="case-table"><table><thead><tr><th>Field</th><th>Contract IR</th><th>Execution</th></tr></thead><tbody>{parityRows.map(r=><tr key={r.label}><th>{r.label}</th><td>{r.ir}</td><td>{r.ex}</td></tr>)}</tbody></table></div>}
      {active===5 && <blockquote>Approval applies to the reviewed version. A material change sends the agreement back for review.</blockquote>}
      {active===6 && <pre>{'contract LexoraMilestoneEscrow {\n  uint256 total = 50000;\n  uint16 reviewDays = 5;\n  bool disputeFreeze = true;\n}'}</pre>}
      </div><div className="case-controls"><button type="button" aria-pressed={playing} onClick={()=>setPlaying(!playing)}><Icon name={playing?'clock':'play'} size={14}/>{playing?'Pause':'Play'} walkthrough</button><a href="/app/ai-workspace">Open agreement intake ↗</a></div>
    </article>
  </div>;

}

function Landing({ page = '/' }: { page?: string }) {
  return <div className="noir-public">
    <PublicNav active={page} />
    <PublicStory key={page} page={page} showcase={<LandingWorkflowShowcase />} faq={<Help />} />
    <Footer />
  </div>
}


function Auth({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const existing = readStoredProfile()
  const [email, setEmail] = useState(existing?.email || '')
  const [name, setName] = useState(mode === 'sign-up' ? (existing?.name || '') : '')
  const [workspaceName, setWorkspaceName] = useState(mode === 'sign-up' ? (existing?.workspaceName || '') : '')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('legalx-demo-2026')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes('@')) { setError('Enter a valid email address to continue.'); return }
    if (mode === 'sign-up' && !name.trim()) { setError('Add your name so it appears throughout the workspace.'); return }
    if (mode === 'sign-up') {
      saveProfile({ ...(existing || defaultProfile('owner')), name: name.trim(), email: normalizedEmail, workspaceName: workspaceName.trim() || 'Acme Digital', role: existing?.role || 'owner' })
      localStorage.setItem('legalx:role', existing?.role || 'owner')
    } else {
      // Real backend authentication. A credential failure is shown to the user and
      // NEVER auto-logs-in; only an unreachable backend offers a clearly-labeled demo.
      setBusy(true)
      let networkDown = false
      try {
        const result = await authApi.signIn(normalizedEmail, password)
        if (result.ok && result.data) {
          const session = result.data
          const backendRole = String((session as any).user?.role || '').toLowerCase()
          const role = (['owner','freelancer','legal_reviewer','org_admin','technical_auditor'].includes(backendRole) ? backendRole : 'owner')
          localStorage.setItem('legalx:role', role)
          localStorage.setItem('legalx:csrf', String((session as any).csrf_token || ''))
          localStorage.setItem('legalx:backend-session', 'true')
          const u = (session as any).user || {}
          saveProfile({ ...(existing || defaultProfile(role as any)), name: u.name || existing?.name || role, email: normalizedEmail, workspaceName: u.organization_name || existing?.workspaceName || 'Acme Digital', role: role as any })
          setBusy(false); setError(''); setSubmitted(true)
          return
        }
        const code = String((result as any)?.error?.code || '')
        if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') {
          networkDown = true
        } else {
          // Genuine auth failure (INVALID_CREDENTIALS / UNAUTHORIZED / validation):
          // surface the safe backend message and do NOT fall back to a demo login.
          setBusy(false)
          setError((result as any)?.error?.message || 'Email or password is incorrect.')
          return
        }
      } catch (e) {
        networkDown = true
      }
      setBusy(false)
      if (!networkDown) return
      // Backend unreachable: clearly-labeled local demo, never a backend success.
      localStorage.setItem('legalx:backend-session', 'false')
      const known = DEMO_ACCOUNTS.find((account) => account.email === normalizedEmail)
      if (known) localStorage.setItem('legalx:role', known.role)
      else if (existing?.email.toLowerCase() === normalizedEmail) localStorage.setItem('legalx:role', existing.role)
    }
    setError(''); setSubmitted(true)
  }
  return <main className="entry-hall"><aside className="entry-art"><Logo light /><div><span>LegalX</span><p>The living contract.</p></div></aside><section className="entry-panel"><div className="entry-tools"><a href="/">← Back to site</a><ThemeToggle /></div><form className="auth-form" noValidate onSubmit={event => { event.preventDefault(); if (!busy && !submitted) void submit() }}><h1>{mode === 'sign-in' ? 'Sign in to your workspace.' : 'Create your workspace.'}</h1><p className="muted">{mode === 'sign-in' ? 'Use your workspace email and password.' : 'Create a local profile for the prototype workspace.'}</p>{submitted ? <div className="success-box"><Icon name="check" size={22} /><b>{mode === 'sign-in' ? 'Session ready.' : 'Workspace reserved.'}</b><p>{localStorage.getItem('legalx:backend-session') === 'true' ? 'Authenticated with the LEGALX backend. Continue to choose the role that should govern the workspace.' : (localStorage.getItem('legalx:backend-session') === 'false' ? 'Backend unavailable; using a local demo session. This is a frontend-only state, not a backend login.' : 'This prototype keeps the identity locally and does not send email. Continue to choose the role that should govern the workspace.')}</p><Button onClick={() => go('/onboarding')} icon="arrow">Continue to onboarding</Button></div> : <>{mode === 'sign-up' && <label>Full name<input required placeholder="Your name" value={name} onChange={(e) => { setName(e.target.value); setError('') }} /></label>}{mode === 'sign-in' && <label>Email address<input autoComplete="username" aria-label="Email address" type="email" placeholder="you@company.com" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} /></label>}{mode === 'sign-in' && <label>Password<input autoComplete="current-password" aria-label="Password" type="password" placeholder="Demo password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} /></label>}{mode === 'sign-up' && <label>Email address<input required type="email" placeholder="you@company.com" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} /></label>}{mode === 'sign-up' && <label>Workspace name<input placeholder="Acme Studio" value={workspaceName} onChange={(e) => { setWorkspaceName(e.target.value); setError('') }} /></label>}{error && <div role="alert" className="inline-form-error"><Icon name="alert" size={14} />{error}</div>}<button className="btn primary" disabled={busy} type="submit" aria-busy={busy}>{mode === 'sign-in' ? 'Continue' : 'Create workspace'}<Icon name="arrow" size={15}/></button><div className="or"><span>or</span></div><Button kind="secondary" onClick={() => go('/demo')} icon="play">Explore demo without an account</Button></>}{mode === 'sign-in' && <button type="button" className="forgot" onClick={() => { setError('Password reset is not connected in this local demo. Use a demo email or continue as a guest.'); setSubmitted(false) }}>Forgot password?</button>}<p className="auth-switch">{mode === 'sign-in' ? 'New to LEGALX?' : 'Already have an account?'} <a href={mode === 'sign-in' ? '/sign-up' : '/sign-in'} onClick={(e) => { e.preventDefault(); go(mode === 'sign-in' ? '/sign-up' : '/sign-in') }}>{mode === 'sign-in' ? 'Create an account' : 'Sign in'}</a></p></form></section></main>
}function Unauthorized({ role, path, onNavigate }: { role: Role; path: string; onNavigate: (p: string) => void }) { return <div className="panel access-denied"><span className="section-kicker">ACCESS CONTROL · 403</span><h1>This view is outside your role.</h1><p>Your current role is <b>{ROLE_LABELS[role]}</b>. LEGALX denied <code>{path}</code> before rendering agreement, financial, or workspace data.</p><div className="access-denied-actions"><Button onClick={() => onNavigate('/app')} icon="arrow">Return to your dashboard</Button><Button kind="secondary" onClick={() => window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Ask a workspace admin to grant a permitted role.' }))}>Request access</Button></div></div> }

  type Agreement = { id: string; title: string; status: string; party: string; counterparty: string; agreementType: string; updatedAt: string; amount: string; source: 'demo' | 'backend'; summary: string };
  const demoAgreements: Agreement[] = [
    { id: 'website-project', title: 'Website project', status: 'Verified', party: 'Acme Digital', counterparty: 'Freelance Developer', agreementType: 'Freelance milestone', updatedAt: '2026-11-06', amount: '₹50,000', source: 'demo', summary: 'Freelance website development with milestone escrow terms, review window, and dispute freeze behavior.' },
    { id: 'brand-retainer', title: 'Brand retainer', status: 'Ready for review', party: 'Acme Digital', counterparty: 'Studio North', agreementType: 'Retainer', updatedAt: '2026-11-04', amount: '₹1,20,000', source: 'demo', summary: 'Brand identity retainer with monthly deliverables and approval checkpoints.' },
    { id: 'mobile-app-build', title: 'Mobile app build', status: 'Mismatch detected', party: 'Acme Digital', counterparty: 'BuildWorks', agreementType: 'Product development', updatedAt: '2026-10-28', amount: '₹2,40,000', source: 'demo', summary: 'Mobile product build requiring parity clarification before execution readiness.' },
    { id: 'legal-advisory', title: 'Legal advisory', status: 'Draft', party: 'Acme Digital', counterparty: 'Counsel Partners', agreementType: 'Advisory', updatedAt: '2026-10-22', amount: '₹75,000', source: 'demo', summary: 'Monthly legal advisory draft pending extraction and Contract IR generation.' },
  ];
function RoleSwitcher({ role, onRoleChange }: { role: Role; onRoleChange: (role: Role) => void }) {
  return <label className="identity-switch"><span>Workspace identity</span><select aria-label="Switch demo role" value={role} onChange={event => onRoleChange(event.target.value as Role)}>{DEMO_ACCOUNTS.map(account => <option key={account.role} value={account.role}>{ROLE_LABELS[account.role]}</option>)}</select></label>
}

const dashboardActions: Record<Role, [string,string,string][]> = {
  owner: [['Create agreement','Capture the agreed terms','/app/ai-workspace'],['Run parity check','Compare written and execution terms','/app/parity'],['Review escrow','Inspect execution readiness','/app/smart-contracts']],
  freelancer: [['Review invitation','Inspect assigned agreements','/app/agreements'],['Submit evidence','Open the activity record','/app/activity'],['View payments','Inspect transaction history','/app/transactions']],
  legal_reviewer: [['Review assigned deal','Open the agreement dossier','/app/agreements/website-project'],['Inspect extraction','Review terms in context','/app/ai-workspace'],['Inspect Contract IR','Review structured evidence','/app/contract-ir']],
  org_admin: [['Manage members','Review the team roster','/app/team'],['Review roles','Workspace preferences','/app/settings'],['Inspect activity','Read the event register','/app/activity']],
  technical_auditor: [['Inspect Contract IR','Read structured terms','/app/contract-ir'],['Review parity report','Compare contract fields','/app/parity'],['Export audit evidence','Open the agreement dossier','/app/agreements/website-project']]
}
function RoleDashboard({ role, onNavigate }: { role: Role; onNavigate: (p: string) => void; onRoleChange: (role: Role) => void; demoBanner?: boolean }) {
  const account = effectiveAccount(role)
  const live = localStorage.getItem('legalx:backend-session') === 'true'
  const canBrowse = canAccessRoute(role, '/app/agreements')
  const [records, setRecords] = useState<{ id: string; title: string; status: string }[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(live)
  useEffect(() => {
    if (!live || !canBrowse) return
    let active = true
    setLoading(true)
    setError('')
    agreementsApi.list().then(result => {
      if (!active) return
      if (result.ok) {
        const data = result.data as any
        const items = Array.isArray(data) ? data : data?.items || []
        setRecords(items.map((a: any) => ({ id: String(a.id ?? a.agreement_id), title: a.title || a.name || 'Untitled agreement', status: a.status || a.state || 'Recorded' })))
      } else setError(result.error?.message || 'Unable to load the agreement register.')
      setLoading(false)
    }).catch(() => { if (active) { setError('Unable to load the agreement register.'); setLoading(false) } })
    return () => { active = false }
  }, [live, canBrowse, role])
  const listed = live ? records : demoAgreements
  const actions = dashboardActions[role].filter(([, ,href]) => canAccessRoute(role, href))
  const tally = new Map<string, number>()
  listed.forEach(record => tally.set(record.status, (tally.get(record.status) || 0) + 1))
  const current = readWorkflow()
  return <div className="desk">
    <header className="desk-title"><div><span className="section-kicker">{account.workspaceName} / {ROLE_LABELS[role]}</span><h1>Workspace overview</h1></div>
      <span className="desk-source"><i />{live ? 'Authenticated session' : 'Demo workspace'}</span></header>
    <div className="desk-spread">
      <section className="desk-register">
        <div className="desk-cover"><div className="folio-sculpture" aria-hidden="true"><i/><i/><i/><i/></div>
          <div className="desk-cover-copy"><Icon name="layers" size={23}/><h2>Agreement register</h2><p>{account.workspaceName}</p></div>
        </div>
        {canBrowse && <><div className="desk-register-head"><h3>{live ? 'Workspace agreements' : 'Sample agreements'}</h3><button onClick={() => onNavigate('/app/agreements')}>View all <Icon name="arrow" size={15}/></button></div>
        {error ? <p role="alert" className="desk-message">{error}</p> : live && loading ? <p role="status" className="desk-message">Loading agreements…</p> : listed.length === 0 ? <p className="desk-message">No agreements in this workspace.</p> : <ul className="desk-files">{listed.slice(0,5).map(record => <li key={record.id}><button onClick={() => {
          if (live) localStorage.setItem('legalx:active-agreement', record.id)
          else sessionStorage.setItem('legalx:preview-id',record.id)
          onNavigate(live && canAccessRoute(role,'/app/agreements/website-project') ? '/app/agreements/website-project' : '/app/agreements')
        }}><span className="folio-icon"><Icon name="file" size={18}/></span><b>{record.title}</b><span>{record.status}</span><Icon name="chevron" size={14}/></button></li>)}</ul>}</>}
      </section>
      <aside className="desk-side">
        {canBrowse && !error && !loading && <section className="ledger-block"><h2>Register summary</h2><div className="ledger-total"><strong>{listed.length}</strong><span>listed agreements</span></div>
          <div className="ledger-bars">{Array.from(tally).map(([status,count]) => <div key={status}><span>{status}</span><meter value={count} min="0" max={listed.length || 1}/><b>{count}</b></div>)}</div></section>}
        <section className="desk-actions"><h2>Workspace actions</h2>{actions.map(([label,description,path]) => <button key={label} onClick={() => onNavigate(path)}><span><b>{label}</b><small>{description}</small></span><Icon name="arrow" size={16}/></button>)}</section>
      </aside>
    </div>
    {!live && <section className="desk-gates"><header><h2>Current review</h2><span>Local workflow</span></header><dl>{[['Validation',current.validation.status],['Parity',current.parity.status],['Human approval',current.approval.status],['Execution',current.execution.status]].map(([stage,state]) => <div key={stage}><dt>{stage}</dt><dd>{state.replace(/_/g,' ')}</dd></div>)}</dl></section>}
  </div>
}

function SearchDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={ref} className="workspace-dialog" aria-label="Command palette" onCancel={onClose}
    onClick={event => { if (event.target === ref.current) onClose() }}>{children}</dialog>
}

function AppShell({ path, role, onNavigate, onRoleChange }: { path: string; role: Role; onNavigate: (path: string) => void; onRoleChange: (role: Role) => void }) {
  const [compact, setCompact] = useState(() => localStorage.getItem('legalx:compact-nav') === 'true')
  const [dismissedCheckpoint, setDismissedCheckpoint] = useState<string | null>(null);
  const checkpoint = [localStorage.getItem('legalx:guided-step'), localStorage.getItem('legalx:guided-paused')].join('/');
  const [sidebarOpen, setSidebarOpen] = useState(false); const [online, setOnline] = useState(() => navigator.onLine && readNetworkMode() !== 'offline'); const [slowNetwork, setSlowNetwork] = useState(() => readNetworkMode() === 'slow'); const [demoActive, setDemoActive] = useState(() => localStorage.getItem('legalx:guided-active') === 'true'); const [demoPaused, setDemoPaused] = useState(() => localStorage.getItem('legalx:guided-paused') === 'true'); const [toast, setToast] = useState(''); const [workflow, setWorkflow] = useState<WorkflowState>(() => readWorkflow()); const [tampered, setTampered] = useState(() => readWorkflow().parity.status === 'mismatched' || readWorkflow().parity.status === 'blocked'); const [input, setInput] = useState(() => readText(AI_DRAFT_KEY, DEMO_INPUT)); const [parsed, setParsed] = useState(() => readText('legalx:ai-parsed') === 'true' || readWorkflow().extraction.status === 'success'); const [operationBusy, setOperationBusy] = useState(false); const [jsonView, setJsonView] = useState(false); const [search, setSearch] = useState(''); const [paletteOpen, setPaletteOpen] = useState(false); const [paletteQuery, setPaletteQuery] = useState(''); const account = effectiveAccount(role); const nav = ROLE_NAV[role]; const currentLabel = nav.find((item) => item[1] === path)?.[0] ?? (path === '/app' ? 'Dashboard' : 'Protected view'); const allowed = canAccessRoute(role, path); const score = tampered ? 74 : (workflow.parity.score || (workflow.parity.status === 'matched' ? 100 : workflow.validation.status === 'valid' ? 92 : 0));
  useEffect(() => { const sync = () => { const next = readWorkflow(); setWorkflow(next); if (next.parity.status === 'mismatched' || next.parity.status === 'blocked') setTampered(true); if (next.parity.status === 'matched') setTampered(false); if (next.extraction.status === 'success') setParsed(true); }; sync(); window.addEventListener('legalx:state', sync); return () => window.removeEventListener('legalx:state', sync) }, []);
  useEffect(() => { const onlineHandler = () => setOnline(readNetworkMode() !== 'offline'); const offlineHandler = () => setOnline(false); const modeHandler = () => { const mode = readNetworkMode(); setOnline(navigator.onLine && mode !== 'offline'); setSlowNetwork(mode === 'slow'); setDemoPaused(localStorage.getItem('legalx:guided-paused') === 'true') }; window.addEventListener('online', onlineHandler); window.addEventListener('offline', offlineHandler); window.addEventListener('legalx:network-mode', modeHandler); return () => { window.removeEventListener('online', onlineHandler); window.removeEventListener('offline', offlineHandler); window.removeEventListener('legalx:network-mode', modeHandler) } }, []); useEffect(() => { localStorage.setItem(AI_DRAFT_KEY, input) }, [input]); useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(t) }, [toast]); useEffect(() => { const handler = (event: Event) => setToast((event as CustomEvent<string>).detail); window.addEventListener('legalx:notice', handler); return () => window.removeEventListener('legalx:notice', handler) }, []);
  const validateIr = (ir: NonNullable<WorkflowState['ir']>) => {
    const issues: string[] = [];
    if (!ir.total_amount || ir.total_amount <= 0) issues.push('Total amount is missing or invalid.');
    if (!ir.milestones?.length) issues.push('At least one milestone is required.');
    const milestoneSum = (ir.milestones || []).reduce((sum: number, m) => sum + (m.amount || 0), 0);
    if (ir.total_amount && milestoneSum !== ir.total_amount) issues.push(`Milestone amounts (${milestoneSum}) do not match total (${ir.total_amount}).`);
    if (!ir.review_period_days || ir.review_period_days < 1) issues.push('Review period must be at least 1 day.');
    if (!ir.dispute_behavior) issues.push('Dispute behavior is required.');
    if (!ir.agreement_type) issues.push('Agreement type is required.');
    return { status: (issues.length ? 'invalid' : 'valid') as WorkflowState['validation']['status'], issues, checkedAt: new Date().toLocaleString() } as WorkflowState['validation'];
  };
  const runParityCheck = (ir: NonNullable<WorkflowState['ir']>, executionParams: WorkflowState['parity']['executionParams']) => {
    const mismatches: string[] = [];
    if (ir.total_amount !== executionParams.total) mismatches.push('total_amount');
    if (JSON.stringify((ir.milestones || []).map((m) => m.amount)) !== JSON.stringify(executionParams.milestones)) mismatches.push('milestones');
    if (ir.review_period_days !== executionParams.reviewDays) mismatches.push('review_period_days');
    if ((ir.dispute_behavior === 'freeze_affected_payment') !== executionParams.disputeFreeze) mismatches.push('dispute_behavior');
    const matched = mismatches.length === 0;
    return { status: (matched ? 'matched' : 'mismatched') as WorkflowState['parity']['status'], score: matched ? 100 : 74, mismatches, checkedAt: new Date().toLocaleString(), executionParams } as WorkflowState['parity'];
  };
  const snapshotTraceability = (wf: WorkflowState, prevVersion?: string | null): WorkflowState => {
    const ir = wf.ir;
    const clauses = (wf.traceability?.clauses?.length ? wf.traceability.clauses : (ir ? buildClausesFromIr(ir, wf.extraction?.sourceText || '') : [])).map((c: any) => ({ ...c, irVersion: ir?.version || c.irVersion }));
    const snap = deriveTraceability({ ...wf, traceability: { ...(wf.traceability || { clauses: [], snapshots: {}, history: [] }), clauses } } as WorkflowState);
    const snapshots = { ...((wf.traceability && wf.traceability.snapshots) || {}), [snap.irVersion]: snap } as Record<string, any>;
    let history = Array.isArray(wf.traceability?.history) ? [...wf.traceability.history] : [];
    if (prevVersion && prevVersion !== snap.irVersion) {
      const prevSnap = snapshots[prevVersion] || history.find((h: any) => h.irVersion === prevVersion);
      if (prevSnap && !history.find((h: any) => h.irVersion === prevVersion)) history = [...history, prevSnap];
    }
    // ensure current in snapshots
    snapshots[snap.irVersion] = snap;
    return { ...wf, traceability: { clauses, snapshots, history } } as WorkflowState;
  };
  const runParityFor = (ir: NonNullable<WorkflowState['ir']>, executionParams: WorkflowState['parity']['executionParams']) => runParityCheck(ir, executionParams);
  const validateIrObj = (ir: NonNullable<WorkflowState['ir']>) => validateIr(ir);

  const runParse = () => {
    if (operationBusy) return;
    const guard = guardDemoOperation('Clause extraction / IR generation');
    if (!guard.allowed) { setToast(guard.message); writeWorkflow({ ...readWorkflow(), extraction: { status: 'error', message: guard.message, sourceText: input } }); return; }
    const sourceText = input.trim();
    if (!sourceText) { setToast('Add agreement text before extraction.'); writeWorkflow({ ...readWorkflow(), extraction: { status: 'error', message: 'Agreement input is empty.', sourceText } }); return; }
    setOperationBusy(true);
    setParsed(false);
    const base = readWorkflow();
    writeWorkflow({ ...base, mode: 'demo', extraction: { status: 'loading', message: 'Extracting clauses and generating Contract IR (deterministic local demo; no live AI/API).', sourceText }, validation: { status: 'pending', issues: [], checkedAt: '' }, parity: { ...base.parity, status: 'pending', score: 0, mismatches: [], checkedAt: '' }, approval: { status: 'not_requested', by: '', at: '', note: '' } });
    setToast('Extracting clauses and generating Contract IR locally…');
    window.setTimeout(() => {
      const guardDone = guardDemoOperation('Extraction completion');
      if (!guardDone.allowed) { setOperationBusy(false); setToast(guardDone.message); writeWorkflow({ ...readWorkflow(), extraction: { status: 'error', message: guardDone.message, sourceText } }); return; }
      const lowered = sourceText.toLowerCase();
      const hasCore = lowered.includes('50000') || lowered.includes('50,000') || (lowered.includes('20000') && lowered.includes('30000'));
      const prev = readWorkflow();
      const ir: NonNullable<WorkflowState['ir']> = {
        version: prev.ir ? `v${(parseInt((prev.ir.version || 'v1').replace(/[^0-9]/g, ''), 10) || 1) + 1}.0` : 'v1.0',
        agreement_type: 'freelance_milestone',
        currency: 'INR',
        total_amount: 50000,
        milestones: [{ name: 'Design approval', amount: 20000 }, { name: 'Website delivery', amount: 30000 }],
        review_period_days: 5,
        dispute_behavior: 'freeze_affected_payment',
        governing_law: null,
        provenance: [
          { field: 'agreement_id', source: 'Workflow agreement context (AGR-WEB-001)', support: 'supported' },
          { field: 'total_amount', source: '"build website for ₹50,000"', support: 'supported' },
          { field: 'milestones', source: '"₹20,000 after design approval and ₹30,000 on delivery"', support: 'supported' },
          { field: 'review_period_days', source: '"5 days to review each milestone"', support: 'supported' },
          { field: 'dispute_behavior', source: '"freeze the payment until both parties resolve it"', support: 'supported' },
          { field: 'governing_law', source: 'Not supplied in agreement text', support: 'unsupported' },
        ],
      } as any;
      const validation: WorkflowState['validation'] = hasCore ? validateIr(ir) : { status: 'invalid', issues: ['Extraction incomplete: required commercial terms could not be confidently structured from the input. Provide amount, milestones, and review window.'], checkedAt: new Date().toLocaleString() };
      const clauses = buildClausesFromIr(ir, sourceText);
      let nextWorkflow: WorkflowState = {
        ...prev,
        mode: 'demo',
        extraction: { status: (hasCore ? 'success' : 'error') as WorkflowState['extraction']['status'], message: hasCore ? 'Clauses extracted and Contract IR generated (deterministic local demo; no live AI/API).' : 'Extraction could not produce a complete Contract IR.', sourceText },
        ir: hasCore ? ir : prev.ir,
        validation,
        parity: hasCore && validation.status === 'valid' ? runParityCheck(ir, prev.parity.executionParams) : ({ ...prev.parity, status: 'pending', score: 0, mismatches: [], checkedAt: '' } as WorkflowState['parity']),
        approval: { status: 'not_requested', by: '', at: '', note: '' },
        solidity: { generation: { status: 'idle', message: 'No Solidity generated yet.', filename: '', irVersion: '', source: '', metadata: null, supported: [], unsupported: [], security: [], errors: [] }, compilation: { status: 'not_run', ranAt: '', message: 'Compilation not run (no Solidity compiler/tooling detected in this environment).', tool: 'unavailable' }, tests: { status: 'not_run', ranAt: '', summary: 'Automated contract tests not run.', cases: [] } },
        revisions: hasCore && prev.ir ? [...(prev.revisions || []), { id: `rev-${Date.now()}`, at: new Date().toLocaleString(), summary: 'Contract IR regenerated from extracted clauses.', irVersion: ir.version }] : (prev.revisions || []),
        traceability: { clauses: hasCore ? clauses : (prev.traceability?.clauses || []), snapshots: { ...(prev.traceability?.snapshots || {}) }, history: Array.isArray(prev.traceability?.history) ? [...prev.traceability.history] : [] },
        simulation: prev.simulation || null,
      } as WorkflowState;
      nextWorkflow = snapshotTraceability(nextWorkflow, hasCore && prev.ir ? prev.ir.version : null);
      nextWorkflow = ensureIntegrityFields(nextWorkflow as any) as any;
      const actor = { name: 'System', role: 'system' };
      if (hasCore) {
        nextWorkflow = logEvent(nextWorkflow as any, 'clause_extraction', 'Clause extraction completed (deterministic local demo).', actor, { afterHash: hashIr(ir) }) as any;
        nextWorkflow = logEvent(nextWorkflow as any, 'contract_ir_generation', `Contract IR ${ir.version} generated.`, actor, { afterHash: hashIr(ir), details: { irVersion: ir.version } }) as any;
        nextWorkflow = logEvent(nextWorkflow as any, 'validation', `Validation ${validation.status} for IR ${ir.version}.`, actor, { details: { status: validation.status, issues: validation.issues } }) as any;
        nextWorkflow = logEvent(nextWorkflow as any, 'parity_verification', `Parity ${nextWorkflow.parity.status} for IR ${ir.version}.`, actor, { details: { status: nextWorkflow.parity.status, mismatches: nextWorkflow.parity.mismatches } }) as any;
        nextWorkflow = recordVersion(nextWorkflow as any, actor, `IR ${ir.version} created from extraction.`) as any;
      } else {
        nextWorkflow = logEvent(nextWorkflow as any, 'clause_extraction', 'Clause extraction failed: incomplete input.', actor, { details: { status: 'error' } }) as any;
      }
      writeWorkflow(nextWorkflow as any);

      setParsed(hasCore);
      localStorage.setItem('legalx:ai-parsed', 'true'); if(!hasCore) localStorage.setItem('legalx:ai-parsed', 'false');
      if (hasCore) setTampered(nextWorkflow.parity.status === 'mismatched');
      setOperationBusy(false);
      setToast(hasCore ? (validation.status === 'valid' ? 'Extraction, Contract IR, and validation complete (demo/local).' : 'Contract IR generated but validation found issues.') : 'Extraction failed: incomplete input. No fabricated result was created.');
    }, 700);
  };
  const navigate = (next: string) => { if (next.startsWith('/app/') && !canAccessRoute(role, next)) { setToast(`Denied for ${ROLE_LABELS[role]} — no data loaded`); return } onNavigate(next) };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(v => !v); }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return
    const trigger = document.querySelector<HTMLButtonElement>('.sidebar-toggle')
    const sidebar = document.getElementById('workspace-nav')
    const controls = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href], button, select') || []).filter(element => element.getClientRects().length > 0)
    controls()[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
      if (event.key !== 'Tab') return
      const items = controls()
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    const breakpoint = window.matchMedia('(max-width: 900px)')
    const closeOnDesktop = () => { if (!breakpoint.matches) setSidebarOpen(false) }
    breakpoint.addEventListener('change',closeOnDesktop)
    window.addEventListener('keydown',handleKey)
    return () => {
      breakpoint.removeEventListener('change',closeOnDesktop)
      window.removeEventListener('keydown',handleKey)
      trigger?.focus()
    }
  }, [sidebarOpen])
  const paletteActions = [
    ...nav.map(([label, href]) => ({ label, href, group: 'Navigate', keywords: `${label} ${href}` })),
    { label: 'Create agreement', href: '/app/ai-workspace', group: 'Actions', keywords: 'create new agreement draft' },
    { label: 'Open Contract IR', href: '/app/contract-ir', group: 'Actions', keywords: 'ir contract inspector' },
    { label: 'Run parity verification', href: '/app/parity', group: 'Actions', keywords: 'parity verify compare' },
    { label: 'Review & approval', href: '/app/team', group: 'Actions', keywords: 'review approve reject team' },
    { label: 'Profile', href: '/app/profile', group: 'Account', keywords: 'profile identity' },
    { label: 'Settings', href: '/app/settings', group: 'Account', keywords: 'settings preferences theme' },
  ].filter(a => canAccessRoute(role, a.href));
  const paletteResults = paletteActions.filter(a => (a.label + ' ' + a.group + ' ' + a.keywords).toLowerCase().includes(paletteQuery.toLowerCase()));
  return <div className={compact ? "app-shell astra compact" : "app-shell astra"}><a className="workspace-skip" href="#workspace-content">Skip to workspace</a><aside role={sidebarOpen ? "dialog" : undefined} aria-modal={sidebarOpen || undefined} aria-label="Workspace menu" id="workspace-nav" className={sidebarOpen ? 'app-sidebar open' : 'app-sidebar'}><div className="app-brand"><Logo light /><button className="sidebar-close" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><Icon name="x" size={16} /></button></div><RoleSwitcher role={role} onRoleChange={onRoleChange} /><nav aria-label="Workspace navigation">{['Workspace', 'Administration'].map(group => {
    const links = nav.filter(([,href]) => (['/app/settings','/app/notifications','/app/team','/app/profile'].includes(href) ? 'Administration' : 'Workspace') === group)
    return links.length > 0 && <div className="nav-group" key={group}><span>{group}</span>{links.map(([label,href,icon]) => <a key={href+label} href={href} title={label} aria-label={label} aria-current={path === href ? 'page' : undefined} className={path === href ? 'active' : ''} onClick={event => {event.preventDefault(); setSidebarOpen(false); navigate(href)}}><Icon name={icon as IconName} size={17}/><b>{label}</b></a>)}</div>
  })}</nav><div className="sidebar-profile"><div className="avatar">{account.initials}</div><div><b>{account.name}</b><small>{ROLE_LABELS[role]}</small></div><button aria-label="View profile" onClick={() => navigate('/app/profile')}><Icon name="users" size={15} /></button></div></aside>{sidebarOpen && <button className="nav-backdrop" aria-label="Dismiss navigation" onClick={() => setSidebarOpen(false)} />}<div className="app-main" inert={sidebarOpen || undefined}><header className="app-topbar"><button className="desktop-nav-trigger" aria-label={compact ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!compact} aria-controls="workspace-nav" onClick={() => {setCompact(!compact); localStorage.setItem('legalx:compact-nav', String(!compact))}}><Icon name="menu" size={18}/></button><button aria-label="Open navigation" aria-controls="workspace-nav" aria-expanded={sidebarOpen} className="sidebar-toggle" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button><div className="crumb"><span>{account.workspaceName}</span><b>/</b><strong>{currentLabel}</strong></div><div className="app-top-actions"><button className="global-search" aria-label="Open command palette" onClick={() => { setPaletteOpen(true); setPaletteQuery(''); }}><Icon name="search" size={15} /><span>Find a page or action</span><kbd>Ctrl / ⌘ K</kbd></button><ThemeToggle /><button className="top-icon" aria-label="Notifications" onClick={() => navigate('/app/notifications')}><Icon name="bell" size={17} /></button><button className="top-avatar" aria-label="Profile" onClick={() => navigate('/app/profile')}>{account.initials}</button></div></header>{!online && <div className="recovery-banner danger"><Icon name="alert" size={15} /><span><b>You are offline.</b> No live operation is running; local demo changes remain safe.</span></div>}{online && slowNetwork && <div className="recovery-banner"><Icon name="clock" size={15} /><span><b>Slow network mode.</b> Operations remain pending until a confirmation exists; no success is shown.</span></div>}{demoActive && path !== '/demo' && dismissedCheckpoint !== checkpoint && <div className="checkpoint-strip"><Icon name="refresh" size={15} /><span><b>{demoPaused ? 'Guided demo paused here.' : 'Guided demo checkpoint saved.'}</b></span><button onClick={() => onNavigate('/demo')}>Return to Demo Control Center</button><button aria-label="Dismiss checkpoint" onClick={() => setDismissedCheckpoint(checkpoint)}>×</button></div>}<main id="workspace-content" tabIndex={-1} className="workspace-content" data-screen={path.split("/").pop()}><React.Suspense fallback={<p role="status" className="loading-record">Loading workspace…</p>}>{!allowed ? <Unauthorized role={role} path={path} onNavigate={navigate} /> : path === '/app' ? <RoleDashboard role={role} onNavigate={navigate} onRoleChange={onRoleChange} /> : path === '/app/agreements' ? (localStorage.getItem('legalx:backend-session') === 'true' ? <BackendAgreementsList onNavigate={navigate} /> : <Agreements onNavigate={navigate} />) : path === '/app/ai-workspace' ? <AIWorkspace input={input} setInput={setInput} parsed={parsed} operationBusy={operationBusy} onParse={runParse} onNavigate={navigate} /> : path === '/app/contract-ir' ? <ContractIR jsonView={jsonView} setJsonView={setJsonView} onNavigate={navigate} workflow={workflow} role={role} /> : path === '/app/parity' ? <ParityStudio tampered={tampered} setTampered={(v) => { const current = readWorkflow(); const params = { ...current.parity.executionParams, reviewDays: v ? 2 : 5 }; const ir = current.ir; const parity: WorkflowState['parity'] = ir ? runParityCheck(ir, params) : ({ ...current.parity, status: (v ? 'mismatched' : 'matched') as WorkflowState['parity']['status'], score: v ? 74 : 100, mismatches: v ? ['review_period_days'] : [], checkedAt: new Date().toLocaleString(), executionParams: params }); const blockedApproval: WorkflowState['approval'] = { status: 'blocked' as const, by: current.approval.by, at: new Date().toLocaleString(), note: 'Approval blocked due to parity mismatch; re-review and approve after restoration.' }; const next: WorkflowState = { ...current, parity, approval: (v && current.approval.status === 'approved') ? blockedApproval : current.approval }; writeWorkflow(next); setWorkflow(readWorkflow()); setTampered(v); setToast(v ? 'Critical mismatch found — execution blocked (demo/local)' : 'Terms restored — parity matched (demo/local)') }} score={score} onNavigate={navigate} workflow={workflow} role={role} /> : path === '/app/smart-contracts' ? (localStorage.getItem('legalx:backend-session') === 'true' ? <BackendExecution role={role} /> : <SmartContracts role={role} workflow={workflow} />) : path === '/app/milestones' ? <Milestones role={role} /> : path === '/app/transactions' ? <Transactions role={role} /> : path === '/app/activity' ? (localStorage.getItem('legalx:backend-session') === 'true' ? <BackendActivity role={role} /> : <Activity role={role} workflow={workflow} />) : path === '/app/team' ? <Team role={role} onNavigate={navigate} workflow={workflow} /> : path === '/app/notifications' ? <Notifications /> : path === '/app/help' ? <Help /> : path === '/app/settings' ? <Settings role={role} onRoleChange={onRoleChange} /> : path === '/app/profile' ? <Profile role={role} /> : path === '/app/agreements/website-project' ? (localStorage.getItem('legalx:backend-session') === 'true' ? <BackendAgreementDetail onNavigate={navigate} /> : <AgreementDetail role={role} onNavigate={navigate} workflow={workflow} />) : <RoleDashboard role={role} onNavigate={navigate} onRoleChange={onRoleChange} />}</React.Suspense></main>{toast && <div role="status" className={`app-toast ${toast.includes('blocked') || toast.includes('pending') || toast.includes('failed') ? 'error' : ''}`}><span><Icon name={toast.includes('blocked') || toast.includes('pending') || toast.includes('failed') ? 'alert' : 'check'} size={14} /></span>{toast}</div>}{paletteOpen && <SearchDialog onClose={() => setPaletteOpen(false)}><div className="panel" style={{width:'min(720px,92vw)',padding:16}} onClick={e=>e.stopPropagation()}><div className="search-field" style={{maxWidth:'none',marginBottom:10}}><Icon name="search" size={15} /><input autoFocus aria-label="Command palette search" placeholder="Search pages and actions…" value={paletteQuery} onChange={e=>setPaletteQuery(e.target.value)} /></div><div style={{maxHeight:360,overflow:'auto',display:'grid',gap:6}}>{paletteResults.length===0 ? <p className="muted">No matching actions for your role.</p> : paletteResults.map(a => <button key={a.group+a.href+a.label} className="field-row-button" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',border:'1px solid var(--line)',borderRadius:8}} onClick={() => { setPaletteOpen(false); navigate(a.href); }}><span><b>{a.label}</b> <small className="muted">· {a.group}</small></span><Icon name="arrow" size={14} /></button>)}</div><small className="muted">Ctrl/Cmd+K to toggle · Esc to close · Actions respect RBAC</small></div></SearchDialog>}</div></div>
}

function StatCard({ label, value, sub, tone = 'default', icon }: { label: string; value: string; sub: string; tone?: string; icon: IconName }) { return <div className={`stat-card ${tone}`}><span className="stat-icon"><Icon name={icon} size={17} /></span><small>{label}</small><strong>{value}</strong><span>{sub}</span></div> }
function Dashboard({ onNavigate, demoBanner = false }: { onNavigate: (p: string) => void; demoBanner?: boolean }) {
  const w = readWorkflow();
  const audit = getAuditTrail(w as any);
  const auditVerify = verifyAuditTrail(w as any);
  const exec = w.execution;
  const kpis = [
    { label: 'AGREEMENTS', value: '12', sub: '+3 this month', icon: 'file' as IconName, tone: 'default' },
    { label: 'VERIFIED / PARITY', value: w.parity.status === 'matched' ? 'Matched' : '08', sub: w.parity.status === 'matched' ? 'Current IR aligned' : '100% parity ready', icon: 'shield' as IconName, tone: 'success' },
    { label: 'EXECUTION READINESS', value: exec.status === 'ready' ? 'Ready' : 'Blocked', sub: exec.status === 'ready' ? 'All gates satisfied' : 'Gates pending/blocked', icon: 'lock' as IconName, tone: exec.status === 'ready' ? 'success' : 'danger' },
    { label: 'INTEGRITY', value: auditVerify.valid ? 'Verified' : 'Check', sub: `${audit.events.length} audit events`, icon: 'scan' as IconName, tone: auditVerify.valid ? 'success' : 'warning' },
  ];
  const activity = [
    { t: 'Contract IR', d: w.ir ? `IR ${w.ir.version} ${w.validation.status}` : 'No IR generated', s: w.ir ? 'success' : 'warning' },
    { t: 'Parity verification', d: w.parity.status === 'matched' ? 'Matched against execution params' : (w.parity.mismatches?.length ? `Mismatch: ${w.parity.mismatches.join(', ')}` : 'Pending'), s: w.parity.status === 'matched' ? 'success' : 'warning' },
    { t: 'Human approval', d: w.approval.status === 'approved' ? `Approved by ${w.approval.by || 'reviewer'}` : (w.approval.note || 'Approval required'), s: w.approval.status === 'approved' ? 'success' : w.approval.status === 'blocked' ? 'danger' : 'warning' },
    { t: 'Audit trail', d: auditVerify.valid ? 'Hash chain verified (local)' : 'Integrity issues detected', s: auditVerify.valid ? 'success' : 'danger' },
  ];
  return <div className="dashboard-view lx-command-center">
    {demoBanner && <div className="prototype-banner"><Icon name="spark" size={16} /><span><b>You’re exploring the LEGALX demo workspace.</b> Records are seeded and no real funds or transactions are connected.</span><button onClick={() => onNavigate('/sign-up')}>Create a workspace <Icon name="arrow" size={13} /></button></div>}
    <section className="panel lx-hero-panel">
      <div>
        <span className="section-kicker">ANALYTICAL COMMAND CENTRE · DEMO/LOCAL</span>
        <h1>Agreement intelligence, verification, and execution readiness.</h1>
        <p className="muted">A unified view of IR validity, parity, approvals, traceability, drift/version state, and tamper-evident audit integrity. Live workflow indicators reflect current local state; no fabricated backend data.</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}>
          <Button onClick={() => onNavigate('/app/ai-workspace')} icon="spark">Create / extract agreement</Button>
          <Button kind="secondary" onClick={() => onNavigate('/app/contract-ir')} icon="database">Inspect Contract IR</Button>
          <Button kind="secondary" onClick={() => onNavigate('/app/parity')} icon="scan">Parity Studio</Button>
        </div>
      </div>
      <div className="lx-readiness-card">
        <span className="section-kicker">EXECUTION READINESS</span>
        <div className={`lx-readiness-ring ${exec.status === 'ready' ? 'ok' : 'blocked'}`}><strong>{exec.status === 'ready' ? 'READY' : 'GATED'}</strong><small>{w.parity.score || (w.parity.status==='matched'?100:0)}%</small></div>
        <p><b>Status:</b> {exec.status.toUpperCase()}</p>
        <p className="muted">{exec.reason}</p>
        <div style={{display:'grid',gap:6,marginTop:8}}>
          <div className="timeline-row"><span className={`timeline-icon ${w.validation.status==='valid'?'success':'warning'}`}><Icon name="shield" size={14} /></span><div><b>Validation</b><small>{w.validation.status}</small></div></div>
          <div className="timeline-row"><span className={`timeline-icon ${w.parity.status==='matched'?'success':w.parity.status==='pending'?'warning':'danger'}`}><Icon name="scan" size={14} /></span><div><b>Parity</b><small>{w.parity.status}</small></div></div>
          <div className="timeline-row"><span className={`timeline-icon ${w.approval.status==='approved'?'success':w.approval.status==='blocked'?'danger':'warning'}`}><Icon name="check" size={14} /></span><div><b>Approval</b><small>{w.approval.status}</small></div></div>
        </div>
      </div>
    </section>

    <div className="lx-kpi-grid">{kpis.map(k => <div key={k.label} className={`panel stat-card ${k.tone} lx-kpi`}><span className="stat-icon"><Icon name={k.icon} size={17} /></span><small>{k.label}</small><strong>{k.value}</strong><span>{k.sub}</span></div>)}</div>

    <div className="lx-dashboard-grid">
      <section className="panel lx-chart-panel">
        <div className="panel-head"><div><span className="section-kicker">VERIFICATION HEALTH & ACTIVITY</span><h2>Agreement pipeline signals</h2></div><div style={{display:'flex',gap:8}}><Badge tone={w.parity.status==='matched'?'success':'warning'}>Parity {w.parity.status}</Badge><Badge tone={auditVerify.valid?'success':'danger'}>Audit {auditVerify.valid?'verified':'check'}</Badge></div></div>
        <div className="chart" style={{marginTop:16}}>
          <div className="chart-labels"><span>12</span><span>8</span><span>4</span><span>0</span></div>
          <div className="chart-area">
            <div className="chart-grid" />
            <svg viewBox="0 0 600 170" preserveAspectRatio="none" aria-label="Verification trend chart">
              <defs><linearGradient id="chartfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--gold)" stopOpacity=".28" /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" /></linearGradient></defs>
              <path d="M0 145 C55 135 70 125 105 131 S160 116 190 122 S235 92 275 105 S330 72 365 88 S415 54 445 70 S500 45 530 57 S570 22 600 30 V170 H0Z" fill="url(#chartfill)" />
              <path d="M0 145 C55 135 70 125 105 131 S160 116 190 122 S235 92 275 105 S330 72 365 88 S415 54 445 70 S500 45 530 57 S570 22 600 30" fill="none" stroke="var(--gold)" strokeWidth="3" />
              <path d="M0 150 C80 148 120 140 170 142 S260 136 320 128 S420 120 470 112 S540 108 600 100" fill="none" stroke="var(--forest)" strokeWidth="2" strokeDasharray="6 6" opacity=".8" />
            </svg>
            <div className="chart-x"><span>Oct 10</span><span>Oct 17</span><span>Oct 24</span><span>Oct 31</span><span>Nov 06</span></div>
          </div>
        </div>
        <div className="chart-legend"><span><i style={{background:'var(--gold)'}} /> Verified/ready trend</span><span><i style={{background:'var(--forest)'}} /> Stable integrity baseline</span><span className="muted">Seeded analytics view (demo) with live gate indicators</span></div>
      </section>

      <aside className="panel lx-timeline-panel">
        <div className="panel-head"><div><span className="section-kicker">ACTIVITY & INTEGRITY TIMELINE</span><h2>Recent signals</h2></div><Button kind="secondary" onClick={() => onNavigate('/app/activity')} icon="arrow">Open log</Button></div>
        <div className="activity-log">{activity.map((a,i)=><div className="activity-row" key={i}><span className={`timeline-icon ${a.s}`}><Icon name={a.s==='success'?'check':a.s==='danger'?'alert':'clock'} size={15} /></span><div><b>{a.t}</b><p>{a.d}</p><small>Local workflow state</small></div><Badge tone={a.s as any}>{a.s}</Badge></div>)}</div>
        <div className="panel" style={{marginTop:10, background:'var(--surface2)'}}><b>Pending approvals / gates</b><p className="muted" style={{marginTop:6}}>{exec.status==='ready' ? 'No blocking gates. Execution readiness satisfied (demo/local).' : exec.reason}</p></div>
      </aside>
    </div>

    <div className="lower-grid lx-lower-grid">
      <section className="panel table-panel">
        <div className="panel-head"><div><span className="section-kicker">RECENT AGREEMENTS</span><h2>Workspaces worth a look</h2></div><button className="text-link" onClick={() => onNavigate('/app/agreements')}>View all <Icon name="arrow" size={13} /></button></div>
        <AgreementRows onNavigate={onNavigate} />
      </section>
      <section className="panel deadline-panel">
        <div className="panel-head"><div><span className="section-kicker">UPCOMING & QUICK ACTIONS</span><h2>Priorities</h2></div><Icon name="calendar" size={18} /></div>
        <div className="deadline"><span className="deadline-date">12<br /><small>NOV</small></span><div><b>Website project</b><small>Design review window closes</small></div><Badge tone="warning">5 days</Badge></div>
        <div className="deadline"><span className="deadline-date">18<br /><small>NOV</small></span><div><b>Brand retainer</b><small>Milestone 02 acceptance</small></div><Badge tone="neutral">11 days</Badge></div>
        <div className="quick-actions" style={{marginTop:12}}><button onClick={() => onNavigate('/app/team')}><span><Icon name="users" size={17} /></span><b>Review & approve</b><small>Human approval gate</small><Icon name="arrow" size={15} /></button><button onClick={() => onNavigate('/app/smart-contracts')}><span><Icon name="code" size={17} /></span><b>Solidity & tests</b><small>Generation readiness</small><Icon name="arrow" size={15} /></button></div>
      </section>
    </div>
  </div>;
}



function AgreementRows({ onNavigate }: { onNavigate: (p: string) => void }) { return <div className="agreement-rows">{[['Website project', 'Freelance · ₹50,000', 'Verified', 'success'], ['Brand retainer', 'Agency · ₹1,20,000', 'Ready for review', 'warning'], ['Mobile app build', 'Startup · ₹2,40,000', 'Needs clarification', 'danger'], ['Legal advisory', 'Business · ₹75,000', 'Draft', 'neutral']].map(([name, meta, status, tone]) => <button key={name} onClick={() => onNavigate(name === 'Website project' ? '/app/agreements/website-project' : '/app/agreements')}><span className="row-file"><Icon name="file" size={15} /></span><span className="row-main"><b>{name}</b><small>{meta}</small></span><Badge tone={tone as 'success' | 'warning' | 'danger' | 'neutral'}>{status}</Badge><span className="row-date">Nov 06 <Icon name="chevron" size={14} /></span></button>)}</div> }

function Agreements({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('updated');
  const [statusFilter, setStatusFilter] = useState('All');
  const [partyFilter, setPartyFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem('legalx:preview-id') || 'website-project');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadState, setUploadState] = useState<'idle'|'selected'|'validating'|'uploading'|'processing'|'success'|'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const agreements = demoAgreements;
  const statuses = ['All', ...Array.from(new Set(agreements.map(a => a.status)))];
  const parties = ['All', ...Array.from(new Set(agreements.flatMap(a => [a.party, a.counterparty])))];
  const types = ['All', ...Array.from(new Set(agreements.map(a => a.agreementType)))];
  const filtered = agreements.filter(a => {
    const q = query.toLowerCase();
    const matchesQ = !q || [a.title, a.status, a.party, a.counterparty, a.agreementType, a.amount, a.summary].join(' ').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'All' || a.status === statusFilter;
    const matchesParty = partyFilter === 'All' || a.party === partyFilter || a.counterparty === partyFilter;
    const matchesType = typeFilter === 'All' || a.agreementType === typeFilter;
    const matchesFrom = !dateFrom || a.updatedAt >= dateFrom;
    const matchesTo = !dateTo || a.updatedAt <= dateTo;
    return matchesQ && matchesStatus && matchesParty && matchesType && matchesFrom && matchesTo;
  }).sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt));
  const selected = filtered.find(a => a.id === selectedId) || filtered[0];
  const resetUpload = () => { setUploadState('idle'); setUploadProgress(0); setUploadError(''); setSelectedFile(null); };
  const onFileChange = (file: File | null) => { resetUpload(); if (!file) return; setSelectedFile(file); setUploadState('selected'); };
  const startUpload = async () => {
    if (!selectedFile) { setUploadError('Select a document before uploading.'); setUploadState('error'); return; }
    const allowed = ['.pdf','.doc','.docx','.txt'];
    const name = selectedFile.name.toLowerCase();
    const okType = allowed.some(ext => name.endsWith(ext));
    const maxBytes = 10 * 1024 * 1024;
    setUploadState('validating'); setUploadError(''); setUploadProgress(5);
    await new Promise(r => setTimeout(r, 250));
    if (!okType) { setUploadError('Unsupported file type. Use PDF, DOC, DOCX, or TXT.'); setUploadState('error'); return; }
    if (selectedFile.size > maxBytes) { setUploadError('File is too large for this demo upload flow (max 10 MB).'); setUploadState('error'); return; }
    setUploadState('uploading'); setUploadProgress(20);
    for (const p of [35, 55, 75, 90]) { await new Promise(r => setTimeout(r, 180)); setUploadProgress(p); }
    setUploadState('processing'); setUploadProgress(96);
    await new Promise(r => setTimeout(r, 300));
    setUploadProgress(100); setUploadState('success');
    window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Document upload UI flow completed locally (demo). Backend processing will connect when /api/v1 upload contracts are available.' }));
  };
  const openAgreement = (a: Agreement) => onNavigate(a.id === 'website-project' ? '/app/agreements/website-project' : '/app/ai-workspace');
  return <div className="lx-editorial-library">
    <PageHeader eyebrow="Sample register" title="Agreement library" desc="Select an agreement to inspect its parties, terms and review status." action="Create agreement" onAction={() => onNavigate('/app/ai-workspace')} />
    <div className="lx-library-toolbar panel">
      <div className="search-field" style={{maxWidth:420}}><Icon name="search" size={15} /><input aria-label="Search agreements" placeholder="Search title, party, status, type, amount" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <label className="record-sort">Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">Last updated</option><option value="title">Title A–Z</option></select></label><details className="library-filters"><summary>Filter agreements</summary><div><label>Status <select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Party <select aria-label="Filter by party" value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>{parties.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Type <select aria-label="Filter by agreement type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>{types.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>From <input aria-label="Filter date from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
      <label>To <input aria-label="Filter date to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label></div></details>
      <Button kind="secondary" icon="plus" onClick={() => setShowUpload(v => !v)}>{showUpload ? 'Hide upload' : 'Upload document'}</Button>
    </div>
    {showUpload && <div className="panel" style={{marginTop:12}}>
      <div className="panel-head"><div><span className="section-kicker">DOCUMENT INTAKE</span><h2>Upload, validate, process</h2></div><Badge tone={uploadState==='success'?'success':uploadState==='error'?'danger':'warning'}>{uploadState}</Badge></div>
      <p className="muted">Choose a PDF, Word or text file to try the local intake workflow.</p>
      <div style={{display:'grid',gap:8,maxWidth:760}}>
        <input aria-label="Choose agreement document" type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => onFileChange(e.target.files?.[0] || null)} />
        {selectedFile && <div className="field-inspector"><b>Selected:</b> {selectedFile.name} <small>({Math.ceil(selectedFile.size/1024)} KB)</small></div>}
        {(uploadState==='validating' || uploadState==='uploading' || uploadState==='processing' || uploadState==='success') && <div><div className="lx-progress"><div style={{width:`${uploadProgress}%`}} /></div><small>{uploadProgress}% · {uploadState === 'processing' ? 'Processing (demo state)' : uploadState}</small></div>}
        {uploadState==='error' && <div className="inline-error"><Icon name="alert" size={14} /><span><b>Upload/validation failed.</b><small>{uploadError}</small></span></div>}
        {uploadState==='success' && <div className="prototype-banner"><Icon name="check" size={16} /><span><b>Upload flow completed (local demo).</b> Ready for backend processing when available.</span></div>}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button onClick={startUpload} icon="plus" className={uploadState==='uploading'||uploadState==='processing'||uploadState==='validating'?'disabled':''}>Start upload</Button><Button kind="secondary" onClick={resetUpload} icon="refresh">Reset / retry</Button></div>
      </div>
    </div>}
    <div className="lx-library-grid">
      <section className="panel lx-library-list" id="agreement-register" tabIndex={-1}>
        <div className="panel-head"><div><span className="section-kicker">DOCUMENTS</span><h2>{filtered.length} {filtered.length === 1 ? "agreement" : "agreements"}</h2></div></div>
        {filtered.length === 0 ? <div className="panel" style={{marginTop:12}}><p><b>No agreements match the current filters.</b></p><p className="muted">Adjust search, status, party, date range, or agreement type.</p></div> : <div className="management-list">{filtered.map((a, i) => <button className={`management-row lx-doc-row ${selected?.id===a.id?'selected':''}`} key={a.id} aria-pressed={selected?.id === a.id} onClick={() => { setSelectedId(a.id); if (window.matchMedia("(max-width:800px)").matches) document.getElementById("agreement-preview")?.focus() }}><span className={`agreement-thumb t${i % 4}`}><Icon name={a.status.includes('Mismatch') ? 'alert' : 'file'} size={19} /></span><span className="management-copy"><b>{a.title}</b><small>{a.agreementType} · {a.updatedAt}</small></span><Badge tone={a.status === 'Verified' ? 'success' : a.status === 'Mismatch detected' ? 'danger' : a.status === 'Ready for review' ? 'warning' : 'neutral'}>{a.status}</Badge></button>)}</div>}
      </section>
      <aside className="panel lx-preview-panel" id="agreement-preview" tabIndex={-1}>
        {selected ? <>
          <button className="return-register" onClick={() => document.getElementById("agreement-register")?.focus()}>Back to agreements</button>
          <div className="matter-sheet"><header><span>{selected.source === 'demo' ? 'Sample agreement' : 'Agreement'}</span><Icon name="file" size={20}/></header>
            <h2>{selected.title}</h2><p>{selected.summary}</p>
            <Badge tone={selected.status === 'Verified' ? 'success' : selected.status === 'Mismatch detected' ? 'danger' : 'neutral'}>{selected.status}</Badge>
          </div>
          <dl className="record-facts">{[['Party',selected.party],['Counterparty',selected.counterparty],['Contract value',selected.amount],['Agreement type',selected.agreementType],['Last updated',selected.updatedAt]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><Button onClick={() => openAgreement(selected)} icon="arrow">Open workflow</Button><Button kind="secondary" onClick={() => onNavigate('/app/agreements/website-project')} icon="file">Website project dossier</Button></div>
        </> : <p className="muted">Select an agreement to preview metadata.</p>}
      </aside>
    </div>
  </div>;
}



function AIWorkspace({ input, setInput, parsed, operationBusy, onParse, onNavigate, workflow }: { input: string; setInput: (x: string) => void; parsed: boolean; operationBusy: boolean; onParse: () => void; onNavigate: (p: string) => void; workflow?: WorkflowState }) {
  const w = workflow || readWorkflow();
  const extraction = w.extraction || { status: 'idle', message: '', sourceText: input };
  const isLoading = extraction.status === 'loading' || operationBusy;
  const isError = extraction.status === 'error';
  const isSuccess = extraction.status === 'success' && !!w.ir;
  return <div><PageHeader eyebrow="AI AGREEMENT WORKSPACE · DEMO/LOCAL MODE" title="Agreement intake" desc="Describe the deal in English or Hinglish. LEGALX extracts clauses locally (deterministic demo; no live AI/API) and structures them into Contract IR." />
    <div className="ai-layout"><section className="ai-composer panel"><div className="stepper"><span className={input.trim() ? 'done' : 'current'}>01 <b>Describe</b></span><span className={isSuccess ? 'done' : (isLoading ? 'current' : '')}>02 <b>Structure</b></span><span className={w.validation.status === 'valid' ? 'done' : ''}>03 <b>Review</b></span></div>
      <label className="large-label">Agreement text <small>English + Hinglish supported</small><textarea value={input} onChange={(e) => setInput(e.target.value)} /></label>
      <div className="composer-foot"><span><Icon name="lock" size={13} /> Drafts stay in your workspace</span><Button onClick={onParse} icon="spark" className={isLoading ? 'disabled' : ''}>{isLoading ? 'Extracting…' : isSuccess ? 'Re-run extraction' : 'Extract terms'}</Button></div>
      {extraction.message ? <div className={isError ? 'inline-error' : 'clarify-box'}><span className="clarify-icon"><Icon name={isError ? 'alert' : 'check'} size={16} /></span><div><b>{isError ? 'Extraction issue' : 'Workflow status'}</b><p>{extraction.message}</p><small>Demo/local deterministic processing · no fabricated external service response</small></div></div> : <div className="clarify-box"><span className="clarify-icon"><Icon name="alert" size={16} /></span><div><b>Clarification layer</b><p>In a live workspace, missing details would be requested instead of invented. This demo uses deterministic local extraction.</p><small>Demo scenario · deterministic output · not live AI</small></div></div>}
    </section>
    <aside className="ai-side"><div className="panel extraction-card"><div className="panel-head"><div><span className="section-kicker">EXTRACTION RESULT</span><h2>{isLoading ? 'Processing…' : isError ? 'Needs input' : isSuccess ? 'Ready for review' : 'Waiting for input'}</h2></div><Badge tone={isLoading ? 'warning' : isError ? 'danger' : isSuccess ? 'success' : 'neutral'}>{isLoading ? 'loading' : isError ? 'error' : isSuccess ? 'success' : 'idle'}</Badge></div>
      {isLoading && <p className="muted">Extracting clauses and generating Contract IR locally…</p>}
      {isError && <p className="muted">Extraction did not complete. Fix the input and try again. No result was fabricated.</p>}
      {!isLoading && !isSuccess && !isError && <p className="muted">Run extraction to produce structured clause data and Contract IR.</p>}
      {isSuccess && w.ir && <dl className="extracted-fields"><div><dt>AGREEMENT TYPE</dt><dd>{w.ir.agreement_type.replace(/_/g, ' ')}</dd></div><div><dt>CURRENCY</dt><dd>{w.ir.currency} · ₹{w.ir.total_amount.toLocaleString('en-IN')}</dd></div><div><dt>REVIEW WINDOW</dt><dd>{w.ir.review_period_days} calendar days</dd></div><div><dt>DISPUTE BEHAVIOR</dt><dd>{w.ir.dispute_behavior.replace(/_/g, ' ')}</dd></div></dl>}
    </div>
    <div className="panel source-card"><div className="panel-head"><div><span className="section-kicker">SOURCE-GROUNDED</span><h2>Terms we can point to</h2></div><Icon name="link" size={17} /></div>{isSuccess && w.ir ? <><p>{(w.ir.provenance.find(p=>p.field==='milestones')||{}).source || 'Milestone terms preserved from input.'}</p><div className="source-chip"><Icon name="check" size={13} /> {w.ir.provenance.filter(p=>p.support==='supported').length} supported fields with evidence</div></> : <p className="muted">Evidence references will appear after successful extraction.</p>}</div></aside></div>
    {isSuccess && <div className="next-step"><div><Icon name="database" size={18} /><span><b>Contract IR {w.ir?.version || ''} is ready</b><small>Validation: {w.validation.status}{w.validation.issues.length ? (' · ' + w.validation.issues[0]) : ''}. Inspect before parity.</small></span></div><Button onClick={() => onNavigate('/app/contract-ir')} icon="arrow">Open Contract IR</Button></div>}
  </div>;
}
function ParityStudio({ tampered, setTampered, score, onNavigate, workflow, role = 'owner' }: { tampered: boolean; setTampered: (x: boolean) => void; score: number; onNavigate: (path: string) => void; workflow?: WorkflowState; role?: Role }) {
  const w = workflow || readWorkflow();
  const ir = w.ir as any; const parity = w.parity; const validation = w.validation;
  const [lastRun, setLastRun] = useState(parity.checkedAt || 'Not run in this session');
  const blocked = !ir || validation.status !== 'valid' || parity.status === 'mismatched' || parity.status === 'blocked';
  const matched = parity.status === 'matched' && !tampered;
  const canRun = !!ir && validation.status === 'valid';
  const [backendResult, setBackendResult] = useState<any>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const liveMode = typeof window !== 'undefined' && localStorage.getItem('legalx:backend-session') === 'true'
  // LIVE BACKEND MODE ONLY: the bounded backend schema accepts two legal terms
  // as executor clarifications. All commercial terms (money, milestones,
  // parties, review window) remain derived server-side from stored rows.
  const [activeAgreementId, setActiveAgreementId] = useState(() => (typeof window === 'undefined' ? '' : localStorage.getItem('legalx:active-agreement') || ''))
  const [csrfToken, setCsrfToken] = useState(() => (typeof window === 'undefined' ? '' : localStorage.getItem('legalx:csrf') || ''))
  const [disputeBehavior, setDisputeBehavior] = useState('mediate')
  const [governingLaw, setGoverningLaw] = useState('India')
  const [passport, setPassport] = useState<any>(null)
  const [passportError, setPassportError] = useState('')
  const [passportLoading, setPassportLoading] = useState(false)
  const LIVE_PARITY_KEY = 'legalx:live-parity'
  useEffect(() => {
    if (!liveMode) return
    // Restore only a recorded backend result bound to the agreement still active.
    try {
      const saved = JSON.parse(localStorage.getItem(LIVE_PARITY_KEY) || 'null')
      if (saved && saved.result && saved.agreementId === localStorage.getItem('legalx:active-agreement')) {
        setBackendResult(saved.result)
        setDisputeBehavior(saved.disputeBehavior || 'mediate')
        setGoverningLaw(saved.governingLaw || 'India')
        setPassport(saved.passport || null)
        setLastRun(saved.at ? new Date(saved.at).toLocaleString() : 'Last recorded live result')
      }
    } catch { /* malformed local evidence is ignored; no result is invented */ }
  }, [liveMode])
  const liveCanRun = !!activeAgreementId && !!csrfToken && !!disputeBehavior && !!governingLaw
  const runVerification = () => {
    if (!canRun || !ir) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Validation must pass before parity verification.' })); return; }
    const mismatches: string[] = [];
    if (ir.total_amount !== parity.executionParams.total) mismatches.push('total_amount');
    if (JSON.stringify(ir.milestones.map((m:any)=>m.amount)) !== JSON.stringify(parity.executionParams.milestones)) mismatches.push('milestones');
    if (ir.review_period_days !== parity.executionParams.reviewDays) mismatches.push('review_period_days');
    if ((ir.dispute_behavior === 'freeze_affected_payment') !== parity.executionParams.disputeFreeze) mismatches.push('dispute_behavior');
    const result: WorkflowState['parity'] = { status: (mismatches.length ? 'mismatched' : 'matched') as WorkflowState['parity']['status'], score: mismatches.length ? 74 : 100, mismatches, checkedAt: new Date().toLocaleString(), executionParams: parity.executionParams };
    const current = readWorkflow();
    const blockedApproval: WorkflowState['approval'] = { status: 'blocked', by: current.approval.by, at: new Date().toLocaleString(), note: 'Approval blocked due to parity mismatch.' };
    let nextState: any = { ...current, parity: result, approval: (result.status==='mismatched' && current.approval.status==='approved') ? blockedApproval : current.approval };
    nextState = ensureIntegrityFields(nextState) as any;
    nextState = logEvent(nextState, 'parity_verification', `Parity ${result.status} for IR ${ir?.version || ''} (mismatches: ${result.mismatches.join(', ') || 'none'}).`, { name: 'System', role: role || 'system' }, { details: { status: result.status, mismatches: result.mismatches, score: result.score } });
    writeWorkflow(nextState); setLastRun(result.checkedAt); setTampered(result.status==='mismatched');
    window.dispatchEvent(new CustomEvent('legalx:notice', { detail: result.status==='mismatched' ? 'Verification completed: mismatch blocks execution.' : 'Verification confirmed: supported fields match the Contract IR.' }));
  };
  const runBackendVerification = async () => {
    if (!liveCanRun) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Select a backend agreement and complete the executor clarifications before verification.' })); return; }
    const agreementId = activeAgreementId || localStorage.getItem('legalx:active-agreement') || ''
    const csrfValue = csrfToken || localStorage.getItem('legalx:csrf') || ''
    const version = parseInt(String(ir?.version || 'v1').replace(/[^0-9]/g, ''), 10) || 1
    // Exactly two executor clarifications. No commercial field is ever sent;
    // the backend derives every agreed term from its own stored agreement rows.
    const executionParameters = { dispute_behavior: disputeBehavior, governing_law: governingLaw }
    setVerifying(true); setVerifyError(''); setBackendResult(null); setPassport(null); setPassportError('')
    try {
      const env: any = await parityApi.verify(agreementId, version, executionParameters, csrfValue)
      if (!env.ok) { setVerifyError((env.error && env.error.message) || 'Backend verification failed. No result was recorded.'); return }
      setBackendResult(env.data)
      setLastRun(new Date().toLocaleString())
      const recordedAt = new Date().toISOString()
      try { localStorage.setItem(LIVE_PARITY_KEY, JSON.stringify({ agreementId, version, disputeBehavior, governingLaw, result: env.data, at: recordedAt })) } catch { /* best effort */ }
      // Evidence summary only: a failed passport read never invalidates the
      // authoritative verification result above.
      setPassportLoading(true)
      try {
        const pe: any = await parityApi.trustPassport(agreementId, version, csrfValue)
        if (pe.ok) {
          setPassport(pe.data)
          try {
            const saved = JSON.parse(localStorage.getItem(LIVE_PARITY_KEY) || 'null')
            if (saved) { saved.passport = pe.data; localStorage.setItem(LIVE_PARITY_KEY, JSON.stringify(saved)) }
          } catch { /* best effort */ }
        } else setPassportError((pe.error && pe.error.message) || 'Trust passport unavailable; no evidence was recorded.')
      } catch (err: any) {
        setPassportError(err?.message || 'Trust passport could not be reached.')
      } finally { setPassportLoading(false) }
    } catch (err: any) {
      setVerifyError(err?.message || 'Backend verification could not be reached. No result was recorded.')
    } finally {
      setVerifying(false)
    }
  }
  const rows = [
    { id:'total_amount', label:'Total amount', ir: ir ? `₹${Number(ir.total_amount||0).toLocaleString('en-IN')}` : '—', exec: `₹${Number(parity.executionParams.total||0).toLocaleString('en-IN')}`, ok: !parity.mismatches.includes('total_amount') },
    { id:'milestones', label:'Milestone amounts', ir: ir ? (ir.milestones||[]).map((m:any)=>m.amount).join(' + ') : '—', exec: parity.executionParams.milestones.join(' + '), ok: !parity.mismatches.includes('milestones') },
    { id:'review_period_days', label:'Review window', ir: ir ? `${ir.review_period_days} days` : '—', exec: `${parity.executionParams.reviewDays} days`, ok: !parity.mismatches.includes('review_period_days') },
    { id:'dispute_behavior', label:'Dispute freeze', ir: ir ? ir.dispute_behavior : '—', exec: String(parity.executionParams.disputeFreeze), ok: !parity.mismatches.includes('dispute_behavior') },
  ];
  const blocking = (((parity as any).blockingReasons && (parity as any).blockingReasons.length) ? (parity as any).blockingReasons : parity.mismatches.map(m=>`Mismatch blocks execution: ${m}`));
  const backendFields: any[] = Array.isArray(backendResult?.result?.field_results) ? backendResult.result.field_results : []
  const hasLiveResult = liveMode && !!backendResult
  const backendMatched = hasLiveResult && !backendResult.stale && backendResult.result?.overall_status === 'match' && !backendResult.result?.is_blocked
  const backendBlocked = hasLiveResult && (!!backendResult.result?.is_blocked || !!backendResult.stale || ['blocked','invalid_input','stale'].includes(String(backendResult.result?.overall_status)))
  const backendScore = backendFields.length ? Math.round(backendFields.filter((f: any) => f.status === 'ok').length * 100 / backendFields.length) : null
  const backendStatus = hasLiveResult ? (backendResult.stale ? 'stale' : String(backendResult.result?.overall_status || 'blocked')) : 'pending'
  const shownMatched = liveMode ? backendMatched : matched
  const shownBlocked = liveMode ? (hasLiveResult ? backendBlocked : true) : blocked
  const statusLabel = liveMode ? backendStatus : parity.status
  const displayedScore = liveMode ? (hasLiveResult ? backendScore : null) : (parity.score ?? score)
  const backendRows = backendFields.map((f: any) => ({ id: String(f.field || ''), label: String(f.field || '').replace(/_/g, ' '), ir: f.expected == null ? '—' : String(f.expected), exec: f.actual == null ? '—' : String(f.actual), ok: f.status === 'ok' }))
  const shownRows = liveMode ? (hasLiveResult ? backendRows : []) : rows
  const liveBlocking: string[] = backendFields.filter((f: any) => f.status === 'blocking').map((f: any) => String(f.error || (f.field + ' does not match.')))
  if (hasLiveResult) {
    if (backendResult.stale) liveBlocking.push('Backend result is stale; run verification again.')
    if (backendResult.result?.message && backendBlocked) liveBlocking.push(String(backendResult.result.message))
  }
  const shownBlocking = liveMode ? (hasLiveResult ? liveBlocking : []) : blocking
  return <div className="lx-parity-studio">
    <PageHeader eyebrow="PARITY STUDIO · COMPARISON WORKSPACE" title="Parity comparison" desc="Compare written terms with execution parameters and inspect the reasons a review is blocked." action={tampered ? 'Restore terms' : 'Simulate tamper'} onAction={() => setTampered(!tampered)} />
    {!liveMode && !ir && <div className="panel"><p>No Contract IR available for parity verification.</p><Button onClick={() => onNavigate('/app/ai-workspace')} icon="spark">Generate IR</Button></div>}
    {liveMode && <div className="panel" style={{marginTop:12}} data-testid="parity-clarifications">
      <span className="section-kicker">EXECUTOR CLARIFICATIONS · LIVE BACKEND</span>
      <p className="muted">You choose only these two legal terms for the backend comparison. The backend is authoritative for all amounts, milestones, parties and review terms; these choices cannot alter them.</p>
      <div className="form-grid">
        <label>Dispute handling<select aria-label="Dispute handling" value={disputeBehavior} onChange={e => setDisputeBehavior(e.target.value)}>
          <option value="freeze_affected_payment">freeze_affected_payment</option>
          <option value="mediate">mediate</option>
          <option value="arbitrate">arbitrate</option>
        </select></label>
        <label>Governing law<select aria-label="Governing law" value={governingLaw} onChange={e => setGoverningLaw(e.target.value)}>
          <option value="India">India</option>
          <option value="United Kingdom">United Kingdom</option>
          <option value="United States">United States</option>
          <option value="Australia">Australia</option>
        </select></label>
      </div>
      <p className="muted">Active agreement: <code>{activeAgreementId || 'none selected'}</code></p>
    </div>}
    <div className="panel lx-ready-strip">
      <div><span className="section-kicker">PARITY SCORE</span><h2 data-testid="parity-score" style={{margin:'4px 0'}}>{ir || liveMode ? (displayedScore == null ? 'Pending' : displayedScore + "%") : "Pending"}</h2><Badge testId="parity-status" tone={shownMatched?'success':shownBlocked?'danger':'warning'}>{statusLabel}</Badge></div>
      <div><span className="section-kicker">VALIDATION</span><h3 style={{margin:'6px 0'}}>{validation.status}</h3><p className="muted">{validation.issues?.[0] || 'IR checks state'}</p></div>
      <div><span className="section-kicker">APPROVAL</span><h3 style={{margin:'6px 0'}}>{w.approval.status}</h3><p className="muted">Human approval required</p></div>
      <div><span className="section-kicker">EXECUTION</span><h3 style={{margin:'6px 0'}}>{w.execution.status}</h3><p className="muted">{shownBlocked || !shownMatched ? 'Blocked until gates pass' : 'Ready when all gates satisfied'}</p></div>
    </div>
    {liveMode && verifying && <div role="status" className="panel muted">Running backend parity verification…</div>}
    {liveMode && verifyError && <div role="alert" className="inline-error">{verifyError}</div>}

    {(shownBlocking.length>0 || !shownMatched || hasLiveResult) && <div data-testid="parity-blocking" data-blocked={hasLiveResult ? String(!!backendBlocked) : undefined} className="panel" style={{marginTop:12,borderColor:'color-mix(in srgb,var(--danger) 35%, var(--line))'}}><span className="section-kicker">BLOCKING REASONS / MISMATCHES</span><ul style={{margin:'6px 0 0 18px'}}>{(shownBlocking.length?shownBlocking:(hasLiveResult ? ['No blocking conditions reported by the backend.'] : ['Prerequisites not satisfied for execution readiness.'])).map((r:string,i:number)=><li key={i}>{r}</li>)}</ul><p className="muted">Backend parity decisions are authoritative when integrated; frontend does not override or independently calculate backend outcomes.</p></div>}
    <section className="comparison-sheet panel">
      <header className="comparison-heading"><div><span className="section-kicker">Review ledger</span><h2>Field comparison</h2></div><span>{shownRows.length} fields</span></header>
      <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Agreement and execution values">
        <table><thead><tr><th scope="col">Agreement field</th><th scope="col">Contract IR {ir?.version}</th><th scope="col">Execution parameter</th><th scope="col">Result</th></tr></thead>
          <tbody>{shownRows.map(row => <tr data-testid="parity-field-row" data-field={row.id} key={row.id} className={ir && !row.ok ? 'mismatch' : ''}><th scope="row">{row.label}<code>{row.id}</code></th><td>{row.ir}</td><td>{row.exec}</td><td><Badge tone={(liveMode ? !hasLiveResult : !ir) ? 'neutral' : row.ok ? 'success' : 'danger'}>{(liveMode ? !hasLiveResult : !ir) ? 'Awaiting IR' : row.ok ? 'Match' : 'Mismatch'}</Badge></td></tr>)}</tbody>
        </table>
      </div>
    </section>

    <div className="panel verification-next" style={{marginTop:14, display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center'}}>
      <div><span className="section-kicker">VERIFICATION ACTIONS</span><p className="muted" style={{marginTop:6}}>{lastRun} · {shownMatched ? 'Supported fields match validated IR.' : 'Resolve mismatches/validation issues before approval and execution.'}{hasLiveResult ? ' Backend check flag: ' + (backendResult.passed ? 'passed' : 'not passed') + ' (informational only; execution remains gated).' : ''}</p></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button testId="parity-run-button" onClick={liveMode ? runBackendVerification : runVerification} icon="scan" className={!(liveMode ? liveCanRun : canRun)?'disabled':''}>Run verification</Button><Button kind="secondary" onClick={()=>onNavigate('/app/contract-ir')} icon="database">Inspect IR</Button><Button kind="secondary" onClick={()=>onNavigate('/app/team')} icon="users">Open team review</Button></div>
    </div>

    {liveMode && (passportLoading || passport || passportError) && <section className="panel" style={{marginTop:12}} data-testid="parity-passport">
      <div className="panel-head"><div><span className="section-kicker">TRUST PASSPORT · EVIDENCE SUMMARY</span><h2>Backend verification evidence</h2></div><Badge tone={passport?.stale ? 'warning' : passport ? 'success' : 'neutral'}>{passport?.stale ? 'stale' : passport ? 'recorded' : 'unavailable'}</Badge></div>
      {passportLoading && <p className="muted">Loading evidence from the backend trust-passport endpoint…</p>}
      {passportError && <p role="alert" className="inline-error">{passportError}</p>}
      {passport && <>
        <p className="muted">Read-only evidence from the backend endpoint. This is an evidence summary, not a legal certification and not a tamper-proof guarantee.</p>
        <dl className="extracted-fields">
          <div><dt>AGREEMENT VERSION</dt><dd>{String(passport.version ?? '—')}</dd></div>
          <div><dt>OVERALL STATUS</dt><dd>{String(passport.overall_status ?? '—')}{passport.stale ? ' (stale)' : ''}</dd></div>
          <div><dt>IS BLOCKED</dt><dd>{String(!!passport.is_blocked)}</dd></div>
          <div><dt>APPROVALS COMPLETE</dt><dd>{String(!!passport.approvals_complete)}</dd></div>
          <div><dt>VERIFIED AT</dt><dd>{String(passport.verified_at ?? '—')}</dd></div>
          <div><dt>APPROVED IR HASH</dt><dd><code>{String(passport.approved_ir_hash ?? '—')}</code></dd></div>
          <div><dt>EXECUTION PARAMS HASH</dt><dd><code>{String(passport.execution_params_hash ?? '—')}</code></dd></div>
          <div><dt>RULESET VERSION</dt><dd>{String(passport.parity_rules_version ?? '—')} · canonicalization {String(passport.canonicalization_version ?? '—')}</dd></div>
        </dl>
        <p><b>Findings ({Array.isArray(passport.field_results) ? passport.field_results.length : 0})</b></p>
        <ul style={{margin:'6px 0 0 18px'}}>{(Array.isArray(passport.field_results) ? passport.field_results : []).map((f:any,i:number)=><li key={i}><code>{String(f.field||'')}</code> · {String(f.status||'')}{f.error || f.reason ? ' · ' + String(f.error || f.reason) : ''}</li>)}</ul>
      </>}
    </section>}

    {Array.isArray((parity as any).history) && (parity as any).history.length > 0 && <div className="panel" style={{marginTop:12}}><span className="section-kicker">PARITY HISTORY (BACKEND-READY)</span><div className="activity-log">{(parity as any).history.map((h:any,i:number)=><div className="activity-row" key={i}><span className="timeline-icon neutral"><Icon name="scan" size={15} /></span><div><b>{h.status || 'run'}</b><p>{h.summary || ''}</p><small>Score: {h.score ?? '—'}</small></div><time>{h.at || ''}</time></div>)}</div></div>}
  </div>;
}



function SmartContracts({ role = 'owner', workflow }: { role?: Role; workflow?: WorkflowState }) {
  const w = workflow || readWorkflow();
  const sol = w.solidity;
  const canOperate = hasPermission(role, 'escrow:fund') || hasPermission(role, 'agreement:create') || hasPermission(role, 'agreement:edit') || role === 'owner';
  const [walletConnected, setWalletConnected] = useState(() => readText(WALLET_KEY) === 'true');
  const toggleWallet = () => { const next = !walletConnected; setWalletConnected(next); writeText(WALLET_KEY, String(next)); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: next ? 'Simulation wallet connected (no real wallet).' : 'Wallet disconnected.' })); };
  const exec = w.execution;
  const [busy, setBusy] = useState(false);
  const [showSource, setShowSource] = useState(true);
  const download = () => {
    if (!sol.generation.source || sol.generation.status !== 'success') { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Generate Solidity before downloading.' })); return; }
    const blob = new Blob([sol.generation.source], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = sol.generation.filename || 'contract.sol'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 0);
    window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Solidity source downloaded locally (.sol).' }));
  };
  const generate = () => {
    if (busy) return;
    const current = readWorkflow();
    if (!current.ir) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Contract IR is required before Solidity generation.' })); return; }
    if (current.validation.status !== 'valid') { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Invalid/unvalidated Contract IR cannot be used for Solidity generation.' })); return; }
    if (current.approval.status !== 'approved') { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Human approval is required before Solidity generation.' })); return; }
    setBusy(true);
    window.setTimeout(() => {
      const cur = readWorkflow();
      const gen = generateSolidity(cur.ir as any, { validationStatus: cur.validation.status, approved: cur.approval.status === 'approved' });
      let nw: any = { ...cur, solidity: { ...cur.solidity, generation: gen as any, tests: gen.status === 'success' ? { status: 'not_run', ranAt: '', summary: 'Automated contract tests not run.', cases: [] } : cur.solidity.tests } };
      nw = ensureIntegrityFields(nw); nw = logEvent(nw, 'solidity_generation', gen.status==='success' ? `Solidity generated for IR ${gen.irVersion}.` : 'Solidity generation failed.', { name: 'System', role: role || 'system' }, { afterHash: gen.status==='success'?hashSolidity(gen.source):null, details:{status:gen.status,irVersion:gen.irVersion} }); nw = recordVersion(nw, { name: 'System', role: role || 'system' }, gen.status==='success'?`Solidity generated for IR ${gen.irVersion}.`:'Solidity generation failed.');
      writeWorkflow(nw as WorkflowState);
      setBusy(false);
      window.dispatchEvent(new CustomEvent('legalx:notice', { detail: gen.status === 'success' ? 'Deterministic Solidity generated from approved Contract IR.' : ('Generation failed: ' + (gen.errors[0] || gen.message)) }));
    }, 250);
  };
  const runTests = () => {
    const current = readWorkflow();
    if (current.solidity.generation.status !== 'success') { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Generate Solidity successfully before running automated tests.' })); return; }
    setBusy(true);
    window.setTimeout(() => {
      const cur = readWorkflow();
      const results = runGenerationTests(cur.ir);
      const compilation = { status: 'not_run' as const, ranAt: '', message: 'Compilation not run (no Solidity compiler/tooling detected in this environment). Runtime tests not executed.', tool: 'unavailable' };
      let nw: any = { ...cur, solidity: { ...cur.solidity, compilation, tests: results as any } };
      nw = ensureIntegrityFields(nw); nw = logEvent(nw, 'test_results', `Automated contract tests ${results.status} for IR ${cur.ir?.version || ''}.`, { name: 'System', role: role || 'system' }, { details:{status:results.status,summary:results.summary} }); nw = recordVersion(nw, { name: 'System', role: role || 'system' }, `Tests ${results.status} for IR ${cur.ir?.version || ''}.`);
      writeWorkflow(nw as WorkflowState);
      setBusy(false);
      window.dispatchEvent(new CustomEvent('legalx:notice', { detail: results.status === 'passed' ? 'Automated contract tests passed (generation/security checks).' : 'Automated contract tests failed.' }));
    }, 250);
  };
  const resetGenerated = () => { const cur = readWorkflow(); writeWorkflow({ ...cur, solidity: { generation: { status: 'idle', message: 'No Solidity generated yet.', filename: '', irVersion: '', source: '', metadata: null, supported: [], unsupported: [], security: [], errors: [] } as any, compilation: { status: 'not_run', ranAt: '', message: 'Compilation not run (no Solidity compiler/tooling detected in this environment).', tool: 'unavailable' } as any, tests: { status: 'not_run', ranAt: '', summary: 'Automated contract tests not run.', cases: [] } as any } } as WorkflowState); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Solidity generation/testing state reset for current workflow.' })); };
  const gen = sol.generation; const compStatus = sol.compilation; const tests = sol.tests;
  const genBlockedReason = !w.ir ? 'Contract IR not generated.' : w.validation.status !== 'valid' ? 'Contract IR must be validated.' : w.approval.status !== 'approved' ? 'Human approval required before generation.' : '';
  return <div className="lx-smart-contracts">
    <PageHeader eyebrow="SMART CONTRACTS · DEVELOPER WORKSPACE" title="Contract execution" desc="Deterministic Solidity from validated/approved Contract IR. Compilation/runtime requires Solidity tooling (not detected); generation/security checks run locally. No real deployment." />
    <div className="panel lx-ready-strip">
      <div><span className="section-kicker">READINESS</span><h3 style={{margin:'6px 0'}}>{exec.status}</h3><Badge tone={exec.status==='ready'?'success':'danger'}>{exec.status.toUpperCase()}</Badge></div>
      <div><span className="section-kicker">GENERATION</span><h3 style={{margin:'6px 0'}}>{gen.status}</h3><p className="muted">IR {w.ir?.version || '—'}</p></div>
      <div><span className="section-kicker">COMPILATION</span><h3 style={{margin:'6px 0'}}>{compStatus.status}</h3><p className="muted">tool: {compStatus.tool || 'unavailable'}</p></div>
      <div><span className="section-kicker">TESTS</span><h3 style={{margin:'6px 0'}}>{tests.status}</h3><p className="muted">{tests.summary || 'not run'}</p></div>
    </div>
    <div className="panel" style={{marginTop:12}}>
      <div className="panel-head"><div><span className="section-kicker">ACTIONS</span><h2>Pipeline controls</h2></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button onClick={generate} icon="code" className={busy || !canOperate ? 'disabled' : ''}>Generate Solidity</Button><Button kind="secondary" onClick={runTests} icon="shield" className={busy || gen.status!=='success' ? 'disabled' : ''}>Run automated tests</Button><Button kind="secondary" onClick={download} icon="download" className={gen.status!=='success' ? 'disabled' : ''}>Download .sol</Button><Button kind="secondary" onClick={toggleWallet} icon="wallet">{walletConnected ? 'Disconnect sim wallet' : 'Connect sim wallet'}</Button><Button kind="ghost" onClick={resetGenerated} icon="refresh">Reset</Button></div></div>
      {genBlockedReason && <div className="inline-error" style={{marginTop:8,position:'static'}}><Icon name="alert" size={14} /><span><b>Generation blocked.</b><small>{genBlockedReason} Missing terms are never invented.</small></span></div>}
      <p className="muted" style={{marginTop:8}}>{exec.reason}</p>
    </div>

    <div className="lx-ide" style={{marginTop:14}}>
      <section>
        <div className="lx-code-editor">
          <div className="lx-code-head"><span>{gen.filename || 'LexoraMilestoneEscrow.sol'} · IR {w.ir?.version || '—'}</span><span>{gen.status === 'success' ? 'generated' : 'no source'}</span></div>
          {gen.status==='success' && showSource ? <pre className="lx-code-body" aria-label="Generated Solidity source"><code>{gen.source}</code></pre> : <div style={{padding:18,color:'#b8c7d6',background:'#0f1724',minHeight:240}}><p>{gen.status!=='success' ? 'No generated Solidity source yet. Complete validation, parity, and human approval, then generate from Contract IR.' : 'Source hidden.'}</p></div>}
        </div>
        <div style={{display:'flex',gap:8,marginTop:8}}><Button kind="secondary" onClick={()=>setShowSource(!showSource)} icon={showSource?'x':'code'}>{showSource?'Hide':'Show'} source</Button>{gen.metadata && <Badge tone="neutral">hash {String(gen.metadata.deterministicHash||'').slice(0,12)}…</Badge>}</div>
      </section>

      <aside className="lx-test-panel">
        <div className="panel"><span className="section-kicker">METADATA & SECURITY</span><h3 style={{margin:'6px 0 10px'}}>{gen.metadata?.contractName || 'LexoraMilestoneEscrow'}</h3>{gen.metadata ? <ul style={{margin:0,paddingLeft:18}}><li>IR: {gen.irVersion}</li><li>Compiler: {gen.metadata.compiler}</li><li>Total: {gen.metadata.totalAmount}</li><li>Review days: {gen.metadata.reviewPeriodDays}</li><li>Dispute freeze: {String(gen.metadata.disputeFreeze)}</li><li>Approval required: {String(gen.metadata.approvalRequired)}</li></ul> : <p className="muted">Generate to view metadata.</p>}</div>
        <div className="panel"><span className="section-kicker">AUTOMATED TEST RESULTS</span><div style={{display:'grid',gap:8,marginTop:8}}>{(tests.cases && tests.cases.length>0) ? tests.cases.map((c:any)=> <div key={c.id} className="lx-test-case"><div><b>{c.name}</b><div className="muted" style={{fontSize:12,marginTop:4}}>{c.detail}</div></div><Badge tone={c.status==='passed'?'success':c.status==='failed'?'danger':'warning'}>{c.status}</Badge></div>) : <p className="muted">Run automated tests to see generation/security case results. Compilation/runtime execution not available in this environment.</p>}</div></div>
        <div className="panel"><span className="section-kicker">SUPPORTED / UNSUPPORTED</span><p className="muted"><b>Supported:</b> {(gen.supported?.length?gen.supported:['amounts','milestones','review period','dispute freeze','approval gating']).slice(0,6).join(', ')}</p>{gen.unsupported?.length ? <p className="muted"><b>Unsupported:</b> {gen.unsupported.join(', ')}</p> : <p className="muted">No unsupported execution-critical clauses detected for current mapping.</p>}</div>
      </aside>
    </div>
  </div>;
}



function Milestones({ role = 'owner' }: { role?: Role }) { const restricted = maskFinancials(role) ? 'Restricted' : null; const [items, setItems] = useState(() => readJson(MILESTONES_KEY, milestones)); const [showForm, setShowForm] = useState(false); const [label, setLabel] = useState(''); const [detail, setDetail] = useState(''); const addMilestone = () => { if (!hasPermission(role, 'milestone:submit') && !hasPermission(role, 'milestone:approve')) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'This role can review milestones but cannot create one.' })); return } if (!label.trim()) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Add a milestone name before saving.' })); return } const next = [...items, { id: `local-${Date.now()}`, label: label.trim(), amount: 'Pending', percent: 0, detail: detail.trim() || 'New milestone awaiting terms.', status: 'Draft' }]; setItems(next); writeJson(MILESTONES_KEY, next); setLabel(''); setDetail(''); setShowForm(false); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Milestone saved to the local agreement workflow.' })) }; return <div><PageHeader eyebrow="MILESTONE TRACKING" title="Milestones" desc="Milestones stay connected to the terms, review windows, releases, and disputes that define them." action={showForm ? 'Close form' : 'Add milestone'} onAction={() => setShowForm(!showForm)} />{showForm && <div className="panel inline-form"><div className="form-grid"><label>Milestone name<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Final handoff" /></label><label>What completes it<input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Release after written approval" /></label></div><Button onClick={addMilestone} icon="check">Save milestone</Button></div>}<div className="milestone-summary"><div><span className="section-kicker">TOTAL VALUE</span><strong>{restricted ?? '₹50,000'}</strong><small>{items.length} milestones · 40% released</small></div><div className="progress-large"><div><span>Overall progress</span><b>40%</b></div><i><em /></i><small>{restricted ? 'Financial details restricted for this role' : '₹20,000 released · ₹30,000 pending'}</small></div><Badge tone="success">On track</Badge></div><div className="milestone-list">{items.map((m, i) => <div className="milestone-detail-row panel" key={m.id}><span className={`milestone-number ${i === 0 ? 'done' : ''}`}>0{i + 1}</span><div className="milestone-main"><div><h2>{m.label}</h2><p>{m.detail}</p></div><Badge tone={i === 0 ? 'success' : m.status === 'Draft' ? 'neutral' : 'warning'}>{m.status}</Badge></div><div className="milestone-side"><strong>{restricted ?? m.amount}</strong><div><i style={{ width: `${m.percent}%` }} /></div><small>{i === 0 ? 'Released Nov 04' : m.status === 'Draft' ? 'Draft · terms required' : 'Review window opens on delivery'}</small></div></div>)}</div></div> }function Transactions({ role = 'owner' }: { role?: Role }) { const [query, setQuery] = useState(''); const [exported, setExported] = useState(false); const [exportBusy, setExportBusy] = useState(false); const data = [['Milestone released', 'Website project', maskFinancials(role) ? 'Restricted' : '₹20,000', 'Confirmed', 'Nov 04'], ['Contract funded', 'Brand retainer', maskFinancials(role) ? 'Restricted' : '₹60,000', 'Confirmed', 'Oct 28'], ['Wallet approval', 'Website project', '—', 'Signed', 'Oct 30'], ['Dispute freeze', 'Mobile app build', maskFinancials(role) ? 'Restricted' : '₹80,000', 'Blocked', 'Oct 22']].filter((row) => row.join(' ').toLowerCase().includes(query.toLowerCase())); const exportCsv = () => { if (exportBusy) return; const guard = guardDemoOperation('CSV export'); if (!guard.allowed) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: guard.message })); return } setExportBusy(true); const csv = [['Event','Agreement','Amount','Status','When'], ...data].map((row) => row.join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'legalx-demo-transactions.csv'; a.click(); window.setTimeout(() => { URL.revokeObjectURL(a.href); setExported(true); setExportBusy(false); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'CSV export confirmed locally · simulated download only' })) }, 0) }; return <div><PageHeader eyebrow="TRANSACTIONS" title="Transactions" desc="Search sample payment, signature and contract events, or export the ledger." /><div className="panel transaction-panel"><div className="toolbar"><div className="search-field"><Icon name="search" size={15} /><input aria-label="Search transactions" placeholder="Search transactions" value={query} onChange={(e) => setQuery(e.target.value)} /></div><Button kind="secondary" onClick={exportCsv} icon="download">{exportBusy ? 'Preparing export…' : 'Export CSV'}</Button>{exported && <Badge tone="warning">Simulated download recorded</Badge>}</div><div className="transaction-table" role="region" aria-label="Transaction ledger" tabIndex={0}><table className="journal-table"><thead><tr>{['Event','Agreement','Amount','Status','When'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.map(([event,agreement,amount,status,date]) => <tr key={event+agreement}><th scope="row">{event}</th><td>{agreement}</td><td>{amount}</td><td><Badge tone={status === 'Blocked' ? 'danger' : status === 'Signed' ? 'warning' : 'success'}>{status}</Badge></td><td>{date}</td></tr>)}</tbody></table>{!data.length && <p role="status">No transactions match your search.</p>}</div></div></div> }
function Activity({ role = 'owner', workflow }: { role?: Role; workflow?: WorkflowState }) {
  const actor = effectiveAccount(role);
  const w = workflow || readWorkflow();
  const events: [string,string,string,IconName,string][] = [
    ['Workflow mode', 'Demo/local deterministic integration active. No external Contract Intelligence, backend API, or review service connected.', w.extraction.status==='idle'?'Not started':(w.extraction.message||w.extraction.status), 'activity', 'neutral'],
  ];
  if (w.extraction.status!=='idle') events.push(['Clause extraction', w.extraction.message || w.extraction.status, w.extraction.status, 'spark', w.extraction.status==='success'?'success':w.extraction.status==='error'?'danger':'warning']);
  if (w.ir) events.push(['Contract IR generated', 'Canonical IR '+w.ir.version+' created with provenance for '+w.ir.provenance.length+' fields.', 'IR', 'database', 'success']);
  events.push(['Contract validation', w.validation.status==='valid'?'Contract IR validated successfully.':(w.validation.issues.join(' ')||'Validation pending.'), w.validation.checkedAt || 'pending', 'shield', w.validation.status==='valid'?'success':w.validation.status==='invalid'?'danger':'warning']);
  events.push(['Parity verification', w.parity.status==='matched'?'Supported fields match Contract IR.':(w.parity.mismatches.length?('Mismatch: '+w.parity.mismatches.join(', ')):'Parity pending/not run.'), w.parity.checkedAt || 'pending', 'scan', w.parity.status==='matched'?'success':w.parity.status==='pending'?'warning':'danger']);
  w.reviews.forEach(r => events.push([r.status==='approved_note'?'Review note':'Review comment', r.note+' ('+r.role+')', r.at, 'edit', r.status==='approved_note'?'success':'neutral']));
  w.revisions.forEach(r => events.push(['Revision recorded', r.summary, r.irVersion+' · '+r.at, 'refresh', 'warning']));
  events.push(['Human approval', w.approval.status==='approved'?('Approved by '+w.approval.by+'. '+w.approval.note):w.approval.status==='blocked'?('Blocked. '+(w.approval.note||w.execution.reason)):'Human approval required before execution readiness.', w.approval.at || 'pending', 'check', w.approval.status==='approved'?'success':w.approval.status==='blocked'?'danger':'warning']);
  events.push(['Execution readiness', w.execution.reason, w.execution.status, 'lock', w.execution.status==='ready'?'success':'danger']);
  const audit = getAuditTrail(w as any);
  const auditVerify = verifyAuditTrail(w as any);
  return <div><PageHeader eyebrow="ACTIVITY LOG" title="Activity history" desc="Chronological workflow events plus hash-linked audit trail and integrity verification (demo/local, tamper-evident within local storage limitations)." />
    <div className="prototype-banner"><Icon name="shield" size={16} /><span><b>Hash-linked audit trail (local):</b> {audit.events.length} events · Integrity: {auditVerify.valid ? 'verified' : 'issues detected'} · {audit.label}</span><Badge tone={auditVerify.valid ? 'success' : 'danger'}>{auditVerify.valid ? 'VERIFIED' : 'CHECK'}</Badge></div>
    <div className="activity-log panel">{events.map(([a,b,c,icon,tone],i) => <div className="activity-row" key={a+String(i)}><span className={'timeline-icon '+tone}><Icon name={icon} size={15} /></span><div><b>{a}</b><p>{b}</p><small>{actor.name} · {actor.workspaceName} · {(w.ir?.version || 'no IR')} · {tone === 'success' ? 'verified/recorded' : 'recorded'}</small></div><time>{String(c)}</time></div>)}</div>
    <div className="panel" style={{marginTop:12}}><div className="panel-head"><div><span className="section-kicker">AUDIT TRAIL & INTEGRITY</span><h2>Hash-linked events</h2></div><Badge tone={auditVerify.valid?'success':'danger'}>{auditVerify.valid ? 'chain valid' : 'chain issues'}</Badge></div>{audit.events.length === 0 ? <p className="muted">No audit events recorded yet.</p> : <div className="activity-log">{[...audit.events].slice().reverse().slice(0,12).map((ev:any)=><div className="activity-row" key={ev.id}><span className="timeline-icon neutral"><Icon name="shield" size={15} /></span><div><b>{ev.type}</b><p>{ev.summary}</p><small>{ev.actor} ({ev.role}) · IR {ev.irVersion} · prev {String(ev.prevEventHash||'GENESIS').slice(0,10)}… · hash {String(ev.eventHash).slice(0,10)}…</small></div><time>{ev.timestamp}</time></div>)}{audit.events.length>12 && <p className="muted">Showing latest 12 of {audit.events.length} events. Full trail and verification details available in Contract IR → Integrity panels.</p>}</div>}{!auditVerify.valid && <div className="inline-error" style={{marginTop:8}}><Icon name="alert" size={14} /><span><b>Integrity issues</b><small>{auditVerify.issues.join(' ')}</small></span></div>}</div></div>;
}
function Team({ role = 'owner', onNavigate, workflow }: { role?: Role; onNavigate: (path: string) => void; workflow?: WorkflowState }) {
  const account = effectiveAccount(role);
  const w = workflow || readWorkflow();
  const [invites, setInvites] = useState(() => readJson<{ name: string; email: string; role: Role; status: string }[]>(INVITES_KEY, []));
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [inviteRole, setInviteRole] = useState<Role>('legal_reviewer');
  const [comment, setComment] = useState(''); const [revisionNote, setRevisionNote] = useState('');
  const canApprove = hasPermission(role, 'agreement:approve_legal') || hasPermission(role, 'milestone:approve') || hasPermission(role, 'escrow:fund');
  const submitInvite = () => { if (!name.trim() || !email.trim()) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Add a name and email before staging an invite.' })); return } const next = [...invites, { name: name.trim(), email: email.trim(), role: inviteRole, status: 'Invite pending' }]; setInvites(next); writeJson(INVITES_KEY, next); setName(''); setEmail(''); setShowForm(false); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Invite staged locally with the selected role boundary.' })) };
  const addReview = (status: 'comment'|'changes_requested'|'approved_note') => {
    if (!comment.trim()) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Add a review note first.' })); return }
    const current = readWorkflow();
    const review = { id: 'rv-'+Date.now(), by: account.name, role, at: new Date().toLocaleString(), status, note: comment.trim() };
    writeWorkflow({ ...current, reviews: [...(current.reviews||[]), review] }); setComment('');
    window.dispatchEvent(new CustomEvent('legalx:notice', { detail: status==='changes_requested' ? 'Revision requested and recorded in workflow.' : 'Review comment recorded.' }));
  };
  const addRevision = () => {
    if (!revisionNote.trim()) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Describe the revision before saving.' })); return }
    const current = readWorkflow();
    if (!current.ir) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Generate Contract IR before recording a revision.' })); return }
    const bumped = 'v'+((parseInt((current.ir.version||'v1').replace(/[^0-9]/g,''),10)||1)+1)+'.0';
    const updatedIr = { ...current.ir, version: bumped };
    const revision = { id: 'rev-'+Date.now(), at: new Date().toLocaleString(), summary: revisionNote.trim(), irVersion: bumped };
    const issues: string[] = [];
    if(updatedIr.total_amount<=0) issues.push('Total amount invalid');
    if(updatedIr.milestones.reduce((a: number,m: any)=>a+m.amount,0)!==updatedIr.total_amount) issues.push('Milestone sum mismatch');
    const validation = { status: issues.length?'invalid':'valid', issues, checkedAt: new Date().toLocaleString() } as any;
    let parityRes: any = { ...current.parity, status:'pending', score:0, mismatches:[], checkedAt:'' };
    if (validation.status==='valid') { const ep=current.parity.executionParams; const mm: string[]=[]; if(updatedIr.total_amount!==ep.total) mm.push('total_amount'); if(JSON.stringify(updatedIr.milestones.map((m:any)=>m.amount))!==JSON.stringify(ep.milestones)) mm.push('milestones'); if(updatedIr.review_period_days!==ep.reviewDays) mm.push('review_period_days'); if((updatedIr.dispute_behavior==='freeze_affected_payment')!==ep.disputeFreeze) mm.push('dispute_behavior'); parityRes = { status: mm.length?'mismatched':'matched', score: mm.length?74:100, mismatches:mm, checkedAt:new Date().toLocaleString(), executionParams:ep }; }
    const clauses = buildClausesFromIr(updatedIr as any, current.extraction?.sourceText || '').map((c: any) => ({ ...c, irVersion: bumped }));
    let nextW: any = { ...current, ir: updatedIr, validation, parity: parityRes, revisions: [...(current.revisions||[]), revision], approval: { status:'not_requested', by:'', at:'', note:'Approval reset after revision.' }, solidity: { generation: { status: 'idle', message: 'No Solidity generated yet.', filename: '', irVersion: '', source: '', metadata: null, supported: [], unsupported: [], security: [], errors: [] }, compilation: { status: 'not_run', ranAt: '', message: 'Compilation not run (no Solidity compiler/tooling detected in this environment).', tool: 'unavailable' }, tests: { status: 'not_run', ranAt: '', summary: 'Automated contract tests not run.', cases: [] } }, traceability: { clauses, snapshots: { ...(current.traceability?.snapshots||{}) }, history: Array.isArray(current.traceability?.history) ? [...current.traceability.history] : [] }, simulation: null };
    // preserve previous snapshot in history
    const prevSnap = (current.traceability?.snapshots||{})[current.ir.version] || deriveTraceability(current);
    if (prevSnap && !nextW.traceability.history.find((h:any)=>h.irVersion===prevSnap.irVersion)) nextW.traceability.history = [...nextW.traceability.history, prevSnap];
    const snap = deriveTraceability(nextW);
    nextW.traceability.snapshots = { ...nextW.traceability.snapshots, [snap.irVersion]: snap };
    nextW = ensureIntegrityFields(nextW);
    nextW = logEvent(nextW, 'revision_creation', `Revision created: IR ${bumped} (${revision.summary})`, { name: account.name, role }, { beforeHash: hashIr(current.ir), afterHash: hashIr(updatedIr), details: { from: current.ir.version, to: bumped } });
    nextW = recordVersion(nextW, { name: account.name, role }, `Revision ${bumped}: ${revision.summary}`);
    writeWorkflow(nextW as WorkflowState);
    setRevisionNote(''); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Revision saved as '+bumped+'. Approval reset; re-verify before execution.' }));
  };
  const approve = () => {
    if (!canApprove) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Your role is not permitted to approve for execution readiness.' })); return }
    if (!window.confirm('Approve this agreement version for execution readiness? This records human approval (demo/local) and captures an approved snapshot.')) return;
    const current = readWorkflow();
    if (current.validation.status !== 'valid' || current.parity.status !== 'matched') {
      let blockedW: any = { ...current, approval: { status:'blocked', by: account.name, at: new Date().toLocaleString(), note:'Cannot approve while validation/parity is not passing.' } };
      blockedW = ensureIntegrityFields(blockedW);
      blockedW = logEvent(blockedW, 'human_approval', 'Approval attempt blocked: validation/parity not passing.', { name: account.name, role }, { details: { status: 'blocked' } });
      writeWorkflow(blockedW);
      window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Approval blocked: validation and parity must pass first.' }));
      return;
    }
    const driftNow = computeDrift(current as any);
    if (driftNow.status === 'drift_detected' && driftNow.materialChange) {
      const { workflow: dw } = detectAndApplyDrift(current as any, { name: account.name, role });
      writeWorkflow(dw as any);
      window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Approval blocked: material drift detected against approved snapshot. Re-review and reapprove required.' }));
      return;
    }
    let currentApproved: any = { ...current, approval: { status:'approved', by: account.name, at: new Date().toLocaleString(), note:'Human approval granted for execution readiness (demo/local).' } };
    currentApproved = ensureIntegrityFields(currentApproved);
    currentApproved = snapshotApproved(currentApproved, { name: account.name, role });
    currentApproved = recordVersion(currentApproved, { name: account.name, role }, `Approved snapshot for IR ${current.ir?.version || ''}.`);
    writeWorkflow(currentApproved);
    window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Human approval recorded and approved snapshot captured (hash-linked, locally persisted).' }));
  };
  const rejectApproval = () => {
    if (!canApprove) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Your role is not permitted to reject this approval.' })); return }
    if (!window.confirm('Reject this version for execution? This will block approval/execution readiness until issues are resolved and re-reviewed.')) return;
    const reason = window.prompt('Rejection reason/comment (required):', comment.trim() || '') || '';
    if (!reason.trim()) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Rejection cancelled: a reason is required.' })); return }
    const current = readWorkflow();
    let next: any = { ...current, approval: { status: 'blocked', by: account.name, at: new Date().toLocaleString(), note: `Rejected by ${account.name}: ${reason.trim()}` }, reviews: [...(current.reviews || []), { id: 'rv-'+Date.now(), by: account.name, role, at: new Date().toLocaleString(), status: 'changes_requested', note: `Rejected: ${reason.trim()}` }] };
    next = ensureIntegrityFields(next);
    next = logEvent(next, 'review_comment', `Rejected by ${account.name}.`, { name: account.name, role }, { details: { status: 'rejected', note: reason.trim() } });
    next = logEvent(next, 'approval_invalidation', 'Approval/execution readiness blocked due to rejection.', { name: account.name, role }, { details: { reason: reason.trim() } });
    writeWorkflow(next as WorkflowState);
    window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Rejection recorded. Approval and execution readiness are blocked until re-review/revision.' }));
  };
  const requestChangesAction = () => {
    if (!comment.trim()) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Add a review comment explaining requested changes.' })); return }
    if (!window.confirm('Request changes? This records review feedback and resets approval state.')) return;
    addReview('changes_requested');
  };
  const exec = w.execution;
  return <div><PageHeader eyebrow="TEAM WORKSPACE · REVIEW &amp; APPROVAL" title="Team and approvals" desc="Review comments, revisions, and human approval are recorded in workflow state. Execution is blocked until validation+parity pass and a permitted human approves." action={showForm ? 'Close invite form' : 'Invite member'} onAction={() => setShowForm(!showForm)} />
    {showForm && <div className="panel inline-form"><div className="form-grid"><label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reviewer name" /></label><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="reviewer@company.com" /></label><label>Role<select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>{DEMO_ACCOUNTS.map((demo) => <option key={demo.role} value={demo.role}>{ROLE_LABELS[demo.role]}</option>)}</select></label></div><Button onClick={submitInvite} icon="check">Stage invite</Button></div>}
    <div className="prototype-banner" data-blocked={exec.status !== 'ready'}><Icon name={exec.status==='ready'?'check':'alert'} size={16} /><span><b>Execution readiness: {exec.status.toUpperCase()}.</b> {exec.reason}</span><Badge tone={exec.status==='ready'?'success':'danger'}>{w.approval.status}</Badge></div>
    <div className="team-grid"><div className="panel team-card"><span className="section-kicker">REVIEW &amp; REVISION</span>
      <label>Review comment / request<textarea value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="Add review note or requested change (recorded locally)" /></label>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'8px 0'}}><Button kind="secondary" onClick={()=>addReview('comment')} icon="edit">Add comment</Button><Button kind="secondary" onClick={requestChangesAction} icon="alert">Request changes</Button><Button kind="danger" onClick={rejectApproval} icon="x" className={!canApprove?'disabled':''}>Reject</Button></div>
      <label>Revision summary<input value={revisionNote} onChange={(e)=>setRevisionNote(e.target.value)} placeholder="Describe revision to Contract IR version" /></label>
      <div style={{marginTop:8}}><Button kind="secondary" onClick={addRevision} icon="refresh">Record revision / bump IR</Button></div>
      <div style={{marginTop:12, display:'flex', gap:8, flexWrap:'wrap'}}><Button onClick={approve} icon="check" className={!canApprove?'disabled':''}>Approve</Button><Button kind="secondary" onClick={requestChangesAction} icon="edit" className={!comment.trim()?'disabled':''}>Request changes (with comment)</Button><Button kind="danger" onClick={rejectApproval} icon="x" className={!canApprove?'disabled':''}>Reject (with reason)</Button>{!canApprove && <p className="muted">Your role cannot grant/reject approval (RBAC/UI reflects permissions; backend authorization is authoritative).</p>}</div>
      <div style={{marginTop:12}}><b>Recent workflow items</b>{(w.reviews.length===0 && w.revisions.length===0) ? <p className="muted">No reviews or revisions yet.</p> : <>{w.reviews.slice(-3).map(r=><p key={r.id}><small>{r.at}</small> — <b>{r.status}</b>: {r.note}</p>)}{w.revisions.slice(-3).map(r=><p key={r.id}><small>{r.at}</small> — <b>Revision {r.irVersion}</b>: {r.summary}</p>)}</>}</div>
    </div>
    <div className="panel role-card"><span className="section-kicker">TEAM &amp; PERMISSIONS</span><h2>Review gates</h2><div className="team-person"><span className="avatar">{account.initials}</span><div><b>{account.name}</b><small>{ROLE_LABELS[role]} · {account.workspaceName}</small></div><Badge tone="success">Active</Badge></div>
      {invites.map((invite) => <div className="team-person" key={invite.email}><span className="avatar">{invite.name.slice(0, 2).toUpperCase()}</span><div><b>{invite.name}</b><small>{ROLE_LABELS[invite.role]} · {invite.email}</small></div><Badge tone="warning">{invite.status}</Badge></div>)}
      <div className="permission"><Icon name="shield" size={16} /><span>Parity verification <b>All permitted roles</b></span></div><div className="permission"><Icon name="check" size={16} /><span>Human approval <b>Owner/Admin (RBAC)</b></span></div><div className="permission"><Icon name="wallet" size={16} /><span>Execution prep <b>Blocked until approved</b></span></div>
      <div style={{marginTop:12, display:'flex', gap:8, flexWrap:'wrap'}}><Button kind="secondary" onClick={() => onNavigate('/app/parity')} icon="scan">Open verification</Button><Button kind="secondary" onClick={() => onNavigate('/app/contract-ir')} icon="database">Inspect Contract IR</Button></div>
    </div></div></div>;
}
function Notifications() { const [onlyUnread,setOnlyUnread] = useState(false); type NotificationItem = [string, string, string, string, boolean]; const initial: NotificationItem[] = [['Parity check passed', 'Website project is ready for human review.', 'Just now', 'success', false], ['Deadline approaching', 'Design review window closes in 5 days.', '2 hours ago', 'warning', false], ['Invitation pending', 'QA reviewer has not accepted the invite.', 'Yesterday', 'neutral', false], ['Mismatch resolved', 'Website project review window was restored.', 'Nov 02', 'success', true]]; const [items, setItems] = useState<NotificationItem[]>(() => readJson(NOTIFICATIONS_KEY, initial)); const unread = items.filter((item) => !item[4]).length; const persist = (next: NotificationItem[]) => { setItems(next); writeJson(NOTIFICATIONS_KEY, next) }; const markAll = () => persist(items.map((item) => [item[0], item[1], item[2], item[3], true])); return <div><PageHeader eyebrow="NOTIFICATIONS" title="Notifications" desc="Review deadlines, mismatches, approvals, and workspace updates." action={unread ? `Mark all read · ${unread}` : 'All caught up'} onAction={markAll} /><div className="inbox-filters" aria-label="Notification filters"><button aria-pressed={!onlyUnread} onClick={()=>setOnlyUnread(false)}>All updates</button><button aria-pressed={onlyUnread} onClick={()=>setOnlyUnread(true)}>Unread ({unread})</button></div><div className="notification-list panel">{onlyUnread && unread===0 && <p role="status">You have read every update.</p>}{items.map(([a,b,c,tone,read], index) => (!onlyUnread || !read) && <button className="notification-row" data-read={read} aria-label={a + (read ? ", read" : ", unread")} onClick={() => persist(items.map((item, i) => i === index ? [item[0], item[1], item[2], item[3], true] : item))} key={a}><span className={`notification-icon ${tone}`}><Icon name={tone === 'success' ? 'check' : tone === 'warning' ? 'clock' : 'bell'} size={15} /></span><span><b>{a}</b><small>{b}</small></span><time>{c}</time><Icon name="chevron" size={15} /></button>)}</div></div> }function Help() { return <div><PageHeader eyebrow="HELP & SUPPORT" title="Help and support" desc="Understand what LEGALX does, what it checks, and where human judgment remains necessary." /><div className="faq-grid"><div className="panel faq-card"><span className="section-kicker">COMMON QUESTIONS</span>{[['Does LEGALX make an agreement legally enforceable?', 'No. LEGALX checks consistency between a written agreement and supported executable payment logic. It is not legal advice and does not guarantee enforceability.'], ['What happens when information is missing?', 'The AI workspace is designed to ask clarification questions instead of silently inventing terms.'], ['Can I deploy from this prototype?', 'No. Wallet connection and transactions are intentionally not active. The contract workspace shows the honest state of the planned flow.']].map(([q,a]) => <details key={q}><summary>{q}<Icon name="chevron" size={15} /></summary><p>{a}</p></details>)}</div><div className="panel contact-card"><Icon name="help" size={24} /><h2>Still need help?</h2><p>Send the Lexora team a note about your workflow or the terms you want to inspect.</p><Button onClick={() => window.open('mailto:hello@lexora.example')} icon="arrow">Contact Lexora</Button></div></div></div> }

function Settings({ role, onRoleChange }: { role: Role; onRoleChange: (role: Role) => void }) { const profile = readStoredProfile() || defaultProfile(role); const [saved, setSaved] = useState(false); const [activeTab, setActiveTab] = useState('Profile'); const [name, setName] = useState(profile.name); const [email, setEmail] = useState(profile.email); const [workspaceName, setWorkspaceName] = useState(profile.workspaceName); const [jobTitle, setJobTitle] = useState(profile.jobTitle); const [useCase, setUseCase] = useState(profile.useCase); const [settings, setSettings] = useState<DemoSettings>(readSettings); const tabs = ['Profile', 'Notifications', 'Review gates', 'Security']; const update = <K extends keyof DemoSettings>(key: K, value: DemoSettings[K]) => setSettings((current) => ({ ...current, [key]: value })); const save = () => { saveProfile({ ...profile, role, name, email, workspaceName, jobTitle, useCase }); saveSettings(settings); setSaved(true); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Settings saved locally and synced across the workspace.' })) }; return <div><PageHeader eyebrow="SETTINGS" title="Workspace settings" desc="Manage profile, notifications, review defaults, and prototype preferences." /><div className="settings-grid"><div className="settings-nav">{tabs.map((tab) => <button key={tab} aria-pressed={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => { setActiveTab(tab); setSaved(false) }}><Icon name={tab === 'Profile' ? 'users' : tab === 'Notifications' ? 'bell' : tab === 'Review gates' ? 'shield' : 'lock'} size={15} /> {tab}</button>)}</div><div className="panel settings-form">{activeTab === 'Profile' && <div className="settings-section"><span className="section-kicker">PROFILE</span><h2>Profile details</h2><div className="form-grid"><label>Full name<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Workspace name<input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} /></label><label>Job title<input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label><label>Active role<select value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>{DEMO_ACCOUNTS.map((account) => <option key={account.role} value={account.role}>{ROLE_LABELS[account.role]}</option>)}</select></label><label>Primary use case<select value={useCase} onChange={(e) => setUseCase(e.target.value)}><option>Freelance agreements</option><option>Agency retainers</option><option>Startup vendor contracts</option></select></label></div></div>}{activeTab === 'Notifications' && <div className="settings-section"><span className="section-kicker">NOTIFICATIONS</span><h2>Notification delivery</h2><label className="toggle-row"><span><b>Email notifications</b><small>Keep this local demo preference ready for production notification delivery.</small></span><input type="checkbox" checked={settings.emailNotifications} onChange={(e) => update('emailNotifications', e.target.checked)} /></label></div>}{activeTab === 'Review gates' && <div className="settings-section"><span className="section-kicker">REVIEW PREFERENCES</span><h2>Review requirements</h2><label className="toggle-row"><span><b>Block critical mismatches</b><small>Never allow a mismatched contract to proceed to an execution action.</small></span><input type="checkbox" checked={settings.blockCriticalMismatches} onChange={(e) => update('blockCriticalMismatches', e.target.checked)} /></label><label className="toggle-row"><span><b>Ask for source clauses</b><small>Require every extracted field to preserve its originating sentence.</small></span><input type="checkbox" checked={settings.askForSourceClauses} onChange={(e) => update('askForSourceClauses', e.target.checked)} /></label></div>}{activeTab === 'Security' && <div className="settings-section"><span className="section-kicker">SECURITY</span><h2>Confirmation preferences</h2><label className="toggle-row"><span><b>Require wallet confirmation</b><small>Keep a second confirmation step before any supported wallet action.</small></span><input type="checkbox" checked={settings.requireWalletConfirmation} onChange={(e) => update('requireWalletConfirmation', e.target.checked)} /></label><div className="permission"><Icon name="shield" size={16} /><span>Current identity <b>{ROLE_LABELS[role]}</b></span></div><div className="permission"><Icon name="lock" size={16} /><span>Production authentication <b>Not connected</b></span></div></div>}<div className="settings-footer">{saved && <Badge tone="success">Saved locally</Badge>}<Button kind="secondary" onClick={() => { if (!window.confirm('Reset only local LEGALX demo state? Production data is not connected and will not be touched.')) return; Object.keys(localStorage).filter((key) => key.startsWith('legalx:')).forEach((key) => localStorage.removeItem(key)); window.location.reload() }}>Reset demo</Button><Button onClick={save} icon="check">Save changes</Button></div></div></div></div> }const DEMO_STEPS: { title: string; summary: string; path: string; role: Role; status: 'supported' | 'simulated' | 'blocked' }[] = [
  { title: 'Meet the shared workspace', summary: 'See one agreement workspace and how the active role changes what is visible.', path: '/app', role: 'owner', status: 'supported' },
  { title: 'Inspect the agreement', summary: 'Open the readable agreement, version marker, source hash label, and human approval gate.', path: '/app/agreements/website-project', role: 'owner', status: 'simulated' },
  { title: 'Run parity verification', summary: 'Compare the written review window with supported escrow logic, then simulate a mismatch to show execution blocking.', path: '/app/parity', role: 'owner', status: 'simulated' },
  { title: 'Change perspective', summary: 'Switch to Legal Reviewer and Technical Auditor to see review and evidence boundaries without duplicating the product.', path: '/app', role: 'legal_reviewer', status: 'supported' },
  { title: 'Explain the trust boundary', summary: 'Review the activity evidence and the honest limits: no live wallet, AI provider, API, database, or transaction is connected.', path: '/app/activity', role: 'technical_auditor', status: 'blocked' },
]

function DemoControlCenter({ onNavigate, onRoleChange }: { onNavigate: (p: string) => void; onRoleChange: (role: Role) => void }) {
  const [step, setStep] = useState(() => Number(localStorage.getItem('legalx:guided-step') || 0))
  const [active, setActive] = useState(() => localStorage.getItem('legalx:guided-active') === 'true')
  const [paused, setPaused] = useState(() => localStorage.getItem('legalx:guided-paused') === 'true')
  const [notice, setNotice] = useState(active ? 'Your checkpoint is saved in this browser.' : 'Ready when you are.'); const [networkMode, setNetworkMode] = useState<'normal' | 'slow' | 'offline'>(() => (localStorage.getItem('legalx:network-mode') as 'normal' | 'slow' | 'offline') || 'normal')
  const [visited, setVisited] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('legalx:guided-visited') || '[]')
      return Array.isArray(saved) ? saved.filter(Number.isInteger) : []
    } catch { return [] }
  })
  const current = DEMO_STEPS[Math.min(Math.max(step, 0), DEMO_STEPS.length - 1)]
  useEffect(() => { localStorage.setItem('legalx:guided-step', String(step)); localStorage.setItem('legalx:guided-active', String(active)); localStorage.setItem('legalx:guided-paused', String(paused)) }, [step, active, paused])
  const openStep = (index: number) => { const next = DEMO_STEPS[index]; const history = Array.from(new Set([...visited, index])); setVisited(history); localStorage.setItem('legalx:guided-visited', JSON.stringify(history)); localStorage.setItem('legalx:guided-step', String(index)); localStorage.setItem('legalx:guided-active', 'true'); localStorage.setItem('legalx:guided-paused', 'false'); setStep(index); setActive(true); setPaused(false); onRoleChange(next.role); onNavigate(next.path); setNotice(`Step ${index + 1} opened · ${next.status === 'supported' ? 'supported UI path' : next.status === 'simulated' ? 'simulation clearly labelled' : 'external integration blocked'}`) }
  const setNetwork = (mode: 'normal' | 'slow' | 'offline') => { localStorage.setItem('legalx:network-mode', mode); setNetworkMode(mode); window.dispatchEvent(new Event('legalx:network-mode')); setNotice(mode === 'normal' ? 'Failure simulation cleared. No operation was marked successful.' : `${mode === 'offline' ? 'Offline' : 'Slow network'} mode simulated. Operations stay pending.`) }; const reset = () => { if (!window.confirm('Reset only local LEGALX demo state? Production data is not connected and will not be touched.')) return; Object.keys(localStorage).filter((key) => key.startsWith('legalx:')).forEach((key) => localStorage.removeItem(key)); setVisited([]); setStep(0); setActive(false); setPaused(false); setNotice('Local demo reset safely. No production data was touched.') }
  return <div className="demo-center"><PublicNav active="/demo" /><main className="demo-center-main"><div className="demo-center-head"><div><Badge tone="crimson">JUDGE MODE · LOCAL DEMO</Badge><h1>Guided workspace review.</h1><p>Explore a sample agreement from intake to verification. Your place in the walkthrough is saved in this browser.</p></div><div className="walk-session"><span className="section-kicker">DEMO CONTROL CENTER</span><b>{active ? (paused ? 'Paused' : 'In progress') : 'Ready to start'}</b><small>Local browser state · no production session</small><Badge tone={active ? 'success' : 'neutral'}>{active ? `${step + 1} / ${DEMO_STEPS.length}` : 'SAFE TO RESET'}</Badge></div></div><WalkProgress value={active ? Math.round((step + 1) / DEMO_STEPS.length * 100) : 0} /><div className="walk-grid"><section className="walk-current"><div className="panel-head"><div><span className="section-kicker">CURRENT STEP · {step + 1} OF {DEMO_STEPS.length}</span><h2>{current.title}</h2></div><Badge tone={current.status === 'supported' ? 'success' : current.status === 'simulated' ? 'warning' : 'danger'}>{current.status}</Badge></div><p>{current.summary}</p><div className="walk-actions"><Button onClick={() => openStep(step)} icon="play">{active ? 'Resume this step' : 'Start guided demo'}</Button><Button kind="secondary" className={active ? '' : 'disabled'} onClick={() => { setPaused(!paused); setNotice(paused ? 'Guided demo resumed.' : 'Guided demo paused safely.') }} icon={paused ? 'play' : 'clock'}>{paused ? 'Resume' : 'Pause'}</Button><Button kind="ghost" onClick={() => { setActive(false); localStorage.setItem('legalx:guided-active', 'false'); setNotice('Guided demo exited. Your local step is preserved for recovery.') }}>Exit</Button></div><div className="demo-notice"><Icon name={notice.includes('blocked') ? 'alert' : 'check'} size={15} /><span>{notice}</span></div><div className="walk-footer"><div><Button kind="secondary" className={step === 0 ? 'disabled' : ''} onClick={() => { const previous = Math.max(step - 1, 0); openStep(previous) }} icon="arrow">Previous</Button><Button kind="secondary" className={step === DEMO_STEPS.length - 1 ? 'disabled' : ''} onClick={() => { const next = Math.min(step + 1, DEMO_STEPS.length - 1); openStep(next) }} icon="arrow">Next</Button></div><Button kind="ghost" onClick={reset} icon="refresh">Reset local demo safely</Button></div></section><ScenarioList steps={DEMO_STEPS} current={step} visited={visited} onOpen={openStep} /></div><div className="panel demo-network-panel"><span className="section-kicker">FAILURE REHEARSAL</span><h3>Network and provider guardrails.</h3><p>Exercise the honest failure path. These controls are local-only; they never fake a successful API, AI, upload, export, wallet, or transaction.</p><div className="demo-network-actions"><Button kind={networkMode === 'offline' ? 'danger' : 'secondary'} onClick={() => setNetwork(networkMode === 'offline' ? 'normal' : 'offline')} icon="alert">{networkMode === 'offline' ? 'Clear offline mode' : 'Simulate offline'}</Button><Button kind={networkMode === 'slow' ? 'primary' : 'secondary'} onClick={() => setNetwork(networkMode === 'slow' ? 'normal' : 'slow')} icon="clock">{networkMode === 'slow' ? 'Clear slow mode' : 'Simulate slow network'}</Button></div><small className="demo-mode-label">Current: {networkMode === 'normal' ? 'normal network' : networkMode === 'slow' ? 'slow network · pending only' : 'offline · blocked operations'}</small></div><div className="demo-boundary-grid"><div className="panel"><span className="section-kicker">RECOVERY</span><h3>Nothing is hidden when something fails.</h3><p>Refreshes preserve the guided step. Accidental navigation can return here through the resume banner. This static demo has no expiring live session, API request, upload, or transaction to silently claim succeeded.</p></div><div className="panel"><span className="section-kicker">JUDGE PROMPT</span><h3>Ask “what is real?”</h3><p>Real: the shared UI, route policy, local parity state, role boundaries, and deterministic tests. Simulated or blocked: AI, storage, database, wallet, blockchain, and production authorization.</p></div></div></main><Footer /></div>
}

function Onboarding({ onNavigate, onRoleChange }: { onNavigate: (p: string) => void; onRoleChange: (role: Role) => void }) { const stored = readStoredProfile(); const [step, setStep] = useState(1); const [selected, setSelected] = useState<Role>(() => stored?.role || (localStorage.getItem('legalx:role') as Role) || 'owner'); const choices: [Role, string][] = [['owner', 'Agreement owner'], ['freelancer', 'Freelancer / contractor'], ['legal_reviewer', 'Legal reviewer'], ['org_admin', 'Organization admin'], ['technical_auditor', 'Technical auditor']]; const confirmRole = () => { const profile = readStoredProfile() || defaultProfile(selected); saveProfile({ ...profile, role: selected }); localStorage.setItem('legalx:role', selected); onRoleChange(selected) }; return <div className="onboarding folio-onboarding"><header><Logo /><ThemeToggle /></header><div className="onboarding-card panel">{step === 1 && <><Badge tone="crimson">WELCOME TO LEGALX</Badge><h1>Set up your review desk.</h1><p>LEGALX is one connected workspace. Your role changes what you can see and do without duplicating the product.</p><Button onClick={() => setStep(2)} icon="arrow">Choose your role</Button><button className="skip" onClick={() => onNavigate('/app')}>Skip for now</button></>}{step === 2 && <><span className="section-kicker">STEP 1 OF 2</span><h1>What is your responsibility?</h1><p>Choose a demo identity. Your name, email, and workspace stay connected while the role changes permissions.</p><div className="choice-grid role-choice-grid">{choices.map(([role, label]) => <button key={role} aria-pressed={selected === role} className={selected === role ? 'selected' : ''} onClick={() => setSelected(role)}><span>{ROLE_LABELS[role][0]}</span>{label}<small>{ROLE_DESCRIPTIONS[role]}</small></button>)}</div><Button onClick={() => { confirmRole(); setStep(3) }} icon="arrow">Continue as {ROLE_LABELS[selected]}</Button></>}{step === 3 && <><span className="section-kicker">STEP 2 OF 2</span><h1>Your review desk is ready.</h1><p>You are entering the shared {readStoredProfile()?.workspaceName || 'Acme Digital'} workspace as <b>{ROLE_LABELS[selected]}</b>. Unauthorized agreement, financial, and admin data stays blocked.</p><div className="onboarding-perks"><span><Icon name="shield" size={16} /> Deny-by-default access checks</span><span><Icon name="database" size={16} /> Same agreement, role-specific view</span><span><Icon name="scan" size={16} /> Audit evidence stays immutable</span></div><Button onClick={() => { confirmRole(); onNavigate('/app') }} icon="arrow">Enter role dashboard</Button></>}</div><div className="onboarding-progress"><i className={step >= 1 ? 'on' : ''} /><i className={step >= 2 ? 'on' : ''} /><i className={step >= 3 ? 'on' : ''} /></div></div> }function InfoPage({ kind }: { kind: 'privacy' | 'terms' }) { const title = kind === 'privacy' ? 'Privacy, in plain language.' : 'Terms for a prototype product.'; return <div className="marketing"><PublicNav active="" /><main className="info-page folio-policy"><span className="section-kicker">LEXORA · {kind.toUpperCase()}</span><h1>{title}</h1><p className="info-lede">LEGALX is a product prototype. This page describes the boundaries of the experience while the production legal and privacy documents are prepared.</p><div className="info-grid"><section><h2>{kind === 'privacy' ? 'What we collect in this prototype' : 'What this prototype is'}</h2><p>Demo inputs and preferences are stored in this browser. In an authenticated workspace, the service processes agreement records and records version and approval activity.</p><h2>{kind === 'privacy' ? 'What we do not do' : 'Important limitations'}</h2><p>We do not claim legal correctness, enforceability, real blockchain execution, or live AI processing. Never paste private keys, seed phrases, or sensitive production agreements into the demo.</p></section><aside className="panel info-aside"><Icon name="shield" size={22} /><b>Trust boundary</b><span>Technical verification can show consistency. It cannot replace legal advice or decide legal liability.</span></aside></div></main><Footer /></div> }
function AgreementDetail({ role = 'owner', onNavigate, workflow }: { role?: Role; onNavigate: (p: string) => void; workflow?: WorkflowState }) {
  const w = workflow || readWorkflow();
  const restricted = maskFinancials(role);
  const ir = w.ir as any;
  const total = restricted ? 'Restricted' : (ir ? ('₹'+Number(ir.total_amount||0).toLocaleString('en-IN')) : '₹50,000');
  const d1 = restricted ? 'Restricted' : (ir?.milestones?.[0] ? ('₹'+Number(ir.milestones[0].amount||0).toLocaleString('en-IN')) : '₹20,000');
  const d2 = restricted ? 'Restricted' : (ir?.milestones?.[1] ? ('₹'+Number(ir.milestones[1].amount||0).toLocaleString('en-IN')) : '₹30,000');
  const exportAgreement = () => { const guard = guardDemoOperation('agreement export'); if (!guard.allowed) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: guard.message })); return } const body = 'LEGALX DEMO AGREEMENT\n\nFreelance Website Development Agreement\nVersion: '+(ir?.version || 'v1.2')+'\nTotal: '+total+'\nMilestone 1: '+d1+'\nMilestone 2: '+d2+'\nValidation: '+w.validation.status+'\nParity: '+w.parity.status+'\nApproval: '+w.approval.status+'\nExecution: '+w.execution.status+' - '+w.execution.reason+'\n'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' })); a.download = 'legalx-website-project-'+(ir?.version || 'v1.2')+'.txt'; a.click(); window.setTimeout(() => { URL.revokeObjectURL(a.href); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Agreement export confirmed locally · simulated file download only' })) }, 0) };
  const exec = w.execution;
  const versions = Array.isArray((w as any).versionHistory) ? (w as any).versionHistory : [];
  const audit = getAuditTrail(w as any);
  const auditVerify = verifyAuditTrail(w as any);
  const metadata = [
    ['Agreement ID', (ir?.agreement_id || 'AGR-WEB-001')],
    ['Agreement type', (ir?.agreement_type || 'freelance_milestone')],
    ['Parties', `${ir?.parties?.client || 'Client'} ↔ ${ir?.parties?.provider || 'FreelanceDeveloper'}`],
    ['Currency', ir?.currency || 'INR'],
    ['Total amount', total],
    ['Review period', ir ? `${ir.review_period_days} days` : '5 days'],
    ['Dispute behavior', ir?.dispute_behavior || 'freeze_affected_payment'],
    ['Current IR version', ir?.version || '—'],
    ['Validation', w.validation.status],
    ['Parity', `${w.parity.status}${w.parity.mismatches?.length ? ` (${w.parity.mismatches.join(', ')})` : ''}`],
    ['Approval', w.approval.status],
    ['Execution readiness', `${exec.status}: ${exec.reason}`],
    ['Versions recorded', String(versions.length)],
    ['Audit integrity', auditVerify.valid ? `verified (${auditVerify.count} events)` : `issues (${auditVerify.issues.length})`],
  ];
  const timeline = [
    { t: 'Agreement captured', d: 'Demo/local record with source-grounded metadata', s: 'success' },
    { t: 'Contract IR & validation', d: `IR ${ir?.version || '—'} · ${w.validation.status}`, s: w.validation.status==='valid'?'success':'warning' },
    { t: 'Parity verification', d: w.parity.status, s: w.parity.status==='matched'?'success':w.parity.status==='mismatched'?'danger':'warning' },
    { t: 'Human approval', d: w.approval.status + (w.approval.by? ` by ${w.approval.by}`:''), s: w.approval.status==='approved'?'success':w.approval.status==='blocked'?'danger':'warning' },
    { t: 'Audit trail', d: auditVerify.valid ? 'Hash chain verified (local)' : 'Integrity issues detected', s: auditVerify.valid?'success':'danger' },
  ];
  return <div className="lx-agreement-detail">
    <PageHeader eyebrow="AGREEMENT DETAIL · DOSSIER" title="Website project" desc="Review the sample agreement, its commercial terms and current approval record." action="Run parity" onAction={() => onNavigate('/app/parity')} />
    <section className="panel lx-hero-panel" style={{marginBottom:14}}>
      <div>
        <span className="section-kicker">AGREEMENT DOSSIER</span>
        <h2>Freelance website development</h2>
        <p className="muted">Client ↔ {ir?.parties?.provider || 'Freelance developer'} · {ir?.agreement_type || 'freelance_milestone'} · IR {ir?.version || '—'}</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><Badge tone={exec.status==='ready'?'success':w.parity.status==='mismatched'||w.validation.status==='invalid'?'danger':'warning'}>{exec.status==='ready'?'Execution ready (demo)':'Execution not ready'}</Badge><Badge tone={auditVerify.valid?'success':'danger'}>Audit {auditVerify.valid?'verified':'check'}</Badge><Badge tone="neutral">{versions.length} version(s)</Badge></div>
      </div>
      <div className="lx-readiness-card">
        <span className="section-kicker">FINANCIAL SUMMARY</span>
        <div className="ir-big">{total} <small>{ir?.currency || 'INR'} total</small></div>
        <div className="mini-legend"><span><i />{d1} · Design</span><span><i />{d2} · Development</span></div>
        <p className="muted" style={{marginTop:10}}>{exec.reason}</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}><Button kind="secondary" icon="download" onClick={exportAgreement}>Export agreement</Button><Button kind="secondary" icon="database" onClick={()=>onNavigate('/app/contract-ir')}>Open IR</Button></div>
      </div>
    </section>
    <div className="lx-dashboard-grid">
      <section className="panel"><div className="panel-head"><div><span className="section-kicker">METADATA</span><h2>Agreement details</h2></div></div><div className="field-table"><div className="field-row head"><span>Field</span><span>Value</span><span></span><span></span></div>{metadata.map(([k,v])=> <div className="field-row" key={k}><code>{k}</code><b style={{gridColumn:'span 3'}}>{String(v)}</b></div>)}</div></section>
      <aside className="panel lx-timeline-panel"><div className="panel-head"><div><span className="section-kicker">LIFECYCLE & PROCESSING</span><h2>Timeline</h2></div></div><div className="activity-log">{timeline.map((x,i)=><div className="activity-row" key={i}><span className={`timeline-icon ${x.s}`}><Icon name={x.s==='success'?'check':x.s==='danger'?'alert':'clock'} size={15} /></span><div><b>{x.t}</b><p>{x.d}</p></div><Badge tone={x.s as any}>{x.s}</Badge></div>)}</div></aside>
    </div>
    <div className="panel" style={{marginTop:14}}><div className="panel-head"><div><span className="section-kicker">ACTIONS</span><h2>Workflow navigation</h2></div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button onClick={()=>onNavigate('/app/parity')} icon="scan">Parity Studio</Button><Button kind="secondary" onClick={()=>onNavigate('/app/team')} icon="users">Open team review</Button><Button kind="secondary" onClick={()=>onNavigate('/app/smart-contracts')} icon="code">Smart Contracts</Button><Button kind="secondary" onClick={()=>onNavigate('/app/activity')} icon="clock">Audit/Activity</Button></div></div>
  </div>;
}

function Profile({ role }: { role: Role }) { const account = effectiveAccount(role); const stored = readStoredProfile() || { ...defaultProfile(role), name: account.name, email: account.email, workspaceName: account.workspaceName }; const [editing, setEditing] = useState(false); const [name, setName] = useState(stored.name); const [email, setEmail] = useState(stored.email); const [workspaceName, setWorkspaceName] = useState(stored.workspaceName); const [jobTitle, setJobTitle] = useState(stored.jobTitle); const [useCase, setUseCase] = useState(stored.useCase); const save = () => { saveProfile({ ...stored, role, name, email, workspaceName, jobTitle, useCase }); setEditing(false); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Profile saved locally. The new identity is now used across the workspace.' })) }; return <div><PageHeader eyebrow="PROFILE" title={name} desc="Your role and workspace identity, kept clear for every review handoff." action={editing ? 'Save profile' : 'Edit profile'} onAction={editing ? save : () => setEditing(true)} /><div className="profile-grid"><div className="panel profile-card">{editing ? <div className="form-grid"><label>Full name<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Workspace name<input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} /></label><label>Job title<input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label><label>Primary use case<select value={useCase} onChange={(e) => setUseCase(e.target.value)}><option>Freelance agreements</option><option>Agency retainers</option><option>Startup vendor contracts</option></select></label></div> : <><div className="profile-hero"><span className="profile-avatar">{account.initials}</span><div><h2>{account.name}</h2><p>{jobTitle} · {account.workspaceName}</p></div></div><div className="profile-facts"><span><small>EMAIL</small><b>{account.email}</b></span><span><small>ACTIVE ROLE</small><b>{ROLE_LABELS[role]}</b></span><span><small>MEMBER SINCE</small><b>November 2026</b></span><span><small>USE CASE</small><b>{useCase}</b></span></div></>}</div><div className="panel profile-card"><span className="section-kicker">ACCOUNT SAFETY</span><h2>Account details</h2><p className="muted">Profile settings are local in this prototype. Every name and workspace change is reflected in the shell, activity records, and role handoffs.</p><div className="permission"><Icon name="lock" size={16} /><span>Production authentication <b>Not connected</b></span></div><div className="permission"><Icon name="wallet" size={16} /><span>Connected wallet <b>None</b></span></div><div className="permission"><Icon name="download" size={16} /><span>Data export <b>Available locally</b></span></div></div></div></div> }function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [role, setRole] = useState<Role>(() => (localStorage.getItem('legalx:role') as Role) || readStoredProfile()?.role || 'owner')
  const [, setStateVersion] = useState(0)
  useEffect(() => { const handler = () => setPath(window.location.pathname); window.addEventListener('popstate', handler); return () => window.removeEventListener('popstate', handler) }, [])
  useEffect(() => { const handler = () => setStateVersion((version) => version + 1); window.addEventListener('legalx:state', handler); return () => window.removeEventListener('legalx:state', handler) }, [])
  const onNavigate = (p: string) => go(p)
  const onRoleChange = (next: Role) => { setRole(next); localStorage.setItem('legalx:role', next); const profile = readStoredProfile(); if (profile) saveProfile({ ...profile, role: next }); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Switched to ' + ROLE_LABELS[next] + ' · permissions recalculated.' })) }
  const publicPages = ['/', '/product', '/how-it-works', '/solutions', '/security', '/pricing', '/about', '/faq', '/contact']
  if (path === '/product') return <Landing page='/product' />; if (publicPages.includes(path)) return <Landing page={path} />; if (path === '/privacy') return <InfoPage kind="privacy" />; if (path === '/terms') return <InfoPage kind="terms" />; if (path === '/sign-in') return <Auth mode="sign-in" />; if (path === '/sign-up') return <Auth mode="sign-up" />; if (path === '/demo') return <DemoControlCenter onNavigate={onNavigate} onRoleChange={onRoleChange} />; if (path === '/onboarding') return <Onboarding onNavigate={onNavigate} onRoleChange={onRoleChange} />; if (routes.includes(path) || path.startsWith('/app/')) return <AppShell path={path} role={role} onNavigate={onNavigate} onRoleChange={onRoleChange} />; return <Landing page="/" />
}

export default App
