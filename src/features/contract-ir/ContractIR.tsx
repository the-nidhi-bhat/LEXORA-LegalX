import { useEffect, useState } from 'react'
import { type Role, hasPermission } from '../../rbac'
import { effectiveAccount, readWorkflow, writeText, writeWorkflow, type WorkflowState } from '../../demo-state'
import { generateSolidity, runGenerationTests } from '../../solidity'
import { buildClausesFromIr, deriveTraceability, diffIrs, affectedFromDiff } from '../../traceability'
import { computeDrift, detectAndApplyDrift, ensureIntegrityFields, getAuditTrail, hashIr, logEvent, recordVersion, verifyAuditTrail } from '../../workflow-integrity'
import { Badge, Button, Icon, PageHeader } from '../../components/ui'

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



export function ContractIR({ jsonView, setJsonView, onNavigate, workflow, role = 'owner' }: { jsonView: boolean; setJsonView: (x: boolean) => void; onNavigate: (path: string) => void; workflow?: WorkflowState; role?: Role }) {
  const w = workflow || readWorkflow();
  const [selectedField, setSelectedField] = useState('');
  const [section, setSection] = useState('Overview');
  const [copied, setCopied] = useState(false);
  const ir = w.ir as any;
  const validation = w.validation;
  const copyIr = () => { if (!ir) return; navigator.clipboard?.writeText(JSON.stringify(ir, null, 2)); setCopied(true); window.dispatchEvent(new CustomEvent('legalx:notice', { detail: 'Contract IR copied locally. No external data was sent.' })); window.setTimeout(() => setCopied(false), 2200); };
  if (!ir) return <div><PageHeader eyebrow="CONTRACT IR · TECHNICAL INSPECTOR" title="Contract inspector" desc="Generate Contract IR from agreement input before validation and parity." /><div className="panel"><p>No Contract IR yet.</p><p className="muted">Run clause extraction in the AI Workspace to generate the canonical IR (demo/local deterministic).</p><Button onClick={() => onNavigate('/app/ai-workspace')} icon="spark">Open AI Workspace</Button></div></div>;
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

  const clauses = (w.traceability?.clauses || []).length ? (w.traceability?.clauses || []) : (ir.provenance || []).map((p:any,i:number)=>({id:`cl-${i+1}`,label:p.field,text:p.source,evidence:p.source,supported:p.support!=='unsupported'}));
  return <div className="lx-ir-inspector">
    <PageHeader eyebrow="CONTRACT IR · STRUCTURED INSPECTOR" title="Contract inspector" desc="Clause navigation, field-level details, provenance/evidence, drift/version/audit, traceability, and isolated what-if simulation." />
    {drift?.status === 'drift_detected' && drift?.materialChange && <div className="inline-error" style={{marginBottom:12}}><Icon name="alert" size={14} /><span><b>Material drift detected.</b><small>Stale approval/execution readiness invalidated. Re-review and reapprove required.</small></span></div>}
    <div className="ir-toolbar"><div className="ir-tabs"><button className={!jsonView ? 'active' : ''} onClick={() => setJsonView(false)}>Structured view</button><button className={jsonView ? 'active' : ''} onClick={() => setJsonView(true)}>JSON view</button></div><div className="ir-toolbar-actions"><Badge tone={validation.status==='valid'?'success':validation.status==='invalid'?'danger':'warning'}>Validation: {validation.status}</Badge><Badge tone="warning">Demo/local IR · {ir.version}</Badge><Button kind="secondary" icon="copy" onClick={copyIr}>{copied ? 'Copied locally' : 'Copy IR'}</Button><Button onClick={() => onNavigate('/app/parity')} icon="scan">Run verification</Button></div></div>
    {jsonView ? <pre className="json-view">{JSON.stringify({ ...ir, validation, mode: w.mode, approvedSnapshot: (w as any).approvedSnapshot, drift: (w as any).drift, versionHistory: ((w as any).versionHistory||[]).map((v:any)=>({irVersion:v.irVersion,irHash:v.irHash,solidityHash:v.solidity?.hash,tests:v.tests,approval:v.approval})), audit: { count: ((w as any).auditTrail?.events||[]).length, integrity: verifyAuditTrail(w as any) }, traceabilitySummary: deriveTraceability(w).summary, simulation: w.simulation ? { active: w.simulation.active, baseIrVersion: w.simulation.baseIrVersion, validation: w.simulation.validation.status, parity: w.simulation.parity.status } : null }, null, 2)}</pre> :
    <div className="lx-ir-shell">
      <aside className="lx-ir-nav panel">
        <span className="section-kicker">CLAUSE / FIELD NAVIGATION</span>
        {navItems.map(n => <button key={n} aria-pressed={section===n} className={section===n?'active':''} onClick={()=>setSection(n)}>{n}</button>)}
        <div className="panel" style={{marginTop:8,background:'var(--surface2)'}}><b>IR {ir.version}</b><p className="muted" style={{marginTop:6}}>Validation {validation.status}<br/>Parity {w.parity.status}<br/>Approval {w.approval.status}</p></div>
      </aside>
      <div className="lx-ir-main">
        {(section==='Overview' || section==='Field map') && <div className="ir-grid">
          <div className="ir-card panel"><div className="ir-card-head"><span>PARTIES</span><Badge tone="success">source linked</Badge></div><div className="ir-parties"><div className="party"><span className="avatar soft">CL</span><div><small>CLIENT</small><b>{ir?.parties?.client || 'Client / Small business'}</b></div></div><span>↔</span><div className="party"><span className="avatar mint">FR</span><div><small>PROVIDER</small><b>{ir?.parties?.provider || 'Freelance developer'}</b></div></div></div></div>
          <div className="ir-card panel"><div className="ir-card-head"><span>PAYMENT & TERMS</span><Badge tone={validation.status==='valid'?'success':'warning'}>{validation.status==='valid'?'validated':'review'}</Badge></div><div className="ir-big">₹{Number(ir.total_amount||0).toLocaleString('en-IN')} <small>{ir.currency} total</small></div><ul className="milestone-breakdown">{ir.milestones.map((milestone: { name: string; amount: number }, index: number) => <li key={index}><span>{milestone.name}</span><strong>₹{Number(milestone.amount).toLocaleString('en-IN')}</strong></li>)}</ul><p className="muted" style={{marginTop:10}}>Review {ir.review_period_days} days · Dispute: {String(ir.dispute_behavior||'').replace(/_/g,' ')}</p></div>
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



