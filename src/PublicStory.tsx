import { FilmHero, ProductFilm } from './components/FilmHero'
import { ContractStory } from './components/ContractStory'
﻿import { useState, type ReactNode } from 'react'

const pages: Record<string, [string,string,string]> = {
  '/product': ['Product', 'Inside the agreement workspace.', 'Follow one agreement from its source text through validation, comparison and review.'],
  '/how-it-works': ['Workflow', 'Follow a clause through review.', 'Inspect each stage using a sample development agreement.'],
  '/solutions': ['Solutions', 'A shared record for everyone at the table.', 'Different roles review different questions about the same agreement.'],
  '/security': ['Security', 'Every decision has a boundary.', 'Review the checks that protect contract versions, approval records and execution eligibility.'],
  '/pricing': ['Plans', 'Explore the workspace.', 'Compare the sample workspace with the proposed team experience.'],
  '/about': ['About', 'Written terms deserve a clear record.', 'LegalX connects the language of an agreement to the structured decisions made from it.'],
  '/contact': ['Contact', 'Reach the project team.', 'For this prototype, start with the guided workspace or explore the common review questions.'],
  '/faq': ['Support', 'Questions about review.', 'Find answers about source terms, verification, and the limits of the prototype.'],
}

const capabilities = [
  ['Agreement intake', 'Collect written terms, milestones and responsibilities in one review space.', '/app/ai-workspace'],
  ['Contract inspector', 'Inspect structured values alongside their source clauses and evidence.', '/app/contract-ir'],
  ['Parity comparison', 'Check agreement fields against the values used by execution logic.', '/app/parity'],
  ['Approval history', 'Follow recorded versions, human decisions and the changes that require another review.', '/app/agreements'],
]

function Capabilities() {
  return <section className="folio-section folio-capabilities"><div className="folio-section-intro"><span className="folio-label">Product index</span><h2>Tools for the<br/>review table.</h2></div>
    <div className="folio-index">{capabilities.map(([title,body,href]) => <a key={title} href={href}><div><h3>{title}</h3><p>{body}</p></div><span aria-hidden="true">↗</span></a>)}</div>
  </section>
}

const useCases = [
  ['Freelancers', 'Milestone payments', 'Before you accept a project, review which deliverables release payment and how long the client has to respond.'],
  ['Agencies', 'Delivery and acceptance', 'Review the statement of work, compare the release schedule and track the version each party approved.'],
  ['Startups', 'Vendor onboarding', 'Inspect vendor terms and the supporting evidence before passing a contract to the next reviewer.'],
  ['Businesses', 'Review responsibilities', 'Give legal and operations teams a common view of written obligations, approval history and execution gates.'],
]
const principles = [
  ['Role-aware access', 'The backend applies its permission checks to authenticated requests. Workspace roles present the available review actions.'],
  ['Source and provenance', 'Reviewers can inspect structured terms and trace supported fields back to their source.'],
  ['Version-specific approval', 'Changes to material terms require another review. Earlier approvals belong to their original version.'],
  ['Execution eligibility', 'Validation, parity and required approvals determine eligibility. A blocked operation returns a reason.'],
]
function ReadingList({ rows }: { rows: string[][] }) {
  return <div className="folio-reading-list">{rows.map(([title,body,detail]) => <article key={title}><h3>{title}</h3><div>{detail && <h4>{body}</h4>}<p>{detail || body}</p></div></article>)}</div>
}

function Plans() {
  const [plan, setPlan] = useState<'explore'|'build'>('explore')
  return <section className="folio-plans"><div className="folio-choice" aria-label="Select a plan">
    <button aria-pressed={plan==='explore'} onClick={()=>setPlan('explore')}>Explore (Demo)</button><button aria-pressed={plan==='build'} onClick={()=>setPlan('build')}>Build (Prototype intent)</button>
  </div><article aria-live="polite"><div><span className="folio-label">{plan==='explore'?'Available now':'Proposed team plan'}</span><h2>{plan==='explore'?'Explore':'Build'}</h2><p>{plan==='explore'?'Free sample workspace':'Pricing to be announced'}</p></div>
    <div><ul>{(plan==='explore'?['Guided tour of the seeded workspace','Local clause extraction and Contract IR','Sample parity, traceability and generation','Role-aware review walkthrough']:['Team collaboration and account management','Integrated review and version history','Organization-level governance','Commercial availability to be confirmed']).map(x=><li key={x}>{x}</li>)}</ul><a className="folio-button" href={plan==='explore'?'/demo':'/contact'}>{plan==='explore'?'Explore demo':'Contact the team'} <span>↗</span></a></div>
  </article></section>
}

function FooterCta() {
  return <section className="folio-closing"><h2>Take a seat at the review table.</h2><a className="folio-button" href="/demo">Open guided demo <span>↗</span></a></section>
}

export function PublicStory({page, showcase, faq}: {page:string; showcase:ReactNode; faq:ReactNode}) {
  const home = page === '/'
  const [chapter,headline,description] = pages[page] || pages['/product']
  return <main className="public-folio">
    {home ? <section className="folio-hero"><div className="folio-hero-copy"><p className="folio-label"><i/>Contract intelligence</p>
      <h1>The living<br/><em>contract.</em></h1>
      <p className="folio-deck">Trace written terms to the clauses, approvals and execution checks that give them effect.</p>
      <div className="folio-actions"><a className="folio-button" href="/sign-up">Enter workspace <span>↗</span></a><a className="folio-link" href="/demo">Start guided demo <span>→</span></a></div>
      </div><FilmHero/></section> :
      <header className="folio-chapter"><div><p className="folio-label"><i/>{chapter}</p><h1>{headline}</h1><p>{description}</p></div><div className="chapter-art" aria-hidden="true"/></header>}
    {home && <><ContractStory/><ProductFilm/></>}
    {(home || page==='/product' || page==='/how-it-works') && <>
      <section className="folio-section folio-workflow" id="workflow"><div className="folio-heading"><div><span className="folio-label">Interactive case study</span><h2>One clause, from start to finish.</h2></div><p>Explore a separate ₹50,000 website agreement with two milestones. Select a stage to inspect its terms and review gates.</p></div>{showcase}</section>
      <Capabilities/>
    </>}
    {page==='/solutions' && <ReadingList rows={useCases}/>}
    {page==='/security' && <ReadingList rows={principles}/>}
    {page==='/pricing' && <Plans/>}
    {page==='/about' && <Capabilities/>}
    {page==='/faq' && <section className="folio-questions">{faq}</section>}
    {page==='/contact' && <div className="folio-contact"><h2>Project inquiries</h2><p>The prototype lists a demonstration contact address.</p><a className="folio-link" href="mailto:hello@lexora.example">hello@lexora.example ↗</a><a className="folio-link" href="/faq">Read the FAQ →</a></div>}
    <FooterCta/>
  </main>
}
