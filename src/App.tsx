import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_ACCOUNTS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_NAV, type Role, canAccessRoute, hasPermission, maskFinancials } from './rbac'
import { AI_DRAFT_KEY, INVITES_KEY, MILESTONES_KEY, NOTIFICATIONS_KEY, WALLET_KEY, WORKFLOW_KEY, DEFAULT_WORKFLOW, defaultProfile, deriveExecution, effectiveAccount, readJson, readSettings, readStoredProfile, readText, readWorkflow, saveProfile, saveSettings, writeJson, writeText, writeWorkflow, type DemoSettings, type WorkflowState } from './demo-state'
import { generateSolidity, runGenerationTests } from './solidity'
import { buildClausesFromIr, deriveTraceability, diffIrs, affectedFromDiff, type TraceabilityRow } from './traceability'
import { computeDrift, detectAndApplyDrift, ensureIntegrityFields, getAuditTrail, hashIr, hashSolidity, logEvent, recordVersion, snapshotApproved, verifyAuditTrail } from './workflow-integrity'

type IconName = 'arrow' | 'spark' | 'shield' | 'file' | 'code' | 'scan' | 'check' | 'alert' | 'clock' | 'lock' | 'copy' | 'play' | 'chevron' | 'plus' | 'link' | 'menu' | 'x' | 'search' | 'bell' | 'settings' | 'users' | 'grid' | 'list' | 'wallet' | 'activity' | 'help' | 'logout' | 'download' | 'external' | 'filter' | 'refresh' | 'edit' | 'trash' | 'rocket' | 'layers' | 'calendar' | 'database' | 'command'
type IconProps = { name: IconName; size?: number; stroke?: number }
const iconPaths: Record<IconName, string> = {
  arrow: 'M5 12h14M13 6l6 6-6 6', spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 14 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z', shield: 'M12 3 20 6v5c0 5.1-3.4 8.7-8 10-4.6-1.3-8-4.9-8-10V6l8-3Z', file: 'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 13h6M9 17h4', code: 'm8 9-3 3 3 3m8-6 3 3-3 3m-3-8-2 10', scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3', check: 'm5 12 4 4L19 6', alert: 'M12 4 21 20H3L12 4Zm0 5v5m0 3h.01', clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', lock: 'M6 10h12v10H6V10Zm3 0V7a3 3 0 0 1 6 0v3', copy: 'M8 8h10v12H8V8Zm-3 8H4V4h10v1', play: 'm9 6 9 6-9 6V6Z', chevron: 'm9 18 6-6-6-6', plus: 'M12 5v14M5 12h14', link: 'M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1L10.6 5.4m3.4 5.2a5 5 0 0 0-7.1-.1l-1.4 1.4a5 5 0 0 0 7.1 7.1l.8-.8', menu: 'M4 7h16M4 12h16M4 17h16', x: 'M6 6l12 12M18 6 6 18', search: 'm21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z', bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4', settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7.4 7.4 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.9 3h-4l-.4 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3.1h4l.4-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z', users: 'M16 20v-1.5a4.5 4.5 0 0 0-9 0V20m4.5-7a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm5.5-6a3 3 0 0 1 0 5.8M19 20v-1a4 4 0 0 0-2-3.5', grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', wallet: 'M4 7h16v13H4zM4 7l2-3h12l2 3M16 13h4', activity: 'M4 18h3V9H4v9Zm6 0h3V4h-3v14Zm6 0h3v-6h-3v6Z', help: 'M9.1 9a3 3 0 1 1 5.3 1.9c-.9.8-2.4 1.3-2.4 2.6M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', logout: 'M10 17l5-5-5-5m5 5H3m11-8V4h6v16h-6v-3', download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 20h16', external: 'M14 5h5v5m0-5-8 8m-6 6H4V4h10', filter: 'M4 6h16M7 12h10m-7 6h4', refresh: 'M20 11a8 8 0 1 0 1 4M20 11V5m0 6h-6', edit: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z', trash: 'M4 7h16M10 11v6m4-6v6M9 7V4h6v3m-9 0 1 13h10l1-13', rocket: 'M4 16c-1 3 0 4 3 3l2-2m7-12c3-.8 5.2.2 5 3.5-.2 3.7-3.6 7.7-9.2 10.4l-3.2-3.2C11.3 10 15.3 6.6 19 6Zm-7 6 2 2', layers: 'M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5', calendar: 'M5 4h14v16H5zM8 2v4m8-4v4M5 9h14', database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6', command: 'M18 15l3-3-3-3M6 9l-3 3 3 3m8-8-4 10',
}
function Icon({ name, size = 18, stroke = 1.8 }: IconProps) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg> }

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
function applyTheme(theme: Theme) { document.documentElement.dataset.theme = theme; try { window.localStorage.setItem(THEME_KEY, theme) } catch { /* best effort */ } window.dispatchEvent(new Event('legalx:theme')) }
function ThemeToggle() { const [theme, setTheme] = useState<Theme>(() => readTheme()); useEffect(() => { const saved = readTheme(); document.documentElement.dataset.theme = saved; setTheme(saved); const handler = () => setTheme(readTheme()); window.addEventListener('legalx:theme', handler); return () => window.removeEventListener('legalx:theme', handler) }, []); const next = theme === 'light' ? 'dark' : 'light'; return <button className="theme-toggle" type="button" aria-label={`Switch to ${next} mode`} aria-pressed={theme === 'dark'} onClick={() => { setTheme(next); applyTheme(next) }}><span className="theme-toggle-track" aria-hidden="true"><span /></span><span>{theme === 'light' ? 'Light' : 'Dark'}</span></button> }
function Logo({ light = false }: { light?: boolean }) { return <a className="logo" href="/" onClick={(e) => { e.preventDefault(); go('/') }}><span className="logo-mark"><span className="logo-monogram">LX</span></span><span className={light ? 'logo-name light' : 'logo-name'}>LEGAL<span>X</span><small>BY LEXORA</small></span></a> }
function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'crimson' }) { return <span className={`badge ${tone}`}><i />{children}</span> }
function Button({ children, kind = 'primary', onClick, icon, className = '' }: { children: React.ReactNode; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; onClick?: () => void; icon?: IconName; className?: string }) { const handleClick = onClick ?? (() => window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'This action is simulated in the prototype.' }))); const disabled = className.split(' ').includes('disabled'); return <button type="button" className={`btn ${kind} ${className}`} disabled={disabled} aria-busy={disabled || undefined} onClick={handleClick}>{children}{icon && <Icon name={icon} size={15} />}</button> }

function PublicNav({ active = '' }: { active?: string }) {
  const [open, setOpen] = useState(false);
  const links: [string, string][] = [['Product', '/product'], ['How it works', '/how-it-works'], ['Solutions', '/solutions'], ['Security', '/security'], ['Pricing', '/pricing']];
  return <header className="public-nav lx-public-nav">
    <div className="lx-nav-inner">
      <Logo />
      <nav className={open ? 'public-links open lx-public-links' : 'public-links lx-public-links'} aria-label="Primary">
        {links.map(([label, path]) => <a className={active === path ? 'active' : ''} key={path} href={path} onClick={(e) => { e.preventDefault(); setOpen(false); go(path) }}>{label}</a>)}
        <a href="/sign-in" onClick={(e) => { e.preventDefault(); setOpen(false); go('/sign-in') }}>Sign in</a>
      </nav>
      <div className="lx-nav-actions">
        <ThemeToggle />
        <Button onClick={() => go('/sign-up')} icon="arrow">Get started</Button>
        <button type="button" className="nav-menu" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} /></button>
      </div>
    </div>
  </header>;
}
function Footer() {
  return <footer className="public-footer lx-footer">
    <div className="lx-footer-grid">
      <div className="lx-footer-brand">
        <Logo light />
        <p>Human agreements. Structured intelligence. Executable trust — with evidence, review, and parity before execution.</p>
        <div className="lx-footer-badges"><span><Icon name="shield" size={14} /> Human approval first</span><span><Icon name="scan" size={14} /> Parity before execution</span></div>
      </div>
      <div><b>Product</b><a href="/product" onClick={e=>{e.preventDefault();go('/product')}}>Product</a><a href="/how-it-works" onClick={e=>{e.preventDefault();go('/how-it-works')}}>How it works</a><a href="/demo" onClick={e=>{e.preventDefault();go('/demo')}}>Guided demo</a><a href="/app/parity" onClick={e=>{e.preventDefault();go('/app/parity')}}>Parity Engine</a></div>
      <div><b>Company</b><a href="/about" onClick={e=>{e.preventDefault();go('/about')}}>About Lexora</a><a href="/security" onClick={e=>{e.preventDefault();go('/security')}}>Security & trust</a><a href="/contact" onClick={e=>{e.preventDefault();go('/contact')}}>Contact</a></div>
      <div><b>Resources</b><a href="/solutions" onClick={e=>{e.preventDefault();go('/solutions')}}>Solutions</a><a href="/pricing" onClick={e=>{e.preventDefault();go('/pricing')}}>Pricing</a><a href="/faq" onClick={e=>{e.preventDefault();go('/faq')}}>FAQ</a></div>
      <div className="lx-footer-note"><b>Prototype note</b><p>Product prototype. Blockchain execution and external AI credentials are not connected in this demo. Outputs shown are demo/local and must be reviewed.</p></div>
    </div>
    <div className="footer-bottom lx-footer-bottom"><span>© 2026 Lexora. Built for people who make deals.</span><span><a href="/privacy" onClick={(e) => { e.preventDefault(); go('/privacy') }}>Privacy</a> · <a href="/terms" onClick={(e) => { e.preventDefault(); go('/terms') }}>Terms</a> · Blockchain can execute terms. It cannot replace legal advice.</span></div>
  </footer>;
}

﻿function useReveal() {
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return { ref, seen };
}
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, seen } = useReveal();
  return <div ref={ref} className={`lx-reveal ${seen ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
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
  const [playing, setPlaying] = useState(true);
  const [extractStep, setExtractStep] = useState(0);
  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setPlaying(false); setExtractStep(4); return; }
    if (!playing) return;
    const t = window.setInterval(() => setActive(i => (i + 1) % stages.length), 2600);
    return () => window.clearInterval(t);
  }, [playing]);
  useEffect(() => {
    if (active !== 1) { setExtractStep(active > 1 ? 4 : 0); return; }
    setExtractStep(0);
    const timers = [300,700,1100,1500].map((ms,idx)=>window.setTimeout(()=>setExtractStep(idx+1),ms));
    return () => timers.forEach(window.clearTimeout);
  }, [active]);
  const current = stages[active];
  const fields = [
    { k: 'total_amount', v: 'â‚¹50,000', ok: extractStep >= 1 },
    { k: 'milestone_1', v: 'â‚¹20,000 Â· design', ok: extractStep >= 2 },
    { k: 'milestone_2', v: 'â‚¹30,000 Â· delivery', ok: extractStep >= 3 },
    { k: 'review/dispute', v: '5 days Â· freeze', ok: extractStep >= 4 },
  ];
  const parityRows = [
    { label: 'Total amount', ir: 'â‚¹50,000', ex: 'â‚¹50,000', ok: true },
    { label: 'Milestones', ir: '20k + 30k', ex: '20k + 30k', ok: true },
    { label: 'Review window', ir: '5 days', ex: '5 days', ok: true },
    { label: 'Dispute behavior', ir: 'freeze', ex: 'freeze', ok: true },
  ];
  return <div className="lx-showcase lx-showcase-rich">
    <div className="lx-showcase-rail" aria-label="Agreement to contract workflow">
      {stages.map((s, i) => <button key={s.id} type="button" className={`lx-stage ${i===active?'active':''} ${i<active?'done':''}`} onClick={() => { setActive(i); setPlaying(false); }}>
        <span className="lx-stage-dot"><Icon name={i<active?'check':s.icon} size={14} /></span>
        <span className="lx-stage-label">{s.label}</span>
      </button>)}
      <div style={{display:'flex',gap:8,marginTop:8}}><Button kind="secondary" onClick={()=>setPlaying(p=>!p)} icon={playing?'clock':'play'}>{playing?'Pause':'Play'}</Button></div>
    </div>
    <div className="lx-showcase-panel">
      <div className="lx-showcase-head"><Badge tone="crimson">SIGNATURE DEMO Â· LOCAL/DETERMINISTIC</Badge><span className="muted">Stage {active+1}/{stages.length} Â· {current.label}</span></div>
      <div className="lx-showcase-body">
        <div className="lx-showcase-main">
          <span className="section-kicker">CURRENT STAGE</span>
          <h3><Icon name={current.icon} size={18} /> {current.label}</h3>
          <p>{current.detail}</p>
          <div className="lx-progress-track" aria-hidden="true"><div className="lx-progress-fill" style={{width:`${((active+1)/stages.length)*100}%`}} /></div>
        </div>
        <div className="lx-demo-canvas">
          <div className="lx-demo-col">
            <div className={`lx-demo-card ${active===0?'hl':''}`}><small>AGREEMENT INPUT</small><p>Client wants a website for <mark className={extractStep>=1?'on':''}>â‚¹50,000</mark>. Pay <mark className={extractStep>=2?'on':''}>â‚¹20,000 after design approval</mark> and <mark className={extractStep>=3?'on':''}>â‚¹30,000 on delivery</mark>. Client has <mark className={extractStep>=4?'on':''}>5 days to review</mark> each milestone. If there is a disagreement, <mark className={extractStep>=4?'on':''}>freeze the payment</mark>.</p></div>
            <div className={`lx-demo-card ${active===1?'hl':''}`}><small>PROGRESSIVE EXTRACTION</small><div className="lx-field-list">{fields.map(f=> <div key={f.k} className={`lx-field ${f.ok?'ok':''}`}><code>{f.k}</code><b>{f.ok?f.v:'extractingâ€¦'}</b><Badge tone={f.ok?'success':'warning'}>{f.ok?'found':'pending'}</Badge></div>)}</div></div>
          </div>
          <div className="lx-demo-connect" aria-hidden="true">
            <svg viewBox="0 0 120 260" className="lx-connect-svg">
              <path d="M10 40 C60 40,60 90,110 90" className={`lx-path ${active>=1?'on':''}`} />
              <path d="M110 90 C60 90,60 140,10 140" className={`lx-path ${active>=2?'on':''}`} />
              <path d="M10 140 C60 140,60 190,110 190" className={`lx-path ${active>=3?'on':''}`} />
              <path d="M110 190 C60 190,60 230,10 230" className={`lx-path ${active>=4?'on':''}`} />
              <circle cx="10" cy="40" r="5" className={`lx-node ${active>=0?'on':''}`} /><circle cx="110" cy="90" r="5" className={`lx-node ${active>=1?'on':''}`} /><circle cx="10" cy="140" r="5" className={`lx-node ${active>=2?'on':''}`} /><circle cx="110" cy="190" r="5" className={`lx-node ${active>=3?'on':''}`} /><circle cx="10" cy="230" r="5" className={`lx-node ${active>=4?'on':''}`} />
            </svg>
          </div>
          <div className="lx-demo-col">
            <div className={`lx-demo-card ${active===2||active===3?'hl':''}`}><small>CONTRACT IR (CANONICAL)</small><pre className="lx-mini-code">{`{\n  "agreement_type": "freelance_milestone",\n  "total_amount": 50000,\n  "milestones": [20000, 30000],\n  "review_period_days": 5,\n  "dispute_behavior": "freeze"\n}`}</pre><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><Badge tone={active>=3?'success':'warning'}>Validation {active>=3?'valid':'pending'}</Badge><Badge tone={active>=2?'success':'neutral'}>IR {active>=2?'structured':'â€”'}</Badge></div></div>
            <div className={`lx-demo-card ${active===4?'hl':''}`}><small>PARITY VERIFICATION</small><div className="lx-compare-mini">{parityRows.map(r=> <div key={r.label} className={`lx-cmp ${r.ok?'ok':'bad'}`}><span>{r.label}</span><b>{r.ir}</b><em>{r.ok?'MATCH':'MISMATCH'}</em></div>)}</div><div className={`lx-gate ${active>=4?'ok':'wait'}`}><Icon name={active>=4?'check':'scan'} size={14}/> {active>=4?'No blocking mismatches (demo)':'Awaiting verification'}</div></div>
            <div className={`lx-demo-card ${active===5?'hl':''}`}><small>HUMAN APPROVAL GATE</small><div className={`lx-gate ${active>=5?'ok':'wait'}`}><Icon name={active>=5?'shield':'lock'} size={14}/> {active>=5?'Approved for generation (demo/local)':'Awaiting review & explicit approval'}</div><p className="muted" style={{margin:'8px 0 0'}}>Material drift invalidates stale approval and requires re-review.</p></div>
            <div className={`lx-demo-card ${active===6?'hl':''}`}><small>SOLIDITY GENERATION</small><pre className={`lx-mini-code ${active===6?'reveal':''}`}>{active>=6 ? `contract LexoraMilestoneEscrow {\n  uint256 total = 50000;\n  uint16 reviewDays = 5;\n  bool disputeFreeze = true;\n  // generated from validated, approved IR\n}` : '// Generate after validation + parity + approval'}</pre></div>
          </div>
        </div>
      </div>
      <div className="lx-showcase-foot"><span><Icon name="database" size={14} /> Existing deterministic demo data/workflow</span><span><Icon name="alert" size={14} /> No real AI/blockchain execution claimed</span></div>
    </div>
  </div>;
}

function Landing({ page = '/' }: { page?: string }) {
  const [pricing, setPricing] = useState<'explore' | 'build'>('build');
  const hero = page === '/product'
    ? { eyebrow: 'PRODUCT Â· LEGALX', title: <>An immersive workspace<br /><em>for inspectable agreements.</em></>, desc: 'Draft, structure, validate, compare, approve, and generate from one canonical Contract IR â€” with evidence and gates at every step.' }
    : page === '/how-it-works'
    ? { eyebrow: 'HOW IT WORKS', title: <>A visual journey from<br /><em>words to guarded execution.</em></>, desc: 'Agreement â†’ Extraction â†’ Contract IR â†’ Validation â†’ Parity â†’ Human Approval â†’ Solidity. Each stage is explicit, reviewable, and blockable.' }
    : page === '/solutions'
    ? { eyebrow: 'SOLUTIONS', title: <>Distinct workflows for<br /><em>real milestone work.</em></>, desc: 'Freelancers, agencies, startups, and businesses share the same trust primitives â€” tailored to different operating realities.' }
    : page === '/security'
    ? { eyebrow: 'SECURITY & TRUST', title: <>Trust architecture,<br /><em>made inspectable.</em></>, desc: 'Human approval, provenance, validation, parity, execution gates, and audit trails â€” presented honestly, without fabricated certifications.' }
    : page === '/pricing'
    ? { eyebrow: 'PRICING Â· PROTOTYPE', title: <>Compare plans with<br /><em>clear boundaries.</em></>, desc: 'Prototype/demo intent vs future integrated capabilities. No fabricated commercial commitments or production guarantees.' }
    : { eyebrow: 'SMART CONTRACT CREATION Â· PS-03', title: <>The agreement is<br />human. The trust is<br /><em>executable.</em></>, desc: 'LEGALX turns ordinary English or Hinglish deal descriptions into structured, verifiable contracts â€” with parity checks and human approval before execution.' };

  return <div className={`marketing lx-marketing lx-page-${(page||'/').replace(/\//g,'-').replace(/^-/, '') || 'home'}`}>
    <PublicNav active={page} />
    <main>
      <section className={`lx-hero lx-hero-${(page||'/').replace(/\//g,'-').replace(/^-/, '') || 'home'}`}>
        <div className="lx-hero-bg" aria-hidden="true"><span className="lx-grid" /><span className="lx-grain" /><span className="lx-orb o1" /><span className="lx-orb o2" /><span className="lx-geo g1" /><span className="lx-geo g2" /></div>
        <div className="lx-hero-inner">
          <div className="lx-hero-copy">
            <Badge tone="crimson">{hero.eyebrow}</Badge>
            <h1 className="lx-hero-title">{hero.title}</h1>
            <p className="lx-hero-desc">{hero.desc}</p>
            <div className="hero-actions lx-hero-actions"><Button onClick={() => go('/sign-up')} icon="arrow">Build an agreement</Button><Button kind="secondary" onClick={() => go('/demo')} icon="play">Start guided demo</Button><Button kind="ghost" onClick={() => go('/how-it-works')} icon="chevron">See the journey</Button></div>
            <div className="lx-hero-trust"><span><Icon name="shield" size={15} /> Human approval first</span><span><Icon name="scan" size={15} /> Parity before execution</span><span><Icon name="lock" size={15} /> Demo/local, reviewable</span></div>
          </div>
          <div className="lx-hero-visual" aria-label="LEGALX workflow preview">
            <div className="lx-device">
              <div className="lx-device-head"><span><span className="live-dot" /> WORKFLOW PREVIEW</span><Badge tone="success">gated</Badge></div>
              <div className="lx-transform">
                <div className="lx-doc-pane"><small>AGREEMENT INPUT</small><p>â€œWebsite for â‚¹50,000. â‚¹20k after design, â‚¹30k on delivery. 5-day review. Freeze on dispute.â€</p><div className="lx-float-chip c1"><Icon name="spark" size={12} /> extraction</div></div>
                <div className="lx-transform-mid"><span className="lx-pulse-line" /><Icon name="arrow" size={16} /></div>
                <div className="lx-ir-pane"><small>CONTRACT IR</small><div className="lx-ir-row"><span>total</span><b>â‚¹50,000</b></div><div className="lx-ir-row"><span>milestones</span><b>â‚¹20k + â‚¹30k</b></div><div className="lx-ir-row"><span>review</span><b>5 days</b></div><div className="lx-ir-row"><span>dispute</span><b>freeze</b></div><div className="lx-float-chip c2"><Icon name="scan" size={12} /> parity</div><div className="lx-float-chip c3"><Icon name="code" size={12} /> solidity</div></div>
              </div>
              <div className="lx-device-foot"><span><Icon name="database" size={14} /> Canonical IR</span><span><Icon name="shield" size={14} /> Validate</span><span><Icon name="users" size={14} /> Approve</span></div>
            </div>
          </div>
        </div>
      </section>

      {page === '/' && <>
        <Reveal><section className="lx-section lx-showcase-section"><div className="lx-section-head"><span className="section-kicker">SIGNATURE INTERACTIVE DEMO</span><h2>Agreement input to <em>Solidity generation</em>, with gates.</h2><p>Progressive extraction, clause highlighting, validation/parity/approval gates, and Solidity reveal â€” using existing deterministic demo data. No fabricated backend capabilities.</p></div><LandingWorkflowShowcase /></section></Reveal>
        <Reveal><section className="lx-section lx-features"><div className="lx-section-head"><span className="section-kicker">PRODUCT SURFACES</span><h2>Evidence, structure, and control <em>in one system.</em></h2></div><div className="lx-feature-grid">{[['AI Workspace','Extract terms into structured data with clarification and source grounding.','spark'],['Contract IR','Canonical, inspectable fields with provenance and validation state.','database'],['Parity Studio','Compare IR vs execution parameters and block mismatches.','scan'],['Review & Approval','Human-in-the-loop decisions, comments, and reapproval on material drift.','users'],['Traceability','Link clauses, IR, validation, parity, Solidity, tests, and audit evidence.','layers'],['Audit & Versions','Hash-linked local audit trail, snapshots, and version comparison.','activity']].map(([t,d,i],idx)=><Reveal key={t as string} delay={idx*30}><div className="lx-feature-card"><span className="lx-feature-icon"><Icon name={i as IconName} size={18} /></span><h3>{t}</h3><p>{d}</p></div></Reveal>)}</div></section></Reveal>
        <Reveal><section className="lx-section lx-how"><div className="lx-how-grid"><div className="lx-how-copy"><span className="section-kicker">HOW IT WORKS</span><h2>From a sentence<br />to a <em>shared truth.</em></h2><p>Every step leaves an inspectable trail. No invented certainty, no silent approvals, no execution from invalid or unapproved IR.</p><div className="lx-step-list">{[['01','Describe','Agreement text in the words you use.','file'],['02','Structure','Validated Contract IR, not a guess.','database'],['03','Verify','Parity compares outputs independently.','scan'],['04','Approve','Humans decide; mismatches/drift block.','shield'],['05','Generate','Deterministic Solidity from approved IR.','code']].map(([n,t,d,ic],idx)=><Reveal key={n as string} delay={idx*40}><div className="lx-step"><span className="lx-step-n">{n}</span><div><b><Icon name={ic as IconName} size={14}/> {t}</b><p>{d}</p></div></div></Reveal>)}</div></div><div className="lx-how-panel"><div className="showcase-panel"><div className="showcase-panel-head"><span><i className="live-dot" /> PARITY ENGINE</span><b>Independent comparison</b></div><div className="compare-row"><div><small>LEGAL AGREEMENT</small><strong>Review window Â· 5 days</strong></div><span className="match">MATCHED</span><div><small>EXECUTION PARAM</small><strong>reviewWindow Â· 5 days</strong></div></div><div className="compare-row mismatch"><div><small>LEGAL AGREEMENT</small><strong>Dispute â†’ freeze payment</strong></div><span className="mismatch-pill">BLOCKED</span><div><small>EXECUTION LOGIC</small><strong>Dispute â†’ release (tamper)</strong></div></div><div className="showcase-footer"><span><Icon name="alert" size={15}/> Critical mismatch prevents execution</span><strong>Gated</strong></div></div><div className="lx-trust-cards"><div><Icon name="shield" size={16}/><b>RBAC & Judge Mode</b><p>Role-aware access and demo controls preserved.</p></div><div><Icon name="lock" size={16}/><b>Reviewable outputs</b><p>Demo/local labels; no hidden backend claims.</p></div></div></div></div></section></Reveal>
      </>}

      {page === '/product' && <>
        <Reveal><section className="lx-section"><div className="lx-section-head"><span className="section-kicker">IMMERSIVE WORKFLOW DEMONSTRATION</span><h2>From agreement to <em>execution-ready intent</em>.</h2><p>The full LEGALX pipeline, rendered as an interactive, inspectable system â€” not a static mockup.</p></div><LandingWorkflowShowcase /></section></Reveal>
        <Reveal><section className="lx-section lx-product-grid"><div className="lx-section-head"><span className="section-kicker">CORE CAPABILITIES</span><h2>Built around the <em>Contract IR</em>.</h2></div><div className="lx-cap-grid">{[{t:'Canonical Contract IR',d:'One structured source of truth with provenance and evidence references.',i:'database'},{t:'Validation & parity gates',d:'Block invalid/unapproved/mismatched states before execution.',i:'scan'},{t:'Human approval & drift control',d:'Explicit decisions; material drift invalidates stale approvals.',i:'users'},{t:'Traceability & audit',d:'Clause-to-code links and hash-linked local audit trail (not blockchain).',i:'layers'},{t:'Deterministic Solidity generation',d:'Generated from validated, approved IR; compilation/runtime tooling limits stated.',i:'code'},{t:'RBAC & Judge Mode',d:'Five-role access model and honest demo controls preserved.',i:'shield'}].map((x,idx)=><Reveal key={x.t} delay={idx*30}><div className="lx-cap-card"><span className="lx-cap-n">0{idx+1}</span><Icon name={x.i as IconName} size={18}/><h3>{x.t}</h3><p>{x.d}</p></div></Reveal>)}</div></section></Reveal>
      </>}

      {page === '/how-it-works' && <>
        <Reveal><section className="lx-section lx-journey"><div className="lx-section-head"><span className="section-kicker">STEP-BY-STEP VISUAL JOURNEY</span><h2>Seven stages. <em>Explicit gates.</em></h2><p>Scroll the pipeline: each stage is reviewable, auditable, and blockable when conditions are not met.</p></div><div className="lx-journey-line" aria-hidden="true" /><div className="lx-journey-steps">{[{n:'01',t:'Agreement Input',d:'Capture plain English/Hinglish terms as source text.',i:'file',s:'Source-grounded'},{n:'02',t:'Clause Extraction',d:'Deterministically identify amounts, milestones, review window, dispute behavior.',i:'spark',s:'Demo/local extraction'},{n:'03',t:'Contract IR',d:'Produce canonical structured fields with provenance/evidence.',i:'database',s:'Source of truth'},{n:'04',t:'Validation',d:'Enforce schema/rules; surface missing or ambiguous terms.',i:'shield',s:'Blocks invalid states'},{n:'05',t:'Parity Verification',d:'Compare IR vs execution parameters independently.',i:'scan',s:'Mismatch blocks execution'},{n:'06',t:'Human Approval',d:'Require explicit review; material drift forces reapproval.',i:'users',s:'Human gate'},{n:'07',t:'Solidity Generation',d:'Generate deterministic contract from validated, approved IR.',i:'code',s:'No runtime compilation claimed'}].map((x,idx)=><Reveal key={x.n} delay={idx*40}><div className="lx-journey-step"><div className="lx-journey-marker"><span>{x.n}</span><Icon name={x.i as IconName} size={16}/></div><div className="lx-journey-body"><h3>{x.t}</h3><p>{x.d}</p><Badge tone={idx>=4?'warning':'success'}>{x.s}</Badge></div></div></Reveal>)}</div></section></Reveal>
        <Reveal><section className="lx-section"><div className="lx-section-head"><span className="section-kicker">INTERACTIVE PIPELINE</span><h2>Inspect each stage <em>live</em> (demo).</h2></div><LandingWorkflowShowcase /></section></Reveal>
      </>}

      {page === '/solutions' && <>
        <Reveal><section className="lx-section"><div className="lx-section-head"><span className="section-kicker">USE-CASE SOLUTIONS</span><h2>One trust model, <em>four operating realities.</em></h2><p>Distinct compositions for each audience — same canonical IR, parity, approval, and audit primitives.</p></div></section></Reveal>
        <Reveal><section className="lx-section lx-solutions"><div className="lx-solution s-freelancer"><div className="lx-sol-copy"><Badge tone="success">FREELANCERS</Badge><h3>Protect scope, milestones, and payout logic.</h3><p>Turn client agreements into structured milestones with review windows and dispute behavior that can be verified before execution.</p><ul><li>Clear milestone amounts and acceptance windows</li><li>Parity checks against execution parameters</li><li>Evidence and approval trail for disputes</li></ul></div><div className="lx-sol-visual"><div className="lx-sol-card"><small>MILESTONE</small><b>Design approval</b><span>₹20,000 · 5-day review</span><Badge tone="success">Matched</Badge></div><div className="lx-sol-card"><small>MILESTONE</small><b>Delivery</b><span>₹30,000 · freeze on dispute</span><Badge tone="warning">Gated</Badge></div></div></div></section></Reveal>
        <Reveal><section className="lx-section lx-solutions alt"><div className="lx-solution s-agency"><div className="lx-sol-visual"><div className="lx-sol-metric"><b>Multi-party</b><span>Scopes · retainers · approvals</span></div><div className="lx-sol-metric"><b>Parity-first</b><span>Aligned terms before execution</span></div><div className="lx-sol-metric"><b>Audit ready</b><span>Hash-linked local trail</span></div></div><div className="lx-sol-copy"><Badge tone="crimson">AGENCIES</Badge><h3>Coordinate delivery, review, and release.</h3><p>Keep statements of work, retainers, and multi-step approvals aligned across teams with canonical IR and explicit gates.</p><ul><li>Shared source of truth across roles (RBAC)</li><li>Version/drift awareness and reapproval</li><li>Traceability from clause to checks</li></ul></div></div></section></Reveal>
        <Reveal><section className="lx-section lx-solutions"><div className="lx-solution s-startup"><div className="lx-sol-copy"><Badge tone="neutral">STARTUPS</Badge><h3>Move fast without losing <em>inspectability</em>.</h3><p>Standardize vendor and contractor terms into structured, reviewable workflows that scale with governance needs.</p><ul><li>Reusable structured agreement patterns (demo)</li><li>Human approval and execution readiness gates</li><li>Integration-ready API/client boundaries</li></ul></div><div className="lx-sol-visual dark"><div className="lx-sol-code"><small>Contract IR snapshot</small><pre>{`type: service_milestone\ntotal: ₹2,40,000\nreview: 5 days\ndispute: freeze\nstatus: gated`}</pre></div></div></div></section></Reveal>
        <Reveal><section className="lx-section lx-solutions alt"><div className="lx-solution s-business"><div className="lx-sol-visual"><div className="lx-sol-card"><small>GOVERNANCE</small><b>Role-based review</b><span>Owner · Reviewer · Auditor</span></div><div className="lx-sol-card"><small>INTEGRITY</small><b>Drift &amp; versions</b><span>Re-review on material change</span></div></div><div className="lx-sol-copy"><Badge tone="warning">BUSINESSES</Badge><h3>Align legal, ops, and technical teams.</h3><p>Reduce ambiguity with provenance, parity verification, and auditable approval flows before any execution step.</p><ul><li>Explicit permissions and approvals</li><li>Parity and mismatch blocking</li><li>Tamper-evident local audit evidence</li></ul></div></div></section></Reveal>
      </>}

      {page === '/security' && <>
        <Reveal><section className="lx-section"><div className="lx-section-head"><span className="section-kicker">TECHNICAL TRUST ARCHITECTURE</span><h2>Controls, gates, and evidence â€” <em>stated honestly.</em></h2><p>Diagrams of the trust model as implemented in this product prototype. No security certifications or production guarantees claimed.</p></div></section></Reveal>
        <Reveal><section className="lx-section lx-trust-arch"><div className="lx-arch-flow">{[{t:'Human Approval',d:'Explicit reviewer decisions and comments gate progression.',i:'users'},{t:'Evidence Provenance',d:'Source-grounded fields and clause references in Contract IR.',i:'database'},{t:'Validation',d:'Schema/rule checks; invalid states block downstream.',i:'shield'},{t:'Parity',d:'Independent IR vs execution comparison; mismatches block.',i:'scan'},{t:'Execution Gates',d:'No generation/execution from invalid or unapproved IR.',i:'lock'},{t:'Audit Trail',d:'Hash-linked, locally persisted event history (not blockchain).',i:'activity'}].map((x,idx)=><Reveal key={x.t} delay={idx*40}><div className="lx-arch-node"><div className="lx-arch-icon"><Icon name={x.i as IconName} size={18}/></div><h3>{x.t}</h3><p>{x.d}</p>{idx<5 && <span className="lx-arch-arrow" aria-hidden="true">â†’</span>}</div></Reveal>)}</div><div className="prototype-banner" style={{marginTop:18}}><Icon name="alert" size={16}/><span><b>Honest boundaries:</b> Prototype/demo. No fabricated certifications, no external AI credentials, no live blockchain execution or immutable on-chain audit claimed. RBAC in frontend is not production auth.</span></div></section></Reveal>
        <Reveal><section className="lx-section lx-security-grid"><div className="lx-section-head"><span className="section-kicker">TRUST CONTROLS</span><h2>Inspectable by design.</h2></div><div className="lx-feature-grid">{[['Role-based access (RBAC)','Five-role model with route/permission boundaries in demo.','shield'],['Drift & reapproval','Material changes invalidate stale approvals and readiness.','refresh'],['Version history','Snapshots and comparisons preserved; no silent overwrites.','layers'],['Deterministic generation','Solidity from validated, approved IR; tooling limits disclosed.','code']].map(([t,d,i],idx)=><Reveal key={t as string} delay={idx*30}><div className="lx-feature-card"><span className="lx-feature-icon"><Icon name={i as IconName} size={18}/></span><h3>{t}</h3><p>{d}</p></div></Reveal>)}</div></section></Reveal>
      </>}

      {page === '/pricing' && <>
        <Reveal><section className="lx-section"><div className="lx-section-head"><span className="section-kicker">PRICING COMPARISON Â· PROTOTYPE INTENT</span><h2>Clear hierarchy, <em>honest boundaries.</em></h2><p>Select a plan to compare. Describes demo intent vs future integrated capabilities â€” not commercial commitments.</p></div><div className="lx-pricing-compare"><div className="lx-plan-picker"><button type="button" className={pricing==='explore'?'active':''} onClick={()=>setPricing('explore')}>Explore (Demo)</button><button type="button" className={pricing==='build'?'active':''} onClick={()=>setPricing('build')}>Build (Prototype intent)</button></div><div className="lx-compare-grid"><div className={`price-card ${pricing==='explore'?'featured':''}`}><span>Explore</span><strong>Free</strong><small>Demo workspace</small><ul><li>Guided demo & seeded workspace</li><li>Contract IR, parity, traceability views</li><li>Local deterministic generation flows</li><li>RBAC/Judge Mode (demo)</li></ul><Button kind={pricing==='explore'?'primary':'secondary'} onClick={()=>go('/demo')}>Explore demo</Button></div><div className={`price-card ${pricing==='build'?'featured':''}`}><Badge tone="crimson">PROTOTYPE INTENT</Badge><span>Build</span><strong>Coming soon</strong><small>Future integrated team workflows</small><ul><li>Backend-connected IR/review/versioning</li><li>Persistent auth/RBAC & audit integrations</li><li>Supported deployment toolchains</li><li>Production-grade controls (when integrated)</li></ul><Button kind={pricing==='build'?'primary':'secondary'} onClick={()=>go('/contact')}>Talk to Lexora</Button></div></div><div className="lx-compare-table"><div className="lx-cmp-head"><span>Capability</span><span>Explore</span><span>Build (intent)</span></div>{[['Interactive workflow demo','Included','Included'],['Canonical IR & parity views','Included','Included + backend'],['Human approval & audit (local)','Included','Integrated'],['Solidity generation','Deterministic (demo)','Toolchain-integrated'],['Live blockchain execution','Not included','Not claimed here']].map(r=><div key={r[0]} className="lx-cmp-row"><b>{r[0]}</b><span>{r[1]}</span><span>{r[2]}</span></div>)}</div></div></section></Reveal>
      </>}

      {page !== '/' && page !== '/product' && page !== '/how-it-works' && page !== '/solutions' && page !== '/security' && page !== '/pricing' && <Reveal><section className="lx-section"><div className="panel" style={{maxWidth:980,margin:'0 auto'}}><span className="section-kicker">PAGE</span><h2 style={{margin:'8px 0'}}>{hero.eyebrow}</h2><p className="muted">This page presents LEGALX with existing demo data and no fabricated capabilities.</p><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><Button onClick={()=>go('/demo')} icon="play">Guided demo</Button><Button kind="secondary" onClick={()=>go('/app')} icon="grid">Workspace</Button></div></div></section></Reveal>}
    </main>
    <Footer />
  </div>;
}


function Auth({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const existing = readStoredProfile()
  const [email, setEmail] = useState(existing?.email || '')
  const [name, setName] = useState(mode === 'sign-up' ? (existing?.name || '') : '')
  const [workspaceName, setWorkspaceName] = useState(mode === 'sign-up' ? (existing?.workspaceName || '') : '')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const submit = () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes('@')) { setError('Enter a valid email address to continue.'); return }
    if (mode === 'sign-up' && !name.trim()) { setError('Add your name so it appears throughout the workspace.'); return }
    if (mode === 'sign-up') {
      saveProfile({ ...(existing || defaultProfile('owner')), name: name.trim(), email: normalizedEmail, workspaceName: workspaceName.trim() || 'Acme Digital', role: existing?.role || 'owner' })
      localStorage.setItem('legalx:role', existing?.role || 'owner')
    } else {
      const known = DEMO_ACCOUNTS.find((account) => account.email === normalizedEmail)
      if (known) localStorage.setItem('legalx:role', known.role)
      else if (existing?.email.toLowerCase() === normalizedEmail) localStorage.setItem('legalx:role', existing.role)
    }
    setError(''); setSubmitted(true)
  }
  return <div className="auth-page"><div className="auth-visual"><Logo light /><div className="auth-quote"><span className="section-kicker">LEGALX · LEXORA</span><h1>Trust is a relationship<br /><em>we can inspect.</em></h1><p>Turn the terms people agree to into a shared source of truth before anything executes.</p><div className="auth-mini"><Icon name="scan" size={17} /><span><b>100% parity ready</b><small>Human terms ↔ code logic</small></span></div></div></div><div className="auth-panel"><a className="back-link" href="/" onClick={(e) => { e.preventDefault(); go('/') }}>← Back to site</a><div className="auth-form"><Badge tone="crimson">{mode === 'sign-in' ? 'WELCOME BACK' : 'START BUILDING'}</Badge><h2>{mode === 'sign-in' ? 'Sign in to your workspace.' : 'Create your workspace.'}</h2><p className="muted">{mode === 'sign-in' ? 'Use a demo identity or enter the email you used for this local workspace.' : 'Your name and workspace become the identity shown in every dashboard handoff.'}</p>{submitted ? <div className="success-box"><Icon name="check" size={22} /><b>{mode === 'sign-in' ? 'Demo session ready.' : 'Workspace reserved.'}</b><p>This prototype keeps the identity locally and does not send email. Continue to choose the role that should govern the workspace.</p><Button onClick={() => go('/onboarding')} icon="arrow">Continue to onboarding</Button></div> : <><label>Full name{mode === 'sign-up' && <input required placeholder="Your name" value={name} onChange={(e) => { setName(e.target.value); setError('') }} />}</label>{mode === 'sign-in' && <label>Email address<input aria-label="Email address" type="email" placeholder="you@company.com" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} /></label>}{mode === 'sign-up' && <label>Email address<input required type="email" placeholder="you@company.com" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} /></label>}{mode === 'sign-up' && <label>Workspace name<input placeholder="Acme Studio" value={workspaceName} onChange={(e) => { setWorkspaceName(e.target.value); setError('') }} /></label>}{error && <div className="inline-form-error"><Icon name="alert" size={14} />{error}</div>}<Button onClick={submit} icon="arrow">{mode === 'sign-in' ? 'Continue' : 'Create workspace'}</Button><div className="or"><span>or</span></div><Button kind="secondary" onClick={() => go('/demo')} icon="play">Explore demo without an account</Button></>}{mode === 'sign-in' && <button className="forgot" onClick={() => { setError('Password reset is not connected in this local demo. Use a demo email or continue as a guest.'); setSubmitted(false) }}>Forgot password?</button>}<p className="auth-switch">{mode === 'sign-in' ? 'New to LEGALX?' : 'Already have an account?'} <a href={mode === 'sign-in' ? '/sign-up' : '/sign-in'} onClick={(e) => { e.preventDefault(); go(mode === 'sign-in' ? '/sign-up' : '/sign-in') }}>{mode === 'sign-in' ? 'Create an account' : 'Sign in'}</a></p><small className="auth-disclaimer">Prototype auth is local and clearly separated from production authentication. No credentials are stored.</small></div></div></div>
}function Unauthorized({ role, path, onNavigate }: { role: Role; path: string; onNavigate: (p: string) => void }) { return <div className="panel access-denied"><span className="section-kicker">ACCESS CONTROL · 403</span><h1>This view is outside your role.</h1><p>Your current role is <b>{ROLE_LABELS[role]}</b>. LEGALX denied <code>{path}</code> before rendering agreement, financial, or workspace data.</p><div className="access-denied-actions"><Button onClick={() => onNavigate('/app')} icon="arrow">Return to your dashboard</Button><Button kind="secondary" onClick={() => window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Ask a workspace admin to grant a permitted role.' }))}>Request access</Button></div></div> }

function RoleSwitcher({ role, onRoleChange }: { role: Role; onRoleChange: (role: Role) => void }) { const account = effectiveAccount(role); return <div className="role-switcher"><div><span className="section-kicker">ACTIVE IDENTITY</span><b>{ROLE_LABELS[role]}</b><small>{account.name} · {account.email}</small></div><select aria-label="Switch demo role" value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>{DEMO_ACCOUNTS.map((demo) => <option value={demo.role} key={demo.role}>{ROLE_LABELS[demo.role]}</option>)}</select></div> }function RoleDashboard({ role, onNavigate, onRoleChange, demoBanner = false }: { role: Role; onNavigate: (p: string) => void; onRoleChange: (role: Role) => void; demoBanner?: boolean }) { const account = effectiveAccount(role); const owner = role === 'owner'; const freelancer = role === 'freelancer'; const lawyer = role === 'legal_reviewer'; const admin = role === 'org_admin'; const auditor = role === 'technical_auditor'; const stats = owner ? [['TOTAL AGREEMENTS', '12', '+3 this month', 'file'], ['AWAITING APPROVAL', '03', '2 need your review', 'clock'], ['VERIFIED AGREEMENTS', '08', '100% parity ready', 'shield'], ['ACTIVE ESCROW', '₹86k', '2 milestones in scope', 'wallet']] : freelancer ? [['AWAITING ACCEPTANCE', '02', '1 needs your response', 'file'], ['ACTIVE PROJECTS', '03', '2 milestones due', 'layers'], ['PENDING PAYMENTS', '₹50k', 'After approval', 'wallet'], ['RELEASED PAYMENTS', '₹1.2L', 'This workspace', 'check']] : lawyer ? [['AWAITING REVIEW', '04', '2 high priority', 'file'], ['IN REVIEW', '02', 'Due this week', 'clock'], ['RETURNED FOR REVISION', '01', 'Needs owner input', 'edit'], ['APPROVED', '08', 'Evidence recorded', 'shield']] : admin ? [['TEAM MEMBERS', '08', '+2 pending invites', 'users'], ['ACTIVE AGREEMENTS', '12', 'Across workspace', 'file'], ['PERMISSION ALERTS', '02', 'Review access changes', 'alert'], ['INTEGRATIONS', '03', '1 needs attention', 'layers']] : [['AWAITING INSPECTION', '04', '2 critical checks', 'scan'], ['PARITY RESULTS', '08', '7 passed · 1 blocked', 'shield'], ['HASH CHANGES', '02', 'Since last review', 'refresh'], ['CHAIN EVENTS', '14', 'Sepolia references', 'code']]; return <div className="dashboard-view role-dashboard">{demoBanner && <div className="prototype-banner"><Icon name="spark" size={16} /><span><b>Role-aware demo workspace.</b> Switch identities to see the same agreement through different permissions.</span><Badge tone="warning">SIMULATED</Badge></div>}<div className="role-context"><div><span className="section-kicker">{ROLE_LABELS[role].toUpperCase()} · {account.workspaceName.toUpperCase()}</span><h1>{owner ? `Good evening, ${account.name.split(' ')[0]}.` : `${ROLE_LABELS[role]} dashboard.`}</h1><p>{ROLE_DESCRIPTIONS[role]}</p></div><RoleSwitcher role={role} onRoleChange={onRoleChange} /></div><div className="stat-grid">{stats.map(([label, value, sub, icon], i) => <StatCard key={label} label={label} value={maskFinancials(role) && (label.includes('PAYMENT') || label.includes('ESCROW')) ? '••••' : value} sub={sub} tone={i === 1 ? 'success' : i === 2 ? 'crimson' : i === 3 ? 'warning' : 'default'} icon={icon as IconName} />)}</div><div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-head"><div><span className="section-kicker">{admin ? 'WORKSPACE HEALTH' : auditor ? 'AUDIT HEALTH' : lawyer ? 'REVIEW QUEUE' : freelancer ? 'PROJECT PROGRESS' : 'AGREEMENT HEALTH'}</span><h2>{admin ? 'Permission-aware workspace' : auditor ? 'Evidence health' : lawyer ? 'Review activity' : freelancer ? 'Project momentum' : 'Verification health'}</h2></div><Badge tone="success">Live demo data</Badge></div><div className="chart"><div className="chart-labels"><span>12</span><span>8</span><span>4</span><span>0</span></div><div className="chart-area"><div className="chart-grid" /><svg viewBox="0 0 600 170" preserveAspectRatio="none"><path d="M0 145 C55 135 70 125 105 131 S160 116 190 122 S235 92 275 105 S330 72 365 88 S415 54 445 70 S500 45 530 57 S570 22 600 30" fill="none" stroke="#ef718c" strokeWidth="3" /></svg><div className="chart-x"><span>Oct 10</span><span>Oct 17</span><span>Oct 24</span><span>Oct 31</span><span>Nov 06</span></div></div></div><div className="chart-legend"><span><i className="legend-red" /> {auditor ? 'Audited evidence' : lawyer ? 'Reviewed agreements' : 'Verified agreements'}</span><span><i className="legend-lime" /> No blocking access violations</span></div></section><section className="panel quick-panel"><div className="panel-head"><div><span className="section-kicker">PERMITTED ACTIONS</span><h2>Keep moving</h2></div></div><div className="quick-actions">{(owner ? [['Create agreement', 'Start from plain language', '/app/ai-workspace', 'spark'], ['Run parity check', 'Compare an existing deal', '/app/parity', 'scan'], ['Fund escrow', 'Review supported payment', '/app/smart-contracts', 'wallet']] : freelancer ? [['Review invitation', 'Accept or request changes', '/app/agreements', 'file'], ['Submit evidence', 'Attach milestone proof', '/app/activity', 'file'], ['View payments', 'Track permitted releases', '/app/transactions', 'wallet']] : lawyer ? [['Review assigned deal', 'Open source clauses', '/app/agreements/website-project', 'edit'], ['Inspect extraction', 'Flag ambiguity', '/app/ai-workspace', 'spark'], ['Record legal review', 'Approval is not parity', '/app/contract-ir', 'shield']] : admin ? [['Manage members', 'Invite or revoke access', '/app/team', 'users'], ['Review roles', 'Workspace permissions', '/app/settings', 'shield'], ['Inspect activity', 'Access changes and events', '/app/activity', 'activity']] : [['Inspect Contract IR', 'Read structured terms', '/app/contract-ir', 'database'], ['Review parity report', 'No edit access', '/app/parity', 'scan'], ['Export audit evidence', 'Trust Passport', '/app/agreements/website-project', 'download']]).map(([title, subtitle, href, icon]) => <button key={title} onClick={() => onNavigate(href)}><span><Icon name={icon as IconName} size={17} /></span><b>{title}</b><small>{subtitle}</small><Icon name="arrow" size={15} /></button>)}</div></section></div><div className="role-permission-strip"><Icon name="shield" size={17} /><span><b>Permission boundary active.</b> {admin ? 'Admin controls stop at workspace configuration; legal approval, parity approval, and escrow execution remain separately authorized.' : auditor ? 'Auditor access is read-only. Agreement edits and verification changes are denied.' : `You can see ${owner ? 'owner-owned' : freelancer ? 'assigned' : 'role-permitted'} records only.`}</span><Badge tone="success">RBAC enforced</Badge></div></div> }

function AppShell({ path, role, onNavigate, onRoleChange }: { path: string; role: Role; onNavigate: (path: string) => void; onRoleChange: (role: Role) => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false); const [online, setOnline] = useState(() => navigator.onLine && readNetworkMode() !== 'offline'); const [slowNetwork, setSlowNetwork] = useState(() => readNetworkMode() === 'slow'); const [demoActive, setDemoActive] = useState(() => localStorage.getItem('legalx:guided-active') === 'true'); const [demoPaused, setDemoPaused] = useState(() => localStorage.getItem('legalx:guided-paused') === 'true'); const [toast, setToast] = useState('Demo workspace loaded'); const [workflow, setWorkflow] = useState<WorkflowState>(() => readWorkflow()); const [tampered, setTampered] = useState(() => readWorkflow().parity.status === 'mismatched' || readWorkflow().parity.status === 'blocked'); const [input, setInput] = useState(() => readText(AI_DRAFT_KEY, DEMO_INPUT)); const [parsed, setParsed] = useState(() => readText('legalx:ai-parsed') === 'true' || readWorkflow().extraction.status === 'success'); const [operationBusy, setOperationBusy] = useState(false); const [jsonView, setJsonView] = useState(false); const [search, setSearch] = useState(''); const [paletteOpen, setPaletteOpen] = useState(false); const [paletteQuery, setPaletteQuery] = useState(''); const account = effectiveAccount(role); const nav = ROLE_NAV[role]; const currentLabel = nav.find((item) => item[1] === path)?.[0] ?? (path === '/app' ? 'Dashboard' : 'Protected view'); const allowed = canAccessRoute(role, path); const score = tampered ? 74 : (workflow.parity.score || (workflow.parity.status === 'matched' ? 100 : workflow.validation.status === 'valid' ? 92 : 0));
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
  return <div className="app-shell"><aside className={sidebarOpen ? 'app-sidebar open' : 'app-sidebar'}><div className="app-brand"><Logo /><button className="sidebar-close" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><Icon name="x" size={16} /></button></div><RoleSwitcher role={role} onRoleChange={onRoleChange} /><div className="demo-pill"><span className="live-dot" /> {account.workspaceName} <small>ROLE DEMO</small></div><div className="nav-group"><span>{ROLE_LABELS[role].toUpperCase()} NAVIGATION</span>{nav.map(([label, href, icon]) => <a key={`${role}-${href}-${label}`} className={path === href ? 'active' : ''} href={href} onClick={(e) => { e.preventDefault(); setSidebarOpen(false); navigate(href) }}><Icon name={icon as IconName} size={16} /><b>{label}</b>{label === 'Notifications' && <i className="nav-count">3</i>}</a>)}</div><div className="sidebar-profile"><div className="avatar">{account.initials}</div><div><b>{account.name}</b><small>{ROLE_LABELS[role]}</small></div><button onClick={() => navigate('/app/profile')}><Icon name="users" size={15} /></button></div></aside><div className="app-main"><header className="app-topbar"><button className="sidebar-toggle" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button><div className="crumb"><span>{account.workspaceName}</span><b>/</b><strong>{currentLabel}</strong></div><div className="app-top-actions"><button className="global-search" aria-label="Open command palette" onClick={() => { setPaletteOpen(true); setPaletteQuery(''); }}><Icon name="search" size={15} /><span style={{fontSize:10,color:'var(--muted)'}}>{`Search ${ROLE_LABELS[role].toLowerCase()} workspace`}</span><kbd>⌘ K</kbd></button><ThemeToggle /><button className="top-icon" aria-label="Notifications" onClick={() => navigate('/app/notifications')}><Icon name="bell" size={17} /><i>3</i></button><button className="top-avatar" aria-label="Profile" onClick={() => navigate('/app/profile')}>{account.initials}</button></div></header>{!online && <div className="recovery-banner danger"><Icon name="alert" size={15} /><span><b>You are offline.</b> No live operation is running; local demo changes remain safe.</span></div>}{online && slowNetwork && <div className="recovery-banner"><Icon name="clock" size={15} /><span><b>Slow network mode.</b> Operations remain pending until a confirmation exists; no success is shown.</span></div>}{demoActive && path !== '/demo' && <div className="recovery-banner"><Icon name="refresh" size={15} /><span><b>{demoPaused ? 'Guided demo paused here.' : 'Guided demo checkpoint saved.'}</b> Your step is preserved locally; return safely when ready.</span><button onClick={() => onNavigate('/demo')}>Return to Demo Control Center</button></div>}<main className="workspace-content">{!allowed ? <Unauthorized role={role} path={path} onNavigate={navigate} /> : path === '/app' ? <RoleDashboard role={role} onNavigate={navigate} onRoleChange={onRoleChange} /> : path === '/app/agreements' ? <Agreements onNavigate={navigate} /> : path === '/app/ai-workspace' ? <AIWorkspace input={input} setInput={setInput} parsed={parsed} operationBusy={operationBusy} onParse={runParse} onNavigate={navigate} /> : path === '/app/contract-ir' ? <ContractIR jsonView={jsonView} setJsonView={setJsonView} onNavigate={navigate} workflow={workflow} role={role} /> : path === '/app/parity' ? <ParityStudio tampered={tampered} setTampered={(v) => { const current = readWorkflow(); const params = { ...current.parity.executionParams, reviewDays: v ? 2 : 5 }; const ir = current.ir; const parity: WorkflowState['parity'] = ir ? runParityCheck(ir, params) : ({ ...current.parity, status: (v ? 'mismatched' : 'matched') as WorkflowState['parity']['status'], score: v ? 74 : 100, mismatches: v ? ['review_period_days'] : [], checkedAt: new Date().toLocaleString(), executionParams: params }); const blockedApproval: WorkflowState['approval'] = { status: 'blocked' as const, by: current.approval.by, at: new Date().toLocaleString(), note: 'Approval blocked due to parity mismatch; re-review and approve after restoration.' }; const next: WorkflowState = { ...current, parity, approval: (v && current.approval.status === 'approved') ? blockedApproval : current.approval }; writeWorkflow(next); setWorkflow(readWorkflow()); setTampered(v); setToast(v ? 'Critical mismatch found — execution blocked (demo/local)' : 'Terms restored — parity matched (demo/local)') }} score={score} onNavigate={navigate} workflow={workflow} role={role} /> : path === '/app/smart-contracts' ? <SmartContracts role={role} workflow={workflow} /> : path === '/app/milestones' ? <Milestones role={role} /> : path === '/app/transactions' ? <Transactions role={role} /> : path === '/app/activity' ? <Activity role={role} workflow={workflow} /> : path === '/app/team' ? <Team role={role} onNavigate={navigate} workflow={workflow} /> : path === '/app/notifications' ? <Notifications /> : path === '/app/settings' ? <Settings role={role} onRoleChange={onRoleChange} /> : path === '/app/profile' ? <Profile role={role} /> : path === '/app/agreements/website-project' ? <AgreementDetail role={role} onNavigate={navigate} workflow={workflow} /> : <RoleDashboard role={role} onNavigate={navigate} onRoleChange={onRoleChange} />}</main>{toast && <div className={`app-toast ${toast.includes('blocked') || toast.includes('pending') || toast.includes('failed') ? 'error' : ''}`}><span><Icon name={toast.includes('blocked') || toast.includes('pending') || toast.includes('failed') ? 'alert' : 'check'} size={14} /></span>{toast}</div>}{paletteOpen && <div className="panel" role="dialog" aria-label="Command palette" style={{position:'fixed',inset:0,background:'rgba(10,14,20,.45)',zIndex:50,display:'grid',placeItems:'start center',paddingTop:'10vh'}} onClick={() => setPaletteOpen(false)}><div className="panel" style={{width:'min(720px,92vw)',padding:16}} onClick={e=>e.stopPropagation()}><div className="search-field" style={{maxWidth:'none',marginBottom:10}}><Icon name="search" size={15} /><input autoFocus aria-label="Command palette search" placeholder="Search pages and actions…" value={paletteQuery} onChange={e=>setPaletteQuery(e.target.value)} /></div><div style={{maxHeight:360,overflow:'auto',display:'grid',gap:6}}>{paletteResults.length===0 ? <p className="muted">No matching actions for your role.</p> : paletteResults.map(a => <button key={a.group+a.href+a.label} className="field-row-button" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',border:'1px solid var(--line)',borderRadius:8}} onClick={() => { setPaletteOpen(false); navigate(a.href); }}><span><b>{a.label}</b> <small className="muted">· {a.group}</small></span><Icon name="arrow" size={14} /></button>)}</div><small className="muted">Ctrl/Cmd+K to toggle · Esc to close · Actions respect RBAC</small></div></div>}</div></div>
}

function PageHeader({ eyebrow, title, desc, action, onAction }: { eyebrow: string; title: string; desc: string; action?: string; onAction?: () => void }) { return <div className="page-header"><div><span className="section-kicker">{eyebrow}</span><h1>{title}</h1><p>{desc}</p></div>{action && <Button onClick={onAction} icon="plus">{action}</Button>}</div> }
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
  type Agreement = { id: string; title: string; status: string; party: string; counterparty: string; agreementType: string; updatedAt: string; amount: string; source: 'demo'; summary: string };
  const demoAgreements: Agreement[] = [
    { id: 'website-project', title: 'Website project', status: 'Verified', party: 'Acme Digital', counterparty: 'Freelance Developer', agreementType: 'Freelance milestone', updatedAt: '2026-11-06', amount: '₹50,000', source: 'demo', summary: 'Freelance website development with milestone escrow terms, review window, and dispute freeze behavior.' },
    { id: 'brand-retainer', title: 'Brand retainer', status: 'Ready for review', party: 'Acme Digital', counterparty: 'Studio North', agreementType: 'Retainer', updatedAt: '2026-11-04', amount: '₹1,20,000', source: 'demo', summary: 'Brand identity retainer with monthly deliverables and approval checkpoints.' },
    { id: 'mobile-app-build', title: 'Mobile app build', status: 'Mismatch detected', party: 'Acme Digital', counterparty: 'BuildWorks', agreementType: 'Product development', updatedAt: '2026-10-28', amount: '₹2,40,000', source: 'demo', summary: 'Mobile product build requiring parity clarification before execution readiness.' },
    { id: 'legal-advisory', title: 'Legal advisory', status: 'Draft', party: 'Acme Digital', counterparty: 'Counsel Partners', agreementType: 'Advisory', updatedAt: '2026-10-22', amount: '₹75,000', source: 'demo', summary: 'Monthly legal advisory draft pending extraction and Contract IR generation.' },
  ];
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [partyFilter, setPartyFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState('website-project');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadState, setUploadState] = useState<'idle'|'selected'|'validating'|'uploading'|'processing'|'success'|'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const statuses = ['All', ...Array.from(new Set(demoAgreements.map(a => a.status)))];
  const parties = ['All', ...Array.from(new Set(demoAgreements.flatMap(a => [a.party, a.counterparty])))];
  const types = ['All', ...Array.from(new Set(demoAgreements.map(a => a.agreementType)))];
  const filtered = demoAgreements.filter(a => {
    const q = query.toLowerCase();
    const matchesQ = !q || [a.title, a.status, a.party, a.counterparty, a.agreementType, a.amount, a.summary].join(' ').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'All' || a.status === statusFilter;
    const matchesParty = partyFilter === 'All' || a.party === partyFilter || a.counterparty === partyFilter;
    const matchesType = typeFilter === 'All' || a.agreementType === typeFilter;
    const matchesFrom = !dateFrom || a.updatedAt >= dateFrom;
    const matchesTo = !dateTo || a.updatedAt <= dateTo;
    return matchesQ && matchesStatus && matchesParty && matchesType && matchesFrom && matchesTo;
  });
  const selected = filtered.find(a => a.id === selectedId) || filtered[0] || demoAgreements[0];
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
    <PageHeader eyebrow="AGREEMENT MANAGEMENT · EDITORIAL LIBRARY" title="Documents, metadata, and workflow state." desc="Search, filter, preview, and manage agreement intake. Backend-backed listing/processing connects when APIs are available; current records are demo/local." action="Create agreement" onAction={() => onNavigate('/app/ai-workspace')} />
    <div className="prototype-banner"><Icon name="file" size={16} /><span><b>Library view:</b> {filtered.length} of {demoAgreements.length} agreements shown. Filters and preview are frontend-ready; no invented backend data.</span><Badge tone="warning">DEMO DATA</Badge></div>
    <div className="lx-library-toolbar panel">
      <div className="search-field" style={{maxWidth:420}}><Icon name="search" size={15} /><input aria-label="Search agreements" placeholder="Search title, party, status, type, amount" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <label>Status <select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Party <select aria-label="Filter by party" value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>{parties.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Type <select aria-label="Filter by agreement type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>{types.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>From <input aria-label="Filter date from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
      <label>To <input aria-label="Filter date to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label>
      <Button kind="secondary" icon="plus" onClick={() => setShowUpload(v => !v)}>{showUpload ? 'Hide upload' : 'Upload document'}</Button>
    </div>
    {showUpload && <div className="panel" style={{marginTop:12}}>
      <div className="panel-head"><div><span className="section-kicker">DOCUMENT INTAKE</span><h2>Upload, validate, process</h2></div><Badge tone={uploadState==='success'?'success':uploadState==='error'?'danger':'warning'}>{uploadState}</Badge></div>
      <p className="muted">Frontend upload/validation/progress/failure-recovery flow. Connects to backend upload/processing APIs via centralized <code>/api/v1</code> client when contracts are available; no endpoint invented.</p>
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
      <section className="panel lx-library-list">
        <div className="panel-head"><div><span className="section-kicker">DOCUMENTS</span><h2>{filtered.length} result(s)</h2></div><Badge tone="neutral">Editorial rows</Badge></div>
        {filtered.length === 0 ? <div className="panel" style={{marginTop:12}}><p><b>No agreements match the current filters.</b></p><p className="muted">Adjust search, status, party, date range, or agreement type.</p></div> : <div className="management-list">{filtered.map((a, i) => <button className={`management-row lx-doc-row ${selected?.id===a.id?'selected':''}`} key={a.id} onClick={() => setSelectedId(a.id)}><span className={`agreement-thumb t${i % 4}`}><Icon name={a.status.includes('Mismatch') ? 'alert' : 'file'} size={19} /></span><span className="management-copy"><b>{a.title}</b><small>{a.summary}</small><small><b>Type:</b> {a.agreementType} · <b>Updated:</b> {a.updatedAt}</small></span><Badge tone={a.status === 'Verified' ? 'success' : a.status === 'Mismatch detected' ? 'danger' : a.status === 'Ready for review' ? 'warning' : 'neutral'}>{a.status}</Badge></button>)}</div>}
      </section>
      <aside className="panel lx-preview-panel">
        <div className="panel-head"><div><span className="section-kicker">PREVIEW & METADATA</span><h2>{selected?.title || 'No selection'}</h2></div><Badge tone={selected?.status === 'Verified' ? 'success' : selected?.status === 'Mismatch detected' ? 'danger' : 'warning'}>{selected?.status || '—'}</Badge></div>
        {selected ? <>
          <div className="lx-doc-preview"><div className="lx-doc-page"><span className="section-kicker">DOCUMENT PREVIEW (DEMO)</span><h3>{selected.title}</h3><p>{selected.summary}</p><p className="muted">Parties: {selected.party} ↔ {selected.counterparty}<br/>Amount: {selected.amount}<br/>Type: {selected.agreementType}<br/>Updated: {selected.updatedAt}</p></div></div>
          <div className="field-table" style={{marginTop:12}}><div className="field-row head"><span>Metadata</span><span>Value</span><span>Status</span><span>Source</span></div>
            <div className="field-row"><code>party</code><b>{selected.party}</b><span>active</span><span>{selected.source}</span></div>
            <div className="field-row"><code>counterparty</code><b>{selected.counterparty}</b><span>active</span><span>{selected.source}</span></div>
            <div className="field-row"><code>agreement_type</code><b>{selected.agreementType}</b><span>classified</span><span>{selected.source}</span></div>
            <div className="field-row"><code>updated_at</code><b>{selected.updatedAt}</b><span>recorded</span><span>{selected.source}</span></div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><Button onClick={() => openAgreement(selected)} icon="arrow">Open workflow</Button><Button kind="secondary" onClick={() => onNavigate('/app/agreements/website-project')} icon="file">Details view</Button></div>
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
  return <div><PageHeader eyebrow="AI AGREEMENT WORKSPACE · DEMO/LOCAL MODE" title="Say what you agreed." desc="Describe the deal in English or Hinglish. LEGALX extracts clauses locally (deterministic demo; no live AI/API) and structures them into Contract IR." />
    <div className="ai-layout"><section className="ai-composer panel"><div className="stepper"><span className={input.trim() ? 'done' : 'current'}>01 <b>Describe</b></span><span className={isSuccess ? 'done' : (isLoading ? 'current' : '')}>02 <b>Structure</b></span><span className={w.validation.status === 'valid' ? 'done' : ''}>03 <b>Review</b></span></div>
      <label className="large-label">Your agreement <small>English + Hinglish supported</small><textarea value={input} onChange={(e) => setInput(e.target.value)} /></label>
      <div className="composer-foot"><span><Icon name="lock" size={13} /> Drafts stay in your workspace</span><Button onClick={onParse} icon="spark" className={isLoading ? 'disabled' : ''}>{isLoading ? 'Extracting…' : isSuccess ? 'Re-run extraction' : 'Extract terms'}</Button></div>
      {extraction.message ? <div className={isError ? 'inline-error' : 'clarify-box'}><span className="clarify-icon"><Icon name={isError ? 'alert' : 'check'} size={16} /></span><div><b>{isError ? 'Extraction issue' : 'Workflow status'}</b><p>{extraction.message}</p><small>Demo/local deterministic processing · no fabricated external service response</small></div></div> : <div className="clarify-box"><span className="clarify-icon"><Icon name="alert" size={16} /></span><div><b>Clarification layer</b><p>In a live workspace, missing details would be requested instead of invented. This demo uses deterministic local extraction.</p><small>Demo scenario · deterministic output · not live AI</small></div></div>}
    </section>
    <aside className="ai-side"><div className="panel extraction-card"><div className="panel-head"><div><span className="section-kicker">EXTRACTION RESULT</span><h2>{isLoading ? 'Processing…' : isError ? 'Needs input' : isSuccess ? 'Ready for review' : 'Waiting for input'}</h2></div><Badge tone={isLoading ? 'warning' : isError ? 'danger' : isSuccess ? 'success' : 'neutral'}>{isLoading ? 'loading' : isError ? 'error' : isSuccess ? 'success' : 'idle'}</Badge></div>
      {isLoading && <p className="muted">Extracting clauses and generating Contract IR locally…</p>}
      {isError && <p className="muted">Extraction did not complete. Fix the input and try again. No result was fabricated.</p>}
      {!isLoading && !isSuccess && !isError && <p className="muted">Run extraction to produce structured clause data and Contract IR.</p>}
      {isSuccess && w.ir && <div className="extracted-fields"><span><small>AGREEMENT TYPE</small><b>{w.ir.agreement_type.replace(/_/g, ' ')}</b></span><span><small>CURRENCY</small><b>{w.ir.currency} · ₹{w.ir.total_amount.toLocaleString('en-IN')}</b></span><span><small>REVIEW WINDOW</small><b>{w.ir.review_period_days} calendar days</b></span><span><small>DISPUTE BEHAVIOR</small><b>{w.ir.dispute_behavior.replace(/_/g, ' ')}</b></span></div>}
    </div>
    <div className="panel source-card"><div className="panel-head"><div><span className="section-kicker">SOURCE-GROUNDED</span><h2>Terms we can point to</h2></div><Icon name="link" size={17} /></div>{isSuccess && w.ir ? <><p>{(w.ir.provenance.find(p=>p.field==='milestones')||{}).source || 'Milestone terms preserved from input.'}</p><div className="source-chip"><Icon name="check" size={13} /> {w.ir.provenance.filter(p=>p.support==='supported').length} supported fields with evidence</div></> : <p className="muted">Evidence references will appear after successful extraction.</p>}</div></aside></div>
    {isSuccess && <div className="next-step"><div><Icon name="database" size={18} /><span><b>Contract IR {w.ir?.version || ''} is ready</b><small>Validation: {w.validation.status}{w.validation.issues.length ? (' · ' + w.validation.issues[0]) : ''}. Inspect before parity.</small></span></div><Button onClick={() => onNavigate('/app/contract-ir')} icon="arrow">Open Contract IR</Button></div>}
  </div>;
}
function TraceabilityExplorer({ workflow }: { workflow: WorkflowState }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const snap = deriveTraceability(workflow);
  const history = [...(workflow.traceability?.history || [])].sort((a: any,b: any)=>String(a.irVersion).localeCompare(String(b.irVersion)));
  const rows = snap.rows;
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const tone = (s: string) => s === 'complete' || s === 'valid' || s === 'matched' || s === 'passed' ? 'success' : s === 'partial' || s === 'pending' || s === 'not_run' ? 'warning' : s === 'unsupported' || s === 'not_applicable' ? 'neutral' : 'danger';
  const nodes = [
    { id: 'agreement', x: 40, y: 110, label: 'Agreement / Clauses', sub: `${rows.length} mapped` },
    { id: 'ir', x: 210, y: 110, label: 'Contract IR', sub: snap.irVersion },
    { id: 'validation', x: 380, y: 60, label: 'Validation', sub: snap.summary.missing ? 'issues/missing' : 'checked' },
    { id: 'parity', x: 380, y: 160, label: 'Parity', sub: workflow.parity?.status || 'pending' },
    { id: 'solidity', x: 560, y: 60, label: 'Solidity', sub: workflow.solidity?.generation?.status || 'idle' },
    { id: 'tests', x: 560, y: 160, label: 'Tests', sub: workflow.solidity?.tests?.status || 'not_run' },
    { id: 'evidence', x: 740, y: 110, label: 'Evidence / Audit', sub: `${snap.summary.complete} complete` },
  ];
  const links: [string,string,boolean][] = [['agreement','ir',true],['ir','validation',true],['ir','parity',true],['validation','solidity',true],['parity','solidity',true],['solidity','tests',true],['tests','evidence',true],['parity','evidence',snap.summary.missing===0]];
  const pos = (id:string)=>nodes.find(n=>n.id===id)!;
  return <div className="panel" style={{marginTop:12}}>
    <div className="panel-head"><div><span className="section-kicker">TRACEABILITY · VISUAL GRAPH</span><h2>Clause to code, end to end</h2></div><div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><Badge tone={snap.summary.missing? 'danger' : snap.summary.partial? 'warning':'success'}>{snap.summary.complete}/{snap.summary.total} complete</Badge><Badge tone="warning">IR {snap.irVersion}</Badge><Button kind="secondary" onClick={()=>setShowHistory(!showHistory)} icon="clock">{showHistory?'Hide':'Show'} version history</Button></div></div>
    <p className="muted">Interactive evidence map: Agreement → Contract IR → Validation/Parity → Solidity → Tests → Audit evidence. Unsupported/unmapped/missing links are explicitly identified and preserved across versions.</p>
    <div className="lx-trace-graph" aria-label="Traceability connection graph">
      <svg className="lx-trace-svg" viewBox="0 0 900 220" role="img">
        {links.map(([a,b,ok],i)=>{const A=pos(a),B=pos(b); const mx=(A.x+B.x)/2; return <path key={i} className={`lx-trace-link ${ok?'':'dim'}`} d={`M ${A.x+70} ${A.y} C ${mx} ${A.y}, ${mx} ${B.y}, ${B.x} ${B.y}`} />})}
        {nodes.map(n=> <g key={n.id} transform={`translate(${n.x},${n.y-22})`}>
          <rect className="lx-trace-node" rx="10" ry="10" width="140" height="44" />
          <text className="lx-trace-label" x="10" y="18">{n.label}</text>
          <text className="lx-trace-sub" x="10" y="33">{String(n.sub).slice(0,22)}</text>
        </g>)}
      </svg>
    </div>
    <div className="verification-evidence" style={{margin:'10px 0'}}><span><b>{snap.summary.total}</b> links</span><span className="good"><b>{snap.summary.complete}</b> complete</span><span className={snap.summary.partial?'bad':''}><b>{snap.summary.partial}</b> partial</span><span className={snap.summary.missing?'bad':''}><b>{snap.summary.missing}</b> missing links</span><span><b>{snap.summary.unsupported}</b> unsupported</span></div>
    <div className="field-table" style={{marginTop:8}}>
      <div className="field-row head"><span>Clause / Evidence</span><span>IR field &amp; value</span><span>Validation / Parity</span><span>Solidity / Tests / Status</span></div>
      {rows.map((r, idx) => {
        const k = r.clauseId + ':' + r.irField + ':' + idx;
        return <div key={k}>
          <button className={'field-row field-row-button '+(open[k]?'selected':'')} onClick={()=>toggle(k)}>
            <span><b><code>{r.clauseId}</code> {r.clauseLabel}</b><small>{r.evidence ? ('Evidence: ' + r.evidence) : 'Missing evidence'}</small></span>
            <span><code>{r.irField}</code><small>{r.irValue}</small></span>
            <span style={{display:'grid',gap:4}}><Badge tone={tone(r.validationStatus) as any}>Validation: {r.validationStatus}</Badge><Badge tone={tone(r.parityStatus) as any}>Parity: {r.parityStatus}</Badge></span>
            <span style={{display:'grid',gap:4}}><Badge tone={tone(r.traceabilityStatus) as any}>Trace: {r.traceabilityStatus}</Badge><small>{r.solidityElements.length ? r.solidityElements[0] : (r.supported ? 'No Solidity mapping' : 'Not executable')}</small></span>
          </button>
          {open[k] && <div className="field-inspector" style={{margin:'0 0 8px 0'}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}>
              <div><span className="section-kicker">ORIGINAL CLAUSE</span><b>{r.clauseId} · {r.clauseLabel}</b><p>{r.clauseText}</p><p><b>Evidence/source:</b> {r.evidence}</p></div>
              <div><span className="section-kicker">IR / CHECKS</span><p><b>Contract IR field:</b> <code>{r.irField}</code></p><p><b>Value:</b> {r.irValue}</p><p><b>Validation:</b> {r.validationStatus} — {r.validationDetail}</p><p><b>Parity:</b> {r.parityStatus} — {r.parityDetail}</p></div>
              <div><span className="section-kicker">SOLIDITY ELEMENTS</span>{r.solidityElements.length ? <ul style={{margin:'4px 0 0 16px'}}>{r.solidityElements.map(el => <li key={el}><code>{el}</code></li>)}</ul> : <p className="muted">{r.supported ? 'Missing Solidity mapping/link.' : 'Unsupported/non-executable clause — no Solidity element.'}</p>}</div>
              <div><span className="section-kicker">AUTOMATED TESTS</span>{r.testCases.length ? <ul style={{margin:'4px 0 0 16px'}}>{r.testCases.map(t => <li key={t.id}><code>{t.id}</code> {t.name} <b>({t.status})</b></li>)}</ul> : <p className="muted">{r.supported ? 'Missing test mapping/link.' : 'No executable tests (unsupported clause).'}</p>}{r.missingLinks.length>0 && <p style={{marginTop:8}}><b>Missing links:</b> {r.missingLinks.join(', ')}</p>}</div>
            </div>
          </div>}
        </div>;
      })}
    </div>
    {showHistory && <div style={{marginTop:12}}>
      <span className="section-kicker">TRACEABILITY HISTORY (PRESERVED)</span>
      {history.length===0 ? <p className="muted">No previous IR version snapshots yet. Revisions/regenerations will preserve prior traceability history.</p> : history.map((h: any) => <div key={h.irVersion} className="timeline-row"><span className="timeline-icon warning"><Icon name="clock" size={14} /></span><div><b>IR {h.irVersion}</b><small>{h.createdAt} · {h.summary?.complete||0}/{h.summary?.total||0} complete, {h.summary?.missing||0} missing, {h.summary?.unsupported||0} unsupported</small></div><Badge tone="neutral">preserved</Badge></div>)}
      <div className="timeline-row"><span className="timeline-icon success"><Icon name="check" size={14} /></span><div><b>Current IR {snap.irVersion}</b><small>{snap.createdAt} · live mapping derived from current workflow state</small></div><Badge tone="success">current</Badge></div>
    </div>}
  </div>;
}


function WhatIfSimulator({ workflow, role }: { workflow: WorkflowState; role: Role }) {
  const w = workflow;
  const sim = w.simulation;
  const canSimulate = !!w.ir && (hasPermission(role, 'agreement:edit') || hasPermission(role, 'agreement:create') || hasPermission(role, 'workspace:manage') || role === 'owner');
  const [draft, setDraft] = useState<any>(() => sim?.draftIr ? JSON.parse(JSON.stringify(sim.draftIr)) : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(sim?.draftIr ? JSON.parse(JSON.stringify(sim.draftIr)) : null); }, [sim?.draftIr ? JSON.stringify(sim.draftIr) : 'none', sim?.active]);

  const start = () => {
    const cur = readWorkflow();
    if (!cur.ir) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Generate Contract IR before starting a simulation.' })); return; }
    const baseIr = JSON.parse(JSON.stringify(cur.ir));
    const baseClauses = JSON.parse(JSON.stringify(cur.traceability?.clauses || buildClausesFromIr(baseIr, cur.extraction?.sourceText || '')));
    const validation = { status: 'pending', issues: [], checkedAt: '' } as any;
    const parity = { ...cur.parity, status: 'pending', score: 0, mismatches: [], checkedAt: '' } as any;
    const nextSim = { active: true, baseIrVersion: baseIr.version, baseIr, draftIr: JSON.parse(JSON.stringify(baseIr)), baseClauses, draftClauses: baseClauses, validation, parity, solidity: { generation: { status: 'idle', message: 'Simulation Solidity not generated yet.', filename: '', irVersion: '', source: '', metadata: null, supported: [], unsupported: [], security: [], errors: [] }, compilation: { status: 'not_run', ranAt: '', message: 'Compilation not run (no Solidity compiler/tooling detected).', tool: 'unavailable' }, tests: { status: 'not_run', ranAt: '', summary: 'Simulation tests not run.', cases: [] } }, diff: { changes: [], baseSum: (baseIr.milestones||[]).reduce((s:number,m:any)=>s+Number(m.amount||0),0), draftSum: (baseIr.milestones||[]).reduce((s:number,m:any)=>s+Number(m.amount||0),0), milestoneCountChanged: false }, simulationApprovedForGeneration: false, note: 'Isolated simulation copy. Original IR/approval/Solidity remain unchanged.' };
    let nw: any = { ...cur, simulation: nextSim as any }; nw = ensureIntegrityFields(nw); nw = logEvent(nw, 'simulation_created', `Simulation created from base IR ${baseIr.version} (isolated).`, { name: 'User', role }, { details: { baseIrVersion: baseIr.version } }); writeWorkflow(nw as any);
    window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'What-if simulation started from current Contract IR (isolated copy).' }));
  };
  const discard = () => { const cur = readWorkflow(); let nw: any = { ...cur, simulation: null }; nw = ensureIntegrityFields(nw); nw = logEvent(nw, 'simulation_discarded', 'Simulation discarded (original unchanged).', { name: 'User', role }, { details: { baseIrVersion: cur.simulation?.baseIrVersion } }); writeWorkflow(nw as any); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Simulation discarded. Original Contract IR and approvals were not modified.' })); };
  const updateDraft = (patch: any) => {
    if (!sim || !draft) return;
    const nd = { ...draft, ...patch };
    if (patch.milestones) nd.milestones = patch.milestones;
    setDraft(nd);
  };
  const applyDraft = (nd: any, runAll = false) => {
    const cur = readWorkflow(); if (!cur.simulation) return;
    const base = cur.simulation.baseIr;
    const diff = diffIrs(base, nd);
    const nextSim = { ...cur.simulation, draftIr: nd, diff };
    if (!runAll) {
      nextSim.validation = { status: 'pending', issues: [], checkedAt: '' } as any;
      nextSim.parity = { ...cur.simulation.parity, status: 'pending', score: 0, mismatches: [], checkedAt: '' } as any;
      nextSim.solidity = { ...cur.simulation.solidity, generation: { ...(cur.simulation.solidity?.generation||{}), status: 'idle', message: 'Simulation changed — re-run validation/parity and regenerate Solidity.', errors: [] } } as any;
      nextSim.simulationApprovedForGeneration = false;
    }
    writeWorkflow({ ...cur, simulation: nextSim as any });
  };
  const saveEdits = () => { if (!draft) return; applyDraft(draft, false); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Simulation draft updated (isolated). Re-run validation and parity.' })); };
  const runChecks = () => {
    const cur = readWorkflow(); const s0 = cur.simulation; if (!s0?.draftIr) return;
    setBusy(true);
    window.setTimeout(() => {
      const c = readWorkflow(); const s1 = c.simulation; if (!s1) { setBusy(false); return; }
      const d = s1.draftIr;
      const issues: string[] = [];
      if (!d.total_amount || d.total_amount <= 0) issues.push('Total amount must be positive.');
      if (!Array.isArray(d.milestones) || d.milestones.length === 0) issues.push('At least one milestone is required.');
      const sum = (d.milestones||[]).reduce((a:number,m:any)=>a+Number(m.amount||0),0);
      if (sum !== Number(d.total_amount)) issues.push(`Milestone sum (${sum}) must equal total (${d.total_amount}).`);
      (d.milestones||[]).forEach((m:any,i:number)=>{ if(!Number.isInteger(Number(m.amount))||Number(m.amount)<=0) issues.push(`Milestone ${i+1} amount invalid.`); if(!m?.name) issues.push(`Milestone ${i+1} name missing.`); });
      if (!Number.isInteger(Number(d.review_period_days)) || Number(d.review_period_days)<1) issues.push('Review period must be >= 1 day.');
      if (!d.dispute_behavior) issues.push('Dispute behavior required.');
      if (d.dispute_behavior !== 'freeze_affected_payment') issues.push('Unsupported dispute behavior for executable simulation (freeze_affected_payment required).');
      const validation = { status: issues.length?'invalid':'valid', issues, checkedAt: new Date().toLocaleString() } as any;
      const ep = c.parity.executionParams;
      const mm: string[] = [];
      if (Number(d.total_amount)!==ep.total) mm.push('total_amount');
      if (JSON.stringify((d.milestones||[]).map((m:any)=>Number(m.amount)))!==JSON.stringify(ep.milestones)) mm.push('milestones');
      if (Number(d.review_period_days)!==ep.reviewDays) mm.push('review_period_days');
      if ((d.dispute_behavior==='freeze_affected_payment')!==ep.disputeFreeze) mm.push('dispute_behavior');
      const parity = { status: validation.status==='valid' ? (mm.length?'mismatched':'matched') : 'pending', score: validation.status==='valid' ? (mm.length?74:100) : 0, mismatches: mm, checkedAt: new Date().toLocaleString(), executionParams: ep } as any;
      const diff = diffIrs(s1.baseIr, d);
      writeWorkflow({ ...c, simulation: { ...s1, validation, parity, diff, simulationApprovedForGeneration: false, solidity: { ...s1.solidity, generation: { ...(s1.solidity?.generation||{}), status: 'idle', message: 'Checks updated. Simulation Solidity must be regenerated explicitly.', errors: [] } } } as any });
      setBusy(false);
      window.dispatchEvent(new CustomEvent('legalx:notice', { detail: validation.status==='valid' ? 'Simulation validation/parity completed.' : 'Simulation validation failed; fix issues before regeneration.' }));
    }, 220);
  };
  const toggleSimApproval = () => { const cur = readWorkflow(); if(!cur.simulation) return; writeWorkflow({ ...cur, simulation: { ...cur.simulation, simulationApprovedForGeneration: !cur.simulation.simulationApprovedForGeneration } }); };
  const generateSim = () => {
    const cur = readWorkflow(); const s0 = cur.simulation; if(!s0?.draftIr) return;
    if (s0.validation.status !== 'valid') { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Simulation IR must be valid before generating simulation Solidity.' })); return; }
    if (!s0.simulationApprovedForGeneration) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Explicit simulation approval is required before generating simulation Solidity (never auto-approved).' })); return; }
    setBusy(true);
    window.setTimeout(() => {
      const c = readWorkflow(); const s1 = c.simulation; if(!s1) { setBusy(false); return; }
      const gen = generateSolidity(s1.draftIr as any, { validationStatus: s1.validation.status, approved: s1.simulationApprovedForGeneration });
      let tests: any = { status: 'not_run', ranAt: '', summary: 'Simulation tests not run.', cases: [] };
      if (gen.status === 'success') tests = runGenerationTests(s1.draftIr);
      const compilation = { status: 'not_run' as const, ranAt: '', message: 'Compilation not run (no Solidity compiler/tooling detected). Simulation runtime tests not executed.', tool: 'unavailable' };
      writeWorkflow({ ...c, simulation: { ...s1, solidity: { generation: gen as any, compilation, tests } } as any });
      setBusy(false);
      window.dispatchEvent(new CustomEvent('legalx:notice', { detail: gen.status==='success' ? 'Simulation Solidity regenerated and generation/security tests executed (isolated).' : ('Simulation generation rejected: ' + (gen.errors[0]||gen.message)) }));
    }, 220);
  };
  const createRevision = () => {
    const cur = readWorkflow(); const s0 = cur.simulation; if(!s0?.draftIr) return;
    if (s0.validation.status !== 'valid') { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Simulation must be valid before creating a revision.' })); return; }
    // explicit user choice handled by button label/confirm
    if (!window.confirm('Create a NEW revision from this simulation? Original approved IR/Solidity remain preserved in history; the new revision will reset approval and generated Solidity/tests.')) return;
    const bumped = 'v'+((parseInt((cur.ir?.version||'v1').replace(/[^0-9]/g,''),10)||1)+1)+'.0';
    const updatedIr = { ...JSON.parse(JSON.stringify(s0.draftIr)), version: bumped };
    const issues: string[] = []; if(updatedIr.total_amount<=0) issues.push('Total amount invalid'); if((updatedIr.milestones||[]).reduce((a:number,m:any)=>a+Number(m.amount||0),0)!==Number(updatedIr.total_amount)) issues.push('Milestone sum mismatch');
    const validation = { status: issues.length?'invalid':'valid', issues, checkedAt: new Date().toLocaleString() } as any;
    let parityRes: any = { ...cur.parity, status:'pending', score:0, mismatches:[], checkedAt:'' };
    if (validation.status==='valid') { const ep=cur.parity.executionParams; const mm: string[]=[]; if(Number(updatedIr.total_amount)!==ep.total) mm.push('total_amount'); if(JSON.stringify((updatedIr.milestones||[]).map((m:any)=>Number(m.amount)))!==JSON.stringify(ep.milestones)) mm.push('milestones'); if(Number(updatedIr.review_period_days)!==ep.reviewDays) mm.push('review_period_days'); if((updatedIr.dispute_behavior==='freeze_affected_payment')!==ep.disputeFreeze) mm.push('dispute_behavior'); parityRes = { status: mm.length?'mismatched':'matched', score: mm.length?74:100, mismatches:mm, checkedAt:new Date().toLocaleString(), executionParams:ep }; }
    const revision = { id: 'rev-'+Date.now(), at: new Date().toLocaleString(), summary: 'Revision created from what-if simulation (explicit user action).', irVersion: bumped };
    const clauses = buildClausesFromIr(updatedIr, cur.extraction?.sourceText || '').map((c:any)=>({ ...c, irVersion: bumped }));
    let nextW: any = { ...cur, ir: updatedIr, validation, parity: parityRes, revisions: [...(cur.revisions||[]), revision], approval: { status:'not_requested', by:'', at:'', note:'Approval reset after simulation-derived revision.' }, solidity: { generation: { status: 'idle', message: 'No Solidity generated yet.', filename: '', irVersion: '', source: '', metadata: null, supported: [], unsupported: [], security: [], errors: [] }, compilation: { status: 'not_run', ranAt: '', message: 'Compilation not run (no Solidity compiler/tooling detected in this environment).', tool: 'unavailable' }, tests: { status: 'not_run', ranAt: '', summary: 'Automated contract tests not run.', cases: [] } }, traceability: { clauses, snapshots: { ...(cur.traceability?.snapshots||{}) }, history: Array.isArray(cur.traceability?.history)?[...cur.traceability.history]:[] }, simulation: null };
    const prevSnap = (cur.traceability?.snapshots||{})[cur.ir!.version] || deriveTraceability(cur);
    if (prevSnap && !nextW.traceability.history.find((h:any)=>h.irVersion===prevSnap.irVersion)) nextW.traceability.history = [...nextW.traceability.history, prevSnap];
    const snap = deriveTraceability(nextW); nextW.traceability.snapshots = { ...nextW.traceability.snapshots, [snap.irVersion]: snap };
    nextW = ensureIntegrityFields(nextW); nextW = logEvent(nextW, 'revision_creation', `Revision ${bumped} created from simulation (explicit).`, { name: 'User', role }, { beforeHash: hashIr(cur.ir), afterHash: hashIr(updatedIr), details: { from: cur.ir?.version, to: bumped, source: 'simulation' } }); nextW = recordVersion(nextW, { name: 'User', role }, `Revision ${bumped} created from simulation.`); writeWorkflow(nextW as WorkflowState);
    window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'New revision '+bumped+' created from simulation. Original approved artifacts preserved in history; new revision requires validation/parity/approval/generation/tests.' }));
  };

  const base = sim?.baseIr || w.ir;
  const curDraft = draft || sim?.draftIr || base;
  const diff = sim?.diff || (base && curDraft ? diffIrs(base, curDraft) : { changes: [], baseSum: 0, draftSum: 0, milestoneCountChanged: false });
  const simSnap = sim?.draftIr ? deriveTraceability(w, { ir: sim.draftIr, validation: sim.validation, parity: sim.parity, solidity: sim.solidity?.generation as any, tests: sim.solidity?.tests as any, clauses: sim.draftClauses || sim.baseClauses, label: 'simulation' }) : null;
  const baseSnap = deriveTraceability(w);
  const affected = simSnap ? affectedFromDiff(diff.changes || [], baseSnap.rows) : [];

  if (!w.ir) return <div className="panel" style={{marginTop:12}}><span className="section-kicker">WHAT-IF SIMULATOR</span><h2>Experiment safely</h2><p className="muted">Generate Contract IR first to start an isolated simulation.</p></div>;

  return <div className="panel" style={{marginTop:12}}>
    <div className="panel-head"><div><span className="section-kicker">WHAT-IF SIMULATOR · ISOLATED</span><h2>Simulate changes without mutating originals</h2></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{!sim ? <Button onClick={start} icon="spark" className={!canSimulate?'disabled':''}>Start simulation</Button> : <><Button kind="secondary" onClick={saveEdits} icon="edit">Save draft edits</Button><Button kind="secondary" onClick={runChecks} icon="refresh" className={busy?'disabled':''}>Re-run validation &amp; parity</Button><Button kind="ghost" onClick={discard} icon="trash">Discard simulation</Button></>}</div></div>
    <div className="prototype-banner"><Icon name="shield" size={16} /><span><b>Simulation safety:</b> isolated copy only. Never overwrites original/approved IR or Solidity, never executes real transactions, never auto-approves. Results are clearly labelled simulation. Creating a revision is explicit.</span><Badge tone="warning">SIMULATION</Badge></div>
    {!sim ? <p className="muted">Start a simulation to modify supported fields (milestone amounts, total agreement amount, review period, milestone completion conditions, dispute behavior, payment release conditions), compare diffs, rerun checks, and regenerate simulation Solidity/tests.</p> : <>
      <div className="contract-grid" style={{marginTop:12}}>
        <div className="panel"><span className="section-kicker">ORIGINAL (READ-ONLY)</span><h3>Base IR {sim.baseIrVersion}</h3><ul style={{margin:'6px 0 0 18px'}}><li>Total: {sim.baseIr?.total_amount}</li><li>Milestones: {(sim.baseIr?.milestones||[]).map((m:any,i:number)=>`${i+1}:${m.name}=${m.amount}`).join(', ')}</li><li>Review period: {sim.baseIr?.review_period_days} days</li><li>Dispute behavior: {sim.baseIr?.dispute_behavior}</li><li>Completion/release: milestone completion required; release requires approval &amp; no active dispute freeze</li></ul><p className="muted">Original approval/Solidity unchanged: {w.approval.status} / {w.solidity.generation.status}.</p></div>
        <div className="panel"><span className="section-kicker">SIMULATION DRAFT (EDITABLE)</span><h3>Modified copy</h3>
          {draft && <div className="form-grid">
            <label>Total agreement amount<input type="number" value={draft.total_amount} onChange={(e)=>setDraft({...draft,total_amount:Number(e.target.value)})} /></label>
            <label>Review period (days)<input type="number" value={draft.review_period_days} onChange={(e)=>setDraft({...draft,review_period_days:Number(e.target.value)})} /></label>
            <label>Dispute behavior<select value={draft.dispute_behavior} onChange={(e)=>setDraft({...draft,dispute_behavior:e.target.value})}><option value="freeze_affected_payment">freeze_affected_payment (supported)</option><option value="release_anyway">release_anyway (unsupported - will fail validation/generation)</option></select></label>
            {(draft.milestones||[]).map((m:any,i:number)=><div key={i} style={{display:'grid',gridTemplateColumns:'1fr 120px',gap:8}}><label>Milestone {i+1} name<input value={m.name} onChange={(e)=>{ const ms=[...draft.milestones]; ms[i]={...ms[i],name:e.target.value}; setDraft({...draft,milestones:ms}); }} /></label><label>Amount<input type="number" value={m.amount} onChange={(e)=>{ const ms=[...draft.milestones]; ms[i]={...ms[i],amount:Number(e.target.value)}; setDraft({...draft,milestones:ms}); }} /></label></div>)}
            <label>Milestone completion conditions<select value={draft._completionMode || 'provider_marks_completed'} onChange={(e)=>setDraft({...draft,_completionMode:e.target.value})}><option value="provider_marks_completed">Provider marks completed; approver approves (supported)</option><option value="auto_complete">Auto-complete without provider action (unsupported simulation)</option></select></label>
            <label>Payment release conditions<select value={draft._releaseMode || 'approval_and_no_dispute'} onChange={(e)=>setDraft({...draft,_releaseMode:e.target.value})}><option value="approval_and_no_dispute">Approval required and dispute freeze enforced (supported)</option><option value="release_without_approval">Release without approval (unsupported simulation)</option></select></label>
          </div>}
          <small className="muted">Edits apply to simulation copy only. Unsupported choices are intentionally rejected by simulation validation/generation.</small>
        </div>
      </div>

      <div className="contract-grid" style={{marginTop:12}}>
        <div className="panel"><span className="section-kicker">FIELD-LEVEL DIFFERENCES</span><h3>Original vs modified IR</h3>{diff.changes.length===0 ? <p className="muted">No differences yet.</p> : <div className="field-table"><div className="field-row head"><span>Field</span><span>Original</span><span>Simulation</span><span>Impact</span></div>{diff.changes.map(c=> <div className="field-row" key={c.field}><code>{c.field}</code><span>{c.from}</span><b>{c.to}</b><span>{c.field.includes('milestone')||c.field==='total_amount'?'payment/milestone impact':c.field==='review_period_days'?'review timing impact':c.field==='dispute_behavior'?'dispute/payment freeze impact':'term impact'}</span></div>)}</div>}<p style={{marginTop:8}}><b>Milestone/payment totals:</b> original {diff.baseSum} → simulation {diff.draftSum} {diff.baseSum!==diff.draftSum ? '(amount impact)' : '(unchanged)'}{diff.milestoneCountChanged ? ' · milestone count changed' : ''}</p></div>
        <div className="panel"><span className="section-kicker">SIMULATION CHECKS &amp; ARTIFACTS</span><h3>Validation / parity / Solidity / tests</h3>
          <div style={{display:'grid',gap:6}}><div className="timeline-row"><span className={'timeline-icon '+(sim.validation.status==='valid'?'success':sim.validation.status==='invalid'?'danger':'warning')}><Icon name={sim.validation.status==='valid'?'check':'alert'} size={14} /></span><div><b>Simulation validation: {sim.validation.status}</b><small>{sim.validation.issues?.[0] || sim.validation.checkedAt || 'Not run'}</small></div></div>
          <div className="timeline-row"><span className={'timeline-icon '+(sim.parity.status==='matched'?'success':sim.parity.status==='mismatched'?'danger':'warning')}><Icon name={sim.parity.status==='matched'?'check':'scan'} size={14} /></span><div><b>Simulation parity: {sim.parity.status}</b><small>Score {sim.parity.score||0}{sim.parity.mismatches?.length?(' · mismatches: '+sim.parity.mismatches.join(', ')):''}</small></div></div>
          <div className="timeline-row"><span className={'timeline-icon '+(sim.solidity?.generation?.status==='success'?'success':sim.solidity?.generation?.status==='error'?'danger':'warning')}><Icon name="code" size={14} /></span><div><b>Simulation Solidity: {sim.solidity?.generation?.status || 'idle'}</b><small>{sim.solidity?.generation?.message || 'Not generated'}{sim.solidity?.generation?.metadata?.deterministicHash ? (' · '+sim.solidity.generation.metadata.deterministicHash):''}</small></div></div>
          <div className="timeline-row"><span className={'timeline-icon '+(sim.solidity?.tests?.status==='passed'?'success':sim.solidity?.tests?.status==='failed'?'danger':'warning')}><Icon name="shield" size={14} /></span><div><b>Simulation tests: {sim.solidity?.tests?.status || 'not_run'}</b><small>{sim.solidity?.tests?.summary || 'Not run'}</small></div></div></div>
          <div style={{marginTop:10,display:'grid',gap:8}}>
            <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!sim.simulationApprovedForGeneration} onChange={toggleSimApproval} /> Explicit simulation approval for generation (isolated; does NOT approve original contract)</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button onClick={generateSim} icon="code" className={busy||sim.validation.status!=='valid'?'disabled':''}>Regenerate simulation Solidity &amp; tests</Button><Button kind="secondary" onClick={createRevision} icon="refresh" className={busy||sim.validation.status!=='valid'?'disabled':''}>Create new revision from simulation (explicit)</Button></div>
          </div>
          {sim.validation.status==='invalid' && <div className="inline-error" style={{marginTop:8}}><Icon name="alert" size={14} /><span><b>Simulation rejected.</b><small>{sim.validation.issues.join(' ')}</small></span></div>}
          {sim.solidity?.generation?.status==='error' && <div className="inline-error" style={{marginTop:8}}><Icon name="alert" size={14} /><span><b>Simulation generation rejected.</b><small>{(sim.solidity.generation.errors||[]).join(' ') || sim.solidity.generation.message}</small></span></div>}
          {sim.solidity?.generation?.status==='success' && sim.solidity?.generation?.source && <details style={{marginTop:8}}><summary>Simulation Solidity source preview (isolated)</summary><pre className="json-view" style={{maxHeight:260,overflow:'auto'}}>{sim.solidity.generation.source}</pre></details>}
        </div>
      </div>

      <div className="panel" style={{marginTop:12}}><span className="section-kicker">AFFECTED CLAUSES, IR, SOLIDITY, TESTS (TRACEABILITY IMPACT)</span>
        <p className="muted">Based on simulation diff against original IR. Original traceability/history remains preserved.</p>
        {affected.length===0 ? <p className="muted">No affected traceability rows detected yet (make and save draft changes, then re-run checks).</p> : <div className="field-table"><div className="field-row head"><span>Clause / IR field</span><span>Original mapping</span><span>Simulation status</span><span>Solidity / tests impact</span></div>{affected.map((r,i)=>{
          const simRow = simSnap?.rows.find(x=>x.clauseId===r.clauseId && x.irField===r.irField);
          return <div className="field-row" key={r.clauseId+r.irField+i}><span><b>{r.clauseId}</b> <code>{r.irField}</code><small>{r.clauseLabel}</small></span><span><small>Val {r.validationStatus} / Par {r.parityStatus}</small></span><span><Badge tone={(simRow?.validationStatus==='valid'&&simRow?.parityStatus!=='mismatched')?'success':simRow?.validationStatus==='invalid'?'danger':'warning'}>{simRow?`Val ${simRow.validationStatus} / Par ${simRow.parityStatus}`:'pending'}</Badge></span><span><small>{(simRow?.solidityElements||r.solidityElements||[]).slice(0,2).join(', ') || 'n/a'}</small><small>{(simRow?.testCases||r.testCases||[]).map(t=>t.id+':'+t.status).slice(0,3).join(', ')}</small></span></div>;
        })}</div>}
      </div>
    </>}
  </div>;
}


function IntegrityPanels({ workflow, role, onNavigate }: { workflow: WorkflowState; role: Role; onNavigate: (path: string) => void }) {
  const w = ensureIntegrityFields(workflow as any) as any;
  const [verA, setVerA] = useState('');
  const [verB, setVerB] = useState('');
  const versions = Array.isArray(w.versionHistory) ? [...w.versionHistory] : [];
  const versionIds = versions.map((v: any) => v.irVersion);
  const audit = getAuditTrail(w as any);
  const auditVerify = verifyAuditTrail(w as any);
  const drift = w.drift || computeDrift(w as any);
  const snapshot = w.approvedSnapshot;
  const actor = () => { const a = effectiveAccount(role); return { name: a.name, role }; };

  const runDrift = () => {
    const cur = readWorkflow() as any;
    const { workflow: nw, report } = detectAndApplyDrift(cur, actor());
    writeWorkflow(nw as any);
    window.dispatchEvent(new CustomEvent('legalx:notice', { detail: report.status === 'drift_detected' ? (report.materialChange ? 'Material drift detected: approval/execution invalidated. Re-review and reapprove required.' : 'Drift detected (non-material).') : report.status === 'unchanged' ? 'No drift: current IR/artifacts match approved snapshot.' : 'No approved snapshot recorded.' }));
  };

  const a = versions.find((v: any) => v.irVersion === verA) || versions[versions.length - 2] || versions[0];
  const b = versions.find((v: any) => v.irVersion === verB) || versions[versions.length - 1] || versions[0];
  const diffRows = (va: any, vb: any) => {
    if (!va?.ir || !vb?.ir) return [] as any[];
    const rows: any[] = [];
    const fields = ['total_amount','review_period_days','dispute_behavior','agreement_type','currency'];
    fields.forEach(f => { if (JSON.stringify(va.ir[f]) !== JSON.stringify(vb.ir[f])) rows.push({ field: f, a: String(va.ir[f]), b: String(vb.ir[f]) }); });
    const am = (va.ir.milestones||[]).map((m:any)=>`${m.name}:${m.amount}`).join(', ');
    const bm = (vb.ir.milestones||[]).map((m:any)=>`${m.name}:${m.amount}`).join(', ');
    if (am !== bm) rows.push({ field: 'milestones', a: am || '—', b: bm || '—' });
    if ((va.solidity?.hash||'') !== (vb.solidity?.hash||'')) rows.push({ field: 'solidity_hash', a: va.solidity?.hash || '—', b: vb.solidity?.hash || '—' });
    if ((va.irHash||'') !== (vb.irHash||'')) rows.push({ field: 'ir_hash', a: va.irHash || '—', b: vb.irHash || '—' });
    return rows;
  };
  const cmp = diffRows(a,b);

  return <>
    <div className="panel" style={{marginTop:12}}>
      <div className="panel-head"><div><span className="section-kicker">CONTRACT DRIFT DETECTION</span><h2>Approved snapshot vs current state</h2></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button onClick={runDrift} icon="scan">Run drift detection</Button><Badge tone={drift.status==='drift_detected' ? (drift.materialChange?'danger':'warning') : drift.status==='unchanged' ? 'success' : 'neutral'}>{drift.status}</Badge></div></div>
      <div className="prototype-banner"><Icon name="shield" size={16} /><span><b>Approved snapshots are never silently updated.</b> Material changes invalidate stale approval and execution readiness and require re-review/reapproval. Detection re-runs validation, parity, and traceability.</span></div>
      {w.approval?.status === 'blocked' && String(w.approval?.note||'').toLowerCase().includes('drift') && <div className="inline-error" style={{marginTop:8,position:'static'}}><Icon name="alert" size={14} /><span><b>Approval invalidated.</b><small>{w.approval.note}</small></span></div>}
      <div className="contract-grid" style={{marginTop:12}}>
        <div className="panel"><span className="section-kicker">APPROVED SNAPSHOT</span>{snapshot ? <ul style={{margin:'6px 0 0 18px'}}>
          <li><b>IR version:</b> {snapshot.irVersion}</li>
          <li><b>IR hash:</b> <code>{snapshot.irHash}</code></li>
          <li><b>Solidity hash:</b> <code>{snapshot.solidityHash || '—'}</code></li>
          <li><b>Approved at/by:</b> {snapshot.approvedAt} · {snapshot.approvedBy} ({snapshot.approvedRole})</li>
        </ul> : <p className="muted">No approved snapshot recorded yet. Grant human approval (when gates pass) to capture a local snapshot.</p>}</div>
        <div className="panel"><span className="section-kicker">CURRENT VS APPROVED</span><div style={{display:'grid',gap:6}}>
          <div className="timeline-row"><span className={'timeline-icon '+(drift.irHashMatches?'success':'danger')}><Icon name={drift.irHashMatches?'check':'alert'} size={14} /></span><div><b>IR hash match:</b> {String(drift.irHashMatches)}</div></div>
          <div className="timeline-row"><span className={'timeline-icon '+(drift.solidityHashMatches?'success':'danger')}><Icon name={drift.solidityHashMatches?'check':'alert'} size={14} /></span><div><b>Solidity hash match:</b> {String(drift.solidityHashMatches)}</div></div>
          <div><b>Checked:</b> {drift.checkedAt || 'not checked'} · <b>Material change:</b> {String(!!drift.materialChange)}</div>
        </div></div>
      </div>
      {drift.status === 'drift_detected' && <div className="panel" style={{marginTop:12}}><span className="section-kicker">DRIFT ALERTS & AFFECTED FIELDS</span>{drift.changes.length === 0 ? <p className="muted">Hash difference detected without parsed field changes.</p> : <div className="field-table"><div className="field-row head"><span>Field</span><span>Expected (approved)</span><span>Current</span><span>Material</span></div>{drift.changes.map((c:any,i:number)=><div className="field-row" key={c.field+i}><code>{c.field}</code><span>{String(c.expected)}</span><b>{String(c.current)}</b><Badge tone={c.material?'danger':'warning'}>{c.material?'material':'non-material'}</Badge></div>)}</div>}</div>}
    </div>

    <div className="panel" style={{marginTop:12}}>
      <div className="panel-head"><div><span className="section-kicker">VERSION HISTORY · INTERACTIVE TIMELINE</span><h2>Revisions, approvals, and comparisons</h2></div><Badge tone="neutral">{versions.length} version(s)</Badge></div>
      <p className="muted">Explicit revisions create versions; previous versions and approvals are preserved. Approved versions are not overwritten accidentally. No fake history generated.</p>
      {versions.length === 0 ? <p className="muted">No version records yet. Extraction, revision, approval, Solidity generation, and tests will record version history.</p> : <div className="lx-version-timeline">{versions.slice().reverse().map((v:any,i:number)=><div className="lx-version-node" key={v.irVersion}><div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><div><b>{v.irVersion}</b> <span className="muted">· {v.summary}</span><div className="muted" style={{marginTop:4}}>{v.createdAt} · {v.createdBy} ({v.createdRole})</div></div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><Badge tone={v.approval?.status==='approved'?'success':'neutral'}>approval: {v.approval?.status || 'none'}</Badge><Badge tone={v.tests?.status==='passed'?'success':v.tests?.status==='failed'?'danger':'warning'}>tests: {v.tests?.status || 'n/a'}</Badge></div></div><div className="muted" style={{marginTop:6}}>IR hash <code>{String(v.irHash||'').slice(0,16)}…</code> · Solidity <code>{String(v.solidity?.hash||'—').slice(0,16)}{v.solidity?.hash?'…':''}</code> · Traceability {v.traceabilitySnapshot ? 'linked' : '—'} · Evidence {(v.links?.sourceEvidence||[]).length}</div></div>)}</div>}
      {versions.length >= 1 && <div style={{marginTop:14}}>
        <span className="section-kicker">VERSION COMPARISON & CHANGED FIELDS</span>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'8px 0'}}>
          <label>Version A <select value={verA} onChange={e=>setVerA(e.target.value)}><option value="">(auto)</option>{versionIds.map(id=> <option key={id} value={id}>{id}</option>)}</select></label>
          <label>Version B <select value={verB} onChange={e=>setVerB(e.target.value)}><option value="">(auto)</option>{versionIds.map(id=> <option key={id} value={id}>{id}</option>)}</select></label>
        </div>
        {a && b ? <>{cmp.length===0 ? <p className="muted">No differences detected in compared fields between <b>{a.irVersion}</b> and <b>{b.irVersion}</b>.</p> : <div className="field-table"><div className="field-row head"><span>Field</span><span>{a.irVersion}</span><span>{b.irVersion}</span><span>Change</span></div>{cmp.map((r:any,i:number)=><div className="field-row" key={r.field+i} style={{background:'color-mix(in srgb,var(--warning-soft) 45%, transparent)'}}><code>{r.field}</code><span>{r.a}</span><b>{r.b}</b><span>changed</span></div>)}</div>}</> : <p className="muted">Select two versions to compare.</p>}
      </div>}
    </div>

    <div className="panel" style={{marginTop:12}}>
      <div className="panel-head"><div><span className="section-kicker">TAMPER-EVIDENT AUDIT TRAIL (LOCAL)</span><h2>Hash-linked event history</h2></div><div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><Badge tone={auditVerify.valid?'success':'danger'}>{auditVerify.valid ? 'Integrity verified' : 'Integrity issues detected'}</Badge><Badge tone="warning">Locally persisted</Badge></div></div>
      <div className="prototype-banner"><Icon name="shield" size={16} /><span><b>{audit.label}</b> Not immutable blockchain storage.</span></div>
      <div style={{margin:'8px 0'}}><b>Verification status:</b> {auditVerify.valid ? `Valid hash chain (${auditVerify.count} events)` : `Invalid (${auditVerify.issues.length} issue(s))`}{!auditVerify.valid && <ul style={{margin:'6px 0 0 18px'}}>{auditVerify.issues.map((iss:string,i:number)=><li key={i}>{iss}</li>)}</ul>}</div>
      {audit.events.length === 0 ? <p className="muted">No audit events recorded yet.</p> : <div className="field-table"><div className="field-row head"><span>Event / Type</span><span>IR / Actor / Time</span><span>Hashes</span><span>Summary</span></div>{[...audit.events].slice().reverse().map((ev:any)=><div className="field-row" key={ev.id}><span><b><code>{ev.id}</code></b><small>{ev.type}</small></span><span><small>IR {ev.irVersion}</small><small>{ev.actor} ({ev.role})</small><small>{ev.timestamp}</small></span><span><small>prev {String(ev.prevEventHash||'GENESIS').slice(0,10)}…</small><small>hash {String(ev.eventHash).slice(0,10)}…</small></span><span>{ev.summary}</span></div>)}</div>}
    </div>
  </>;
}



function ContractIR({ jsonView, setJsonView, onNavigate, workflow, role = 'owner' }: { jsonView: boolean; setJsonView: (x: boolean) => void; onNavigate: (path: string) => void; workflow?: WorkflowState; role?: Role }) {
  const w = workflow || readWorkflow();
  const [selectedField, setSelectedField] = useState('');
  const [copied, setCopied] = useState(false);
  const ir = w.ir as any;
  const validation = w.validation;
  const copyIr = () => { if (!ir) return; navigator.clipboard?.writeText(JSON.stringify(ir, null, 2)); setCopied(true); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Contract IR copied locally. No external data was sent.' })); window.setTimeout(() => setCopied(false), 2200); };
  if (!ir) return <div><PageHeader eyebrow="CONTRACT IR · TECHNICAL INSPECTOR" title="Structured, not mysterious." desc="Generate Contract IR from agreement input before validation and parity." /><div className="panel"><p>No Contract IR yet.</p><p className="muted">Run clause extraction in the AI Workspace to generate the canonical IR (demo/local deterministic).</p><Button onClick={() => onNavigate('/app/ai-workspace')} icon="spark">Open AI Workspace</Button></div></div>;
  const sourceFor = (field: string) => ((ir.provenance||[]).find((p:any)=>p.field===field)||{source:'Derived from extraction'}).source;
  const fields = [
    ['agreement_type', ir.agreement_type, 'Supported', sourceFor('agreement_type')],
    ['total_amount', '₹'+Number(ir.total_amount||0).toLocaleString('en-IN'), 'Supported', sourceFor('total_amount')],
    ['milestones', (ir.milestones||[]).map((m:any)=>m.name+': ₹'+Number(m.amount||0).toLocaleString('en-IN')).join(' · '), 'Supported', sourceFor('milestones')],
    ['review_period_days', String(ir.review_period_days)+' days', 'Supported', sourceFor('review_period_days')],
    ['dispute_behavior', ir.dispute_behavior, 'Supported', sourceFor('dispute_behavior')],
    ['governing_law', ir.governing_law || 'Not supplied', 'Off-chain only', sourceFor('governing_law')],
  ];
  const drift = (w as any).drift;
  const navItems = ['Overview','Field map','Clauses','Integrity','Traceability','What-If'];
  const [section, setSection] = useState('Overview');
  const clauses = (w.traceability?.clauses || []).length ? (w.traceability?.clauses || []) : (ir.provenance || []).map((p:any,i:number)=>({id:`cl-${i+1}`,label:p.field,text:p.source,evidence:p.source,supported:p.support!=='unsupported'}));
  return <div className="lx-ir-inspector">
    <PageHeader eyebrow="CONTRACT IR · STRUCTURED INSPECTOR" title="Canonical fields, evidence, and execution state." desc="Clause navigation, field-level details, provenance/evidence, drift/version/audit, traceability, and isolated what-if simulation." />
    {drift?.status === 'drift_detected' && drift?.materialChange && <div className="inline-error" style={{marginBottom:12}}><Icon name="alert" size={14} /><span><b>Material drift detected.</b><small>Stale approval/execution readiness invalidated. Re-review and reapprove required.</small></span></div>}
    <div className="ir-toolbar"><div className="ir-tabs"><button className={!jsonView ? 'active' : ''} onClick={() => setJsonView(false)}>Structured view</button><button className={jsonView ? 'active' : ''} onClick={() => setJsonView(true)}>JSON view</button></div><div className="ir-toolbar-actions"><Badge tone={validation.status==='valid'?'success':validation.status==='invalid'?'danger':'warning'}>Validation: {validation.status}</Badge><Badge tone="warning">Demo/local IR · {ir.version}</Badge><Button kind="secondary" icon="copy" onClick={copyIr}>{copied ? 'Copied locally' : 'Copy IR'}</Button><Button onClick={() => onNavigate('/app/parity')} icon="scan">Run verification</Button></div></div>
    {jsonView ? <pre className="json-view">{JSON.stringify({ ...ir, validation, mode: w.mode, approvedSnapshot: (w as any).approvedSnapshot, drift: (w as any).drift, versionHistory: ((w as any).versionHistory||[]).map((v:any)=>({irVersion:v.irVersion,irHash:v.irHash,solidityHash:v.solidity?.hash,tests:v.tests,approval:v.approval})), audit: { count: ((w as any).auditTrail?.events||[]).length, integrity: verifyAuditTrail(w as any) }, traceabilitySummary: deriveTraceability(w).summary, simulation: w.simulation ? { active: w.simulation.active, baseIrVersion: w.simulation.baseIrVersion, validation: w.simulation.validation.status, parity: w.simulation.parity.status } : null }, null, 2)}</pre> :
    <div className="lx-ir-shell">
      <aside className="lx-ir-nav panel">
        <span className="section-kicker">CLAUSE / FIELD NAVIGATION</span>
        {navItems.map(n => <button key={n} className={section===n?'active':''} onClick={()=>setSection(n)}>{n}</button>)}
        <div className="panel" style={{marginTop:8,background:'var(--surface2)'}}><b>IR {ir.version}</b><p className="muted" style={{marginTop:6}}>Validation {validation.status}<br/>Parity {w.parity.status}<br/>Approval {w.approval.status}</p></div>
      </aside>
      <div className="lx-ir-main">
        {(section==='Overview' || section==='Field map') && <div className="ir-grid">
          <div className="ir-card panel"><div className="ir-card-head"><span>PARTIES</span><Badge tone="success">source linked</Badge></div><div className="ir-parties"><div className="party"><span className="avatar soft">CL</span><div><small>CLIENT</small><b>{ir?.parties?.client || 'Client / Small business'}</b></div></div><span>↔</span><div className="party"><span className="avatar mint">FR</span><div><small>PROVIDER</small><b>{ir?.parties?.provider || 'Freelance developer'}</b></div></div></div></div>
          <div className="ir-card panel"><div className="ir-card-head"><span>PAYMENT & TERMS</span><Badge tone={validation.status==='valid'?'success':'warning'}>{validation.status==='valid'?'validated':'review'}</Badge></div><div className="ir-big">₹{Number(ir.total_amount||0).toLocaleString('en-IN')} <small>{ir.currency} total</small></div><div className="mini-legend"><span><i />₹{Number(ir.milestones?.[0]?.amount||0).toLocaleString('en-IN')} · {ir.milestones?.[0]?.name}</span><span><i />₹{Number(ir.milestones?.[1]?.amount||0).toLocaleString('en-IN')} · {ir.milestones?.[1]?.name}</span></div><p className="muted" style={{marginTop:10}}>Review {ir.review_period_days} days · Dispute: {String(ir.dispute_behavior||'').replace(/_/g,' ')}</p></div>
          <div className="ir-card panel full"><div className="ir-card-head"><span>FIELD MAP &amp; EVIDENCE</span><small>Select a field to inspect provenance and execution support</small></div><div className="field-table"><div className="field-row head"><span>Contract field</span><span>Resolved value</span><span>Execution support</span><span>Source / evidence</span></div>{fields.map(([key, value, support, source]) => <button className={'field-row field-row-button '+(selectedField === key ? 'selected' : '')} key={key} onClick={() => setSelectedField(key)}><code>{key}</code><b>{String(value)}</b><Badge tone={support === 'Supported' ? 'success' : 'neutral'}>{support}</Badge><span>{String(source)}</span></button>)}</div>{selectedField && <div className="field-inspector"><span className="section-kicker">FIELD INSPECTOR</span><b>{selectedField}</b><p>Evidence: {sourceFor(selectedField)} — reviewed before parity/approval. Canonical IR field: <code>{selectedField}</code>.</p></div>}</div>
        </div>}
        {(section==='Overview' || section==='Clauses') && <div className="panel"><div className="panel-head"><div><span className="section-kicker">CLAUSES & EVIDENCE REFERENCES</span><h2>Expandable clause details</h2></div><Badge tone="neutral">{clauses.length} items</Badge></div><div style={{display:'grid',gap:8}}>{clauses.map((c:any,i:number)=><details key={c.id||i} className="field-inspector"><summary style={{cursor:'pointer',fontWeight:600}}><code>{c.id || `cl-${i+1}`}</code> {c.label || c.field || 'Clause'} <Badge tone={c.supported===false?'warning':'success'}>{c.supported===false?'review':'supported'}</Badge></summary><p style={{marginTop:8}}><b>Text/Evidence:</b> {c.text || c.evidence || c.source || '—'}</p><p><b>IR fields:</b> {(c.irFields||[c.field||'—']).join(', ')} {c.irVersion ? `· IR ${c.irVersion}` : ''}</p></details>)}</div></div>}
        {(ir as any).extractionConfidence !== undefined || (ir as any).missingClauses?.length || (ir as any).ambiguousClauses?.length || (ir as any).clauses?.length || (ir as any).evidenceReferences?.length ? <div className="panel"><div className="panel-head"><div><span className="section-kicker">CONTRACT INTELLIGENCE (BACKEND-READY)</span><h2>Signals and references</h2></div></div>{(ir as any).extractionConfidence !== undefined && <p><b>Extraction confidence (backend):</b> {String((ir as any).extractionConfidence)}</p>}{((ir as any).missingClauses?.length || (ir as any).ambiguousClauses?.length) ? <ul style={{margin:'6px 0 0 18px'}}>{((ir as any).missingClauses||[]).map((c:string,i:number)=><li key={'m'+i}>Missing: {c}</li>)}{((ir as any).ambiguousClauses||[]).map((c:string,i:number)=><li key={'a'+i}>Ambiguous: {c}</li>)}</ul> : <p className="muted">No backend-reported missing/ambiguous clauses or confidence payload in current state.</p>}</div> : null}
        {(section==='Overview' || section==='Integrity') && <IntegrityPanels workflow={w} role={role} onNavigate={onNavigate} />}
        {(section==='Overview' || section==='Traceability') && <TraceabilityExplorer workflow={w} />}
        {(section==='Overview' || section==='What-If') && <WhatIfSimulator workflow={w} role={role} />}
      </div>
    </div>}
  </div>;
}



function ParityStudio({ tampered, setTampered, score, onNavigate, workflow, role = 'owner' }: { tampered: boolean; setTampered: (x: boolean) => void; score: number; onNavigate: (path: string) => void; workflow?: WorkflowState; role?: Role }) {
  const w = workflow || readWorkflow();
  const ir = w.ir as any; const parity = w.parity; const validation = w.validation;
  const [lastRun, setLastRun] = useState(parity.checkedAt || 'Not run in this session');
  const blocked = !ir || validation.status !== 'valid' || parity.status === 'mismatched' || parity.status === 'blocked';
  const matched = parity.status === 'matched' && !tampered;
  const canRun = !!ir && validation.status === 'valid';
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
  const rows = [
    { id:'total_amount', label:'Total amount', ir: ir ? `₹${Number(ir.total_amount||0).toLocaleString('en-IN')}` : '—', exec: `₹${Number(parity.executionParams.total||0).toLocaleString('en-IN')}`, ok: !parity.mismatches.includes('total_amount') },
    { id:'milestones', label:'Milestone amounts', ir: ir ? (ir.milestones||[]).map((m:any)=>m.amount).join(' + ') : '—', exec: parity.executionParams.milestones.join(' + '), ok: !parity.mismatches.includes('milestones') },
    { id:'review_period_days', label:'Review window', ir: ir ? `${ir.review_period_days} days` : '—', exec: `${parity.executionParams.reviewDays} days`, ok: !parity.mismatches.includes('review_period_days') },
    { id:'dispute_behavior', label:'Dispute freeze', ir: ir ? ir.dispute_behavior : '—', exec: String(parity.executionParams.disputeFreeze), ok: !parity.mismatches.includes('dispute_behavior') },
  ];
  const blocking = (((parity as any).blockingReasons && (parity as any).blockingReasons.length) ? (parity as any).blockingReasons : parity.mismatches.map(m=>`Mismatch blocks execution: ${m}`));
  return <div className="lx-parity-studio">
    <PageHeader eyebrow="PARITY STUDIO · COMPARISON WORKSPACE" title="Agreement vs execution logic." desc="Two-column comparison, mismatch highlighting, blocking reasons, and readiness indicators. Backend parity responses are authoritative when integrated; frontend does not override them." action={tampered ? 'Restore terms' : 'Simulate tamper'} onAction={() => setTampered(!tampered)} />
    {!ir && <div className="panel"><p>No Contract IR available for parity verification.</p><Button onClick={() => onNavigate('/app/ai-workspace')} icon="spark">Generate IR</Button></div>}
    <div className="panel lx-ready-strip">
      <div><span className="section-kicker">PARITY SCORE</span><h2 style={{margin:'4px 0'}}>{score || parity.score || 0}%</h2><Badge tone={matched?'success':blocked?'danger':'warning'}>{parity.status}</Badge></div>
      <div><span className="section-kicker">VALIDATION</span><h3 style={{margin:'6px 0'}}>{validation.status}</h3><p className="muted">{validation.issues?.[0] || 'IR checks state'}</p></div>
      <div><span className="section-kicker">APPROVAL</span><h3 style={{margin:'6px 0'}}>{w.approval.status}</h3><p className="muted">Human approval required</p></div>
      <div><span className="section-kicker">EXECUTION</span><h3 style={{margin:'6px 0'}}>{w.execution.status}</h3><p className="muted">{blocked || !matched ? 'Blocked until gates pass' : 'Ready when all gates satisfied'}</p></div>
    </div>

    <div className="lx-parity-board" style={{marginTop:14}}>
      <section className="lx-compare-col">
        <div className="lx-compare-head"><span><Icon name="database" size={16} /> Contract IR (canonical)</span><Badge tone={validation.status==='valid'?'success':'warning'}>{ir?.version || '—'}</Badge></div>
        <div className="lx-compare-body">{rows.map(r => <div key={r.id} className={`lx-compare-row ${r.ok?'match':'mismatch'}`}><div><b>{r.label}</b><div className="muted"><code>{r.id}</code></div></div><Badge tone={r.ok?'success':'danger'}>{r.ok?'match':'mismatch'}</Badge><div><small className="muted">IR value</small><div><b>{r.ir}</b></div></div></div>)}</div>
      </section>
      <section className="lx-compare-col">
        <div className="lx-compare-head"><span><Icon name="code" size={16} /> Execution parameters</span><Badge tone={matched?'success':'danger'}>{matched?'aligned':'blocked/mismatch'}</Badge></div>
        <div className="lx-compare-body">{rows.map(r => <div key={r.id} className={`lx-compare-row ${r.ok?'match':'mismatch'}`}><div><b>{r.label}</b><div className="muted">execution</div></div><Icon name={r.ok?'check':'alert'} size={15} /><div><small className="muted">Execution value</small><div><b>{r.exec}</b></div></div></div>)}</div>
      </section>
    </div>

    <div className="panel verification-next" style={{marginTop:14, display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center'}}>
      <div><span className="section-kicker">VERIFICATION ACTIONS</span><p className="muted" style={{marginTop:6}}>{lastRun} · {matched ? 'Supported fields match validated IR.' : 'Resolve mismatches/validation issues before approval and execution.'}</p></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button onClick={runVerification} icon="scan" className={!canRun?'disabled':''}>Run verification</Button><Button kind="secondary" onClick={()=>onNavigate('/app/contract-ir')} icon="database">Inspect IR</Button><Button kind="secondary" onClick={()=>onNavigate('/app/team')} icon="users">Open team review</Button></div>
    </div>

    {(blocking.length>0 || !matched) && <div className="panel" style={{marginTop:12,borderColor:'color-mix(in srgb,var(--danger) 35%, var(--line))'}}><span className="section-kicker">BLOCKING REASONS / MISMATCHES</span><ul style={{margin:'6px 0 0 18px'}}>{(blocking.length?blocking:['Prerequisites not satisfied for execution readiness.']).map((r:string,i:number)=><li key={i}>{r}</li>)}</ul><p className="muted">Backend parity decisions are authoritative when integrated; frontend does not override or independently calculate backend outcomes.</p></div>}
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
    <PageHeader eyebrow="SMART CONTRACTS · DEVELOPER WORKSPACE" title="Generate, inspect, and test Solidity." desc="Deterministic Solidity from validated/approved Contract IR. Compilation/runtime requires Solidity tooling (not detected); generation/security checks run locally. No real deployment." />
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



function Milestones({ role = 'owner' }: { role?: Role }) { const restricted = maskFinancials(role) ? 'Restricted' : null; const [items, setItems] = useState(() => readJson(MILESTONES_KEY, milestones)); const [showForm, setShowForm] = useState(false); const [label, setLabel] = useState(''); const [detail, setDetail] = useState(''); const addMilestone = () => { if (!hasPermission(role, 'milestone:submit') && !hasPermission(role, 'milestone:approve')) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'This role can review milestones but cannot create one.' })); return } if (!label.trim()) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Add a milestone name before saving.' })); return } const next = [...items, { id: `local-${Date.now()}`, label: label.trim(), amount: 'Pending', percent: 0, detail: detail.trim() || 'New milestone awaiting terms.', status: 'Draft' }]; setItems(next); writeJson(MILESTONES_KEY, next); setLabel(''); setDetail(''); setShowForm(false); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Milestone saved to the local agreement workflow.' })) }; return <div><PageHeader eyebrow="MILESTONE TRACKING" title="Progress with a paper trail." desc="Milestones stay connected to the terms, review windows, releases, and disputes that define them." action={showForm ? 'Close form' : 'Add milestone'} onAction={() => setShowForm(!showForm)} />{showForm && <div className="panel inline-form"><div className="form-grid"><label>Milestone name<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Final handoff" /></label><label>What completes it<input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Release after written approval" /></label></div><Button onClick={addMilestone} icon="check">Save milestone</Button></div>}<div className="milestone-summary"><div><span className="section-kicker">TOTAL VALUE</span><strong>{restricted ?? '₹50,000'}</strong><small>{items.length} milestones · 40% released</small></div><div className="progress-large"><div><span>Overall progress</span><b>40%</b></div><i><em /></i><small>{restricted ? 'Financial details restricted for this role' : '₹20,000 released · ₹30,000 pending'}</small></div><Badge tone="success">On track</Badge></div><div className="milestone-list">{items.map((m, i) => <div className="milestone-detail-row panel" key={m.id}><span className={`milestone-number ${i === 0 ? 'done' : ''}`}>0{i + 1}</span><div className="milestone-main"><div><span className="section-kicker">MILESTONE 0{i + 1}</span><h2>{m.label}</h2><p>{m.detail}</p></div><Badge tone={i === 0 ? 'success' : m.status === 'Draft' ? 'neutral' : 'warning'}>{m.status}</Badge></div><div className="milestone-side"><strong>{restricted ?? m.amount}</strong><div><i style={{ width: `${m.percent}%` }} /></div><small>{i === 0 ? 'Released Nov 04' : m.status === 'Draft' ? 'Draft · terms required' : 'Review window opens on delivery'}</small></div></div>)}</div></div> }function Transactions({ role = 'owner' }: { role?: Role }) { const [query, setQuery] = useState(''); const [exported, setExported] = useState(false); const [exportBusy, setExportBusy] = useState(false); const data = [['Milestone released', 'Website project', maskFinancials(role) ? 'Restricted' : '₹20,000', 'Confirmed', 'Nov 04'], ['Contract funded', 'Brand retainer', maskFinancials(role) ? 'Restricted' : '₹60,000', 'Confirmed', 'Oct 28'], ['Wallet approval', 'Website project', '—', 'Signed', 'Oct 30'], ['Dispute freeze', 'Mobile app build', maskFinancials(role) ? 'Restricted' : '₹80,000', 'Blocked', 'Oct 22']].filter((row) => row.join(' ').toLowerCase().includes(query.toLowerCase())); const exportCsv = () => { if (exportBusy) return; const guard = guardDemoOperation('CSV export'); if (!guard.allowed) { window.dispatchEvent(new CustomEvent('legalx:notice', { detail: guard.message })); return } setExportBusy(true); const csv = [['Event','Agreement','Amount','Status','When'], ...data].map((row) => row.join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'legalx-demo-transactions.csv'; a.click(); window.setTimeout(() => { URL.revokeObjectURL(a.href); setExported(true); setExportBusy(false); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'CSV export confirmed locally · simulated download only' })) }, 0) }; return <div><PageHeader eyebrow="TRANSACTIONS" title="Every movement, accounted for." desc="A transparent activity log for funds, signatures, and contract events." /><div className="panel transaction-panel"><div className="toolbar"><div className="search-field"><Icon name="search" size={15} /><input placeholder="Search transactions" value={query} onChange={(e) => setQuery(e.target.value)} /></div><Button kind="secondary" onClick={exportCsv} icon="download">{exportBusy ? 'Preparing export…' : 'Export CSV'}</Button>{exported && <Badge tone="warning">Simulated download recorded</Badge>}</div><div className="transaction-table"><div className="transaction-row header"><span>Event</span><span>Agreement</span><span>Amount</span><span>Status</span><span>When</span></div>{data.map(([a,b,c,d,e]) => <div className="transaction-row" key={`${a}${b}`}><span><i className={d === 'Blocked' ? 'red-dot' : 'green-dot'} />{a}</span><span>{b}</span><b>{c}</b><Badge tone={d === 'Blocked' ? 'danger' : d === 'Signed' ? 'warning' : 'success'}>{d}</Badge><small>{e}</small></div>)}</div></div></div> }
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
  return <div><PageHeader eyebrow="ACTIVITY LOG" title="The evidence trail." desc="Chronological workflow events plus hash-linked audit trail and integrity verification (demo/local, tamper-evident within local storage limitations)." />
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
  return <div><PageHeader eyebrow="TEAM WORKSPACE · REVIEW &amp; APPROVAL" title="Shared context, clear ownership." desc="Review comments, revisions, and human approval are recorded in workflow state. Execution is blocked until validation+parity pass and a permitted human approves." action={showForm ? 'Close invite form' : 'Invite member'} onAction={() => setShowForm(!showForm)} />
    {showForm && <div className="panel inline-form"><div className="form-grid"><label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reviewer name" /></label><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="reviewer@company.com" /></label><label>Role<select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>{DEMO_ACCOUNTS.map((demo) => <option key={demo.role} value={demo.role}>{ROLE_LABELS[demo.role]}</option>)}</select></label></div><Button onClick={submitInvite} icon="check">Stage invite</Button></div>}
    <div className="prototype-banner"><Icon name={exec.status==='ready'?'check':'alert'} size={16} /><span><b>Execution readiness: {exec.status.toUpperCase()}.</b> {exec.reason}</span><Badge tone={exec.status==='ready'?'success':'danger'}>{w.approval.status}</Badge></div>
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
function Notifications() { type NotificationItem = [string, string, string, string, boolean]; const initial: NotificationItem[] = [['Parity check passed', 'Website project is ready for human review.', 'Just now', 'success', false], ['Deadline approaching', 'Design review window closes in 5 days.', '2 hours ago', 'warning', false], ['Invitation pending', 'QA reviewer has not accepted the invite.', 'Yesterday', 'neutral', false], ['Mismatch resolved', 'Website project review window was restored.', 'Nov 02', 'success', true]]; const [items, setItems] = useState<NotificationItem[]>(() => readJson(NOTIFICATIONS_KEY, initial)); const unread = items.filter((item) => !item[4]).length; const persist = (next: NotificationItem[]) => { setItems(next); writeJson(NOTIFICATIONS_KEY, next) }; const markAll = () => persist(items.map((item) => [item[0], item[1], item[2], item[3], true])); return <div><PageHeader eyebrow="NOTIFICATIONS" title="Nothing important gets lost." desc="Review deadlines, mismatches, approvals, and workspace updates." action={unread ? `Mark all read · ${unread}` : 'All caught up'} onAction={markAll} /><div className="notification-list panel">{items.map(([a,b,c,tone,read], index) => <button className="notification-row" style={{ opacity: read ? .55 : 1 }} onClick={() => persist(items.map((item, i) => i === index ? [item[0], item[1], item[2], item[3], true] : item))} key={a}><span className={`notification-icon ${tone}`}><Icon name={tone === 'success' ? 'check' : tone === 'warning' ? 'clock' : 'bell'} size={15} /></span><span><b>{a}</b><small>{b}</small></span><time>{c}</time><Icon name="chevron" size={15} /></button>)}</div></div> }function Help() { return <div><PageHeader eyebrow="HELP & SUPPORT" title="Clear answers, human limits." desc="Understand what LEGALX does, what it checks, and where human judgment remains necessary." /><div className="faq-grid"><div className="panel faq-card"><span className="section-kicker">COMMON QUESTIONS</span>{[['Does LEGALX make an agreement legally enforceable?', 'No. LEGALX checks consistency between a written agreement and supported executable payment logic. It is not legal advice and does not guarantee enforceability.'], ['What happens when information is missing?', 'The AI workspace is designed to ask clarification questions instead of silently inventing terms.'], ['Can I deploy from this prototype?', 'No. Wallet connection and transactions are intentionally not active. The contract workspace shows the honest state of the planned flow.']].map(([q,a]) => <details key={q}><summary>{q}<Icon name="chevron" size={15} /></summary><p>{a}</p></details>)}</div><div className="panel contact-card"><Icon name="help" size={24} /><h2>Still need help?</h2><p>Send the Lexora team a note about your workflow or the terms you want to inspect.</p><Button onClick={() => window.open('mailto:hello@lexora.example')} icon="arrow">Contact Lexora</Button></div></div></div> }

function Settings({ role, onRoleChange }: { role: Role; onRoleChange: (role: Role) => void }) { const profile = readStoredProfile() || defaultProfile(role); const [saved, setSaved] = useState(false); const [activeTab, setActiveTab] = useState('Profile'); const [name, setName] = useState(profile.name); const [email, setEmail] = useState(profile.email); const [workspaceName, setWorkspaceName] = useState(profile.workspaceName); const [jobTitle, setJobTitle] = useState(profile.jobTitle); const [useCase, setUseCase] = useState(profile.useCase); const [settings, setSettings] = useState<DemoSettings>(readSettings); const tabs = ['Profile', 'Notifications', 'Review gates', 'Security']; const update = <K extends keyof DemoSettings>(key: K, value: DemoSettings[K]) => setSettings((current) => ({ ...current, [key]: value })); const save = () => { saveProfile({ ...profile, role, name, email, workspaceName, jobTitle, useCase }); saveSettings(settings); setSaved(true); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Settings saved locally and synced across the workspace.' })) }; return <div><PageHeader eyebrow="SETTINGS" title="Your workspace, your rules." desc="Manage profile, notifications, review defaults, and prototype preferences." /><div className="settings-grid"><div className="settings-nav">{tabs.map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => { setActiveTab(tab); setSaved(false) }}><Icon name={tab === 'Profile' ? 'users' : tab === 'Notifications' ? 'bell' : tab === 'Review gates' ? 'shield' : 'lock'} size={15} /> {tab}</button>)}</div><div className="panel settings-form"><Badge tone="crimson">Editing {activeTab.toLowerCase()}</Badge>{activeTab === 'Profile' && <div className="settings-section"><span className="section-kicker">PROFILE</span><h2>How should LEGALX know you?</h2><div className="form-grid"><label>Full name<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Workspace name<input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} /></label><label>Job title<input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label><label>Active role<select value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>{DEMO_ACCOUNTS.map((account) => <option key={account.role} value={account.role}>{ROLE_LABELS[account.role]}</option>)}</select></label><label>Primary use case<select value={useCase} onChange={(e) => setUseCase(e.target.value)}><option>Freelance agreements</option><option>Agency retainers</option><option>Startup vendor contracts</option></select></label></div></div>}{activeTab === 'Notifications' && <div className="settings-section"><span className="section-kicker">NOTIFICATIONS</span><h2>Keep the right people in the loop.</h2><label className="toggle-row"><span><b>Email notifications</b><small>Keep this local demo preference ready for production notification delivery.</small></span><input type="checkbox" checked={settings.emailNotifications} onChange={(e) => update('emailNotifications', e.target.checked)} /></label></div>}{activeTab === 'Review gates' && <div className="settings-section"><span className="section-kicker">REVIEW PREFERENCES</span><h2>Keep humans in the loop.</h2><label className="toggle-row"><span><b>Block critical mismatches</b><small>Never allow a mismatched contract to proceed to an execution action.</small></span><input type="checkbox" checked={settings.blockCriticalMismatches} onChange={(e) => update('blockCriticalMismatches', e.target.checked)} /></label><label className="toggle-row"><span><b>Ask for source clauses</b><small>Require every extracted field to preserve its originating sentence.</small></span><input type="checkbox" checked={settings.askForSourceClauses} onChange={(e) => update('askForSourceClauses', e.target.checked)} /></label></div>}{activeTab === 'Security' && <div className="settings-section"><span className="section-kicker">SECURITY</span><h2>Make sensitive actions intentional.</h2><label className="toggle-row"><span><b>Require wallet confirmation</b><small>Keep a second confirmation step before any supported wallet action.</small></span><input type="checkbox" checked={settings.requireWalletConfirmation} onChange={(e) => update('requireWalletConfirmation', e.target.checked)} /></label><div className="permission"><Icon name="shield" size={16} /><span>Current identity <b>{ROLE_LABELS[role]}</b></span></div><div className="permission"><Icon name="lock" size={16} /><span>Production authentication <b>Not connected</b></span></div></div>}<div className="settings-footer">{saved && <Badge tone="success">Saved locally</Badge>}<Button kind="secondary" onClick={() => { if (!window.confirm('Reset only local LEGALX demo state? Production data is not connected and will not be touched.')) return; Object.keys(localStorage).filter((key) => key.startsWith('legalx:')).forEach((key) => localStorage.removeItem(key)); window.location.reload() }}>Reset demo</Button><Button onClick={save} icon="check">Save changes</Button></div></div></div></div> }const DEMO_STEPS: { title: string; summary: string; path: string; role: Role; status: 'supported' | 'simulated' | 'blocked' }[] = [
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
  const [notice, setNotice] = useState('Ready when you are.'); const [networkMode, setNetworkMode] = useState<'normal' | 'slow' | 'offline'>(() => (localStorage.getItem('legalx:network-mode') as 'normal' | 'slow' | 'offline') || 'normal')
  const current = DEMO_STEPS[Math.min(Math.max(step, 0), DEMO_STEPS.length - 1)]
  useEffect(() => { localStorage.setItem('legalx:guided-step', String(step)); localStorage.setItem('legalx:guided-active', String(active)); localStorage.setItem('legalx:guided-paused', String(paused)) }, [step, active, paused])
  const openStep = (index: number) => { const next = DEMO_STEPS[index]; localStorage.setItem('legalx:guided-step', String(index)); localStorage.setItem('legalx:guided-active', 'true'); localStorage.setItem('legalx:guided-paused', 'false'); setStep(index); setActive(true); setPaused(false); onRoleChange(next.role); onNavigate(next.path); setNotice(`Step ${index + 1} opened · ${next.status === 'supported' ? 'supported UI path' : next.status === 'simulated' ? 'simulation clearly labelled' : 'external integration blocked'}`) }
  const setNetwork = (mode: 'normal' | 'slow' | 'offline') => { localStorage.setItem('legalx:network-mode', mode); setNetworkMode(mode); window.dispatchEvent(new Event('legalx:network-mode')); setNotice(mode === 'normal' ? 'Failure simulation cleared. No operation was marked successful.' : `${mode === 'offline' ? 'Offline' : 'Slow network'} mode simulated. Operations stay pending.`) }; const reset = () => { if (!window.confirm('Reset only local LEGALX demo state? Production data is not connected and will not be touched.')) return; Object.keys(localStorage).filter((key) => key.startsWith('legalx:')).forEach((key) => localStorage.removeItem(key)); setStep(0); setActive(false); setPaused(false); setNotice('Local demo reset safely. No production data was touched.') }
  return <div className="demo-center"><PublicNav active="/demo" /><main className="demo-center-main"><div className="demo-center-head"><div><Badge tone="crimson">JUDGE MODE · LOCAL DEMO</Badge><h1>Show the trust layer<br /><em>without the theatre.</em></h1><p>A short, honest walkthrough of the LEGALX concept. Every step is either a supported local interaction, a clearly labelled simulation, or an external integration that remains blocked.</p></div><div className="demo-session-card"><span className="section-kicker">DEMO CONTROL CENTER</span><b>{active ? (paused ? 'Paused' : 'In progress') : 'Ready to start'}</b><small>Local browser state · no production session</small><Badge tone={active ? 'success' : 'neutral'}>{active ? `${step + 1} / ${DEMO_STEPS.length}` : 'SAFE TO RESET'}</Badge></div></div><div className="demo-progress"><div><span>GUIDED DEMO PROGRESS</span><b>{active ? `${Math.round(((step + 1) / DEMO_STEPS.length) * 100)}%` : '0%'}</b></div><i><em style={{ width: `${active ? ((step + 1) / DEMO_STEPS.length) * 100 : 0}%` }} /></i></div><div className="demo-center-grid"><section className="panel demo-step-panel"><div className="panel-head"><div><span className="section-kicker">CURRENT STEP · {step + 1} OF {DEMO_STEPS.length}</span><h2>{current.title}</h2></div><Badge tone={current.status === 'supported' ? 'success' : current.status === 'simulated' ? 'warning' : 'danger'}>{current.status}</Badge></div><p>{current.summary}</p><div className="demo-step-actions"><Button onClick={() => openStep(step)} icon="play">{active ? 'Resume this step' : 'Start guided demo'}</Button><Button kind="secondary" onClick={() => { setPaused(!paused); setNotice(paused ? 'Guided demo resumed.' : 'Guided demo paused safely.') }} icon={paused ? 'play' : 'clock'}>{paused ? 'Resume' : 'Pause'}</Button><Button kind="ghost" onClick={() => { setActive(false); localStorage.setItem('legalx:guided-active', 'false'); setNotice('Guided demo exited. Your local step is preserved for recovery.') }}>Exit</Button></div><div className="demo-notice"><Icon name={notice.includes('blocked') ? 'alert' : 'check'} size={15} /><span>{notice}</span></div></section><aside className="panel demo-scenario-list"><span className="section-kicker">JUMP TO A SCENARIO</span>{DEMO_STEPS.map((item, index) => <button key={item.title} className={index === step ? 'active' : ''} onClick={() => openStep(index)}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{item.title}</b><small>{item.status === 'supported' ? 'Supported local path' : item.status === 'simulated' ? 'Simulation · disclose it' : 'Blocked · explain it'}</small></div><Icon name="chevron" size={15} /></button>)}</aside></div><div className="demo-center-footer"><div><Button kind="secondary" onClick={() => { const previous = Math.max(step - 1, 0); openStep(previous) }} icon="arrow">Previous</Button><Button kind="secondary" onClick={() => { const next = Math.min(step + 1, DEMO_STEPS.length - 1); openStep(next) }} icon="arrow">Next</Button></div><Button kind="ghost" onClick={reset} icon="refresh">Reset local demo safely</Button></div><div className="panel demo-network-panel"><span className="section-kicker">FAILURE REHEARSAL</span><h3>Network and provider guardrails.</h3><p>Exercise the honest failure path. These controls are local-only; they never fake a successful API, AI, upload, export, wallet, or transaction.</p><div className="demo-network-actions"><Button kind={networkMode === 'offline' ? 'danger' : 'secondary'} onClick={() => setNetwork(networkMode === 'offline' ? 'normal' : 'offline')} icon="alert">{networkMode === 'offline' ? 'Clear offline mode' : 'Simulate offline'}</Button><Button kind={networkMode === 'slow' ? 'primary' : 'secondary'} onClick={() => setNetwork(networkMode === 'slow' ? 'normal' : 'slow')} icon="clock">{networkMode === 'slow' ? 'Clear slow mode' : 'Simulate slow network'}</Button></div><small className="demo-mode-label">Current: {networkMode === 'normal' ? 'normal network' : networkMode === 'slow' ? 'slow network · pending only' : 'offline · blocked operations'}</small></div><div className="demo-boundary-grid"><div className="panel"><span className="section-kicker">RECOVERY</span><h3>Nothing is hidden when something fails.</h3><p>Refreshes preserve the guided step. Accidental navigation can return here through the resume banner. This static demo has no expiring live session, API request, upload, or transaction to silently claim succeeded.</p></div><div className="panel"><span className="section-kicker">JUDGE PROMPT</span><h3>Ask “what is real?”</h3><p>Real: the shared UI, route policy, local parity state, role boundaries, and deterministic tests. Simulated or blocked: AI, storage, database, wallet, blockchain, and production authorization.</p></div></div></main><Footer /></div>
}

function Onboarding({ onNavigate, onRoleChange }: { onNavigate: (p: string) => void; onRoleChange: (role: Role) => void }) { const stored = readStoredProfile(); const [step, setStep] = useState(1); const [selected, setSelected] = useState<Role>(() => stored?.role || (localStorage.getItem('legalx:role') as Role) || 'owner'); const choices: [Role, string][] = [['owner', 'Agreement owner'], ['freelancer', 'Freelancer / contractor'], ['legal_reviewer', 'Legal reviewer'], ['org_admin', 'Organization admin'], ['technical_auditor', 'Technical auditor']]; const confirmRole = () => { const profile = readStoredProfile() || defaultProfile(selected); saveProfile({ ...profile, role: selected }); localStorage.setItem('legalx:role', selected); onRoleChange(selected) }; return <div className="onboarding"><Logo light /><div className="onboarding-card panel">{step === 1 && <><Badge tone="crimson">WELCOME TO LEGALX</Badge><h1>Let’s make your agreements<br /><em>inspectable.</em></h1><p>LEGALX is one connected workspace. Your role changes what you can see and do without duplicating the product.</p><Button onClick={() => setStep(2)} icon="arrow">Choose your role</Button><button className="skip" onClick={() => onNavigate('/app')}>Skip for now</button></>}{step === 2 && <><span className="section-kicker">STEP 1 OF 2</span><h1>What is your responsibility?</h1><p>Choose a demo identity. Your name, email, and workspace stay connected while the role changes permissions.</p><div className="choice-grid role-choice-grid">{choices.map(([role, label]) => <button key={role} className={selected === role ? 'selected' : ''} onClick={() => setSelected(role)}><span>{ROLE_LABELS[role][0]}</span>{label}<small>{ROLE_DESCRIPTIONS[role]}</small></button>)}</div><Button onClick={() => { confirmRole(); setStep(3) }} icon="arrow">Continue as {ROLE_LABELS[selected]}</Button></>}{step === 3 && <><span className="section-kicker">STEP 2 OF 2</span><h1>Your dashboard is<br /><em>permission-aware.</em></h1><p>You are entering the shared {readStoredProfile()?.workspaceName || 'Acme Digital'} workspace as <b>{ROLE_LABELS[selected]}</b>. Unauthorized agreement, financial, and admin data stays blocked.</p><div className="onboarding-perks"><span><Icon name="shield" size={16} /> Deny-by-default access checks</span><span><Icon name="database" size={16} /> Same agreement, role-specific view</span><span><Icon name="scan" size={16} /> Audit evidence stays immutable</span></div><Button onClick={() => { confirmRole(); onNavigate('/app') }} icon="arrow">Enter role dashboard</Button></>}</div><div className="onboarding-progress"><i className={step >= 1 ? 'on' : ''} /><i className={step >= 2 ? 'on' : ''} /><i className={step >= 3 ? 'on' : ''} /></div></div> }function InfoPage({ kind }: { kind: 'privacy' | 'terms' }) { const title = kind === 'privacy' ? 'Privacy, in plain language.' : 'Terms for a prototype product.'; return <div className="marketing"><PublicNav active="" /><main className="info-page"><span className="section-kicker">LEXORA · {kind.toUpperCase()}</span><h1>{title}</h1><p className="info-lede">LEGALX is a product prototype. This page describes the boundaries of the experience while the production legal and privacy documents are prepared.</p><div className="info-grid"><section><h2>{kind === 'privacy' ? 'What we collect in this prototype' : 'What this prototype is'}</h2><p>Local demo inputs are held in browser memory for the current session. No production account, wallet, payment, or document storage is connected in this build.</p><h2>{kind === 'privacy' ? 'What we do not do' : 'Important limitations'}</h2><p>We do not claim legal correctness, enforceability, real blockchain execution, or live AI processing. Never paste private keys, seed phrases, or sensitive production agreements into the demo.</p></section><aside className="panel info-aside"><Icon name="shield" size={22} /><b>Trust boundary</b><span>Technical verification can show consistency. It cannot replace legal advice or decide legal liability.</span></aside></div></main><Footer /></div> }
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
    <PageHeader eyebrow="AGREEMENT DETAIL · DOSSIER" title="Website project" desc="Structured agreement dossier: metadata, workflow gates, version/approval timeline, and evidence status. Backend-sourced details connect when available; current view reflects demo/local state." action="Run parity" onAction={() => onNavigate('/app/parity')} />
    <section className="panel lx-hero-panel" style={{marginBottom:14}}>
      <div>
        <span className="section-kicker">AGREEMENT DOSSIER</span>
        <h1 style={{font:'600 clamp(30px,3vw,44px)/1.05 var(--display)',margin:'8px 0'}}>Freelance Website Development</h1>
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

function Profile({ role }: { role: Role }) { const account = effectiveAccount(role); const stored = readStoredProfile() || { ...defaultProfile(role), name: account.name, email: account.email, workspaceName: account.workspaceName }; const [editing, setEditing] = useState(false); const [name, setName] = useState(stored.name); const [email, setEmail] = useState(stored.email); const [workspaceName, setWorkspaceName] = useState(stored.workspaceName); const [jobTitle, setJobTitle] = useState(stored.jobTitle); const [useCase, setUseCase] = useState(stored.useCase); const save = () => { saveProfile({ ...stored, role, name, email, workspaceName, jobTitle, useCase }); setEditing(false); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Profile saved locally. The new identity is now used across the workspace.' })) }; return <div><PageHeader eyebrow="PROFILE" title={name + '.'} desc="Your role and workspace identity, kept clear for every review handoff." action={editing ? 'Save profile' : 'Edit profile'} onAction={editing ? save : () => setEditing(true)} /><div className="profile-grid"><div className="panel profile-card">{editing ? <div className="form-grid"><label>Full name<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Workspace name<input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} /></label><label>Job title<input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label><label>Primary use case<select value={useCase} onChange={(e) => setUseCase(e.target.value)}><option>Freelance agreements</option><option>Agency retainers</option><option>Startup vendor contracts</option></select></label></div> : <><div className="profile-hero"><span className="profile-avatar">{account.initials}</span><div><h2>{account.name}</h2><p>{jobTitle} · {account.workspaceName}</p></div></div><div className="profile-facts"><span><small>EMAIL</small><b>{account.email}</b></span><span><small>ACTIVE ROLE</small><b>{ROLE_LABELS[role]}</b></span><span><small>MEMBER SINCE</small><b>November 2026</b></span><span><small>USE CASE</small><b>{useCase}</b></span></div></>}</div><div className="panel profile-card"><span className="section-kicker">ACCOUNT SAFETY</span><h2>Keep review intentional.</h2><p className="muted">Profile settings are local in this prototype. Every name and workspace change is reflected in the shell, activity records, and role handoffs.</p><div className="permission"><Icon name="lock" size={16} /><span>Production authentication <b>Not connected</b></span></div><div className="permission"><Icon name="wallet" size={16} /><span>Connected wallet <b>None</b></span></div><div className="permission"><Icon name="download" size={16} /><span>Data export <b>Available locally</b></span></div></div></div></div> }function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [role, setRole] = useState<Role>(() => (localStorage.getItem('legalx:role') as Role) || readStoredProfile()?.role || 'owner')
  const [, setStateVersion] = useState(0)
  useEffect(() => { const handler = () => setPath(window.location.pathname); window.addEventListener('popstate', handler); return () => window.removeEventListener('popstate', handler) }, [])
  useEffect(() => { const handler = () => setStateVersion((version) => version + 1); window.addEventListener('legalx:state', handler); return () => window.removeEventListener('legalx:state', handler) }, [])
  const onNavigate = (p: string) => go(p)
  const onRoleChange = (next: Role) => { setRole(next); localStorage.setItem('legalx:role', next); const profile = readStoredProfile(); if (profile) saveProfile({ ...profile, role: next }); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Switched to ' + ROLE_LABELS[next] + ' · permissions recalculated.' })) }
  const publicPages = ['/', '/product', '/how-it-works', '/solutions', '/security', '/pricing', '/about', '/faq', '/contact']
  if (publicPages.includes(path)) return <Landing page={path} />; if (path === '/privacy') return <InfoPage kind="privacy" />; if (path === '/terms') return <InfoPage kind="terms" />; if (path === '/sign-in') return <Auth mode="sign-in" />; if (path === '/sign-up') return <Auth mode="sign-up" />; if (path === '/demo') return <DemoControlCenter onNavigate={onNavigate} onRoleChange={onRoleChange} />; if (path === '/onboarding') return <Onboarding onNavigate={onNavigate} onRoleChange={onRoleChange} />; if (routes.includes(path) || path.startsWith('/app/')) return <AppShell path={path} role={role} onNavigate={onNavigate} onRoleChange={onRoleChange} />; return <Landing page="/" />
}

export default App
