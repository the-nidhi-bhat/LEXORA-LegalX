import { Scene } from './FilmHero'
import { useEffect, useRef, useState } from 'react'
import './contract-story.css'

const acts = [
  { title: 'Human intent', body: 'A client agrees to pay a developer ₹30,000 for a website. Three approved milestones release ₹10,000 each.', label: 'Written agreement', rows: [['Design approval', '₹10,000'], ['Build approval', '₹10,000'], ['Delivery approval', '₹10,000']] },
  { title: 'Structured agreement', body: 'The three milestones add up to the signed total. Each submission has a five-day review window.', label: 'Contract IR', rows: [['total_amount', '₹30,000'], ['milestones', '3 × ₹10,000'], ['review_period_days', '5']] },
  { title: 'Executable conditions', body: 'Each release requires milestone approval. In this example the proposed specification incorrectly encodes the overall agreement amount.', label: 'Proposed specification', rows: [['Release trigger', 'Milestone approved'], ['Review window', '5 days'], ['Encoded total', '₹35,000']] },
  { title: 'Verified parity', body: 'The encoded total exceeds the signed agreement by ₹5,000. The discrepancy is in the overall amount.', label: 'Illustrative mismatch', rows: [['Signed total', '₹30,000'], ['Encoded total', '₹35,000'], ['Difference', '+₹5,000']] },
  { title: 'Controlled execution', body: 'The mismatch blocks release. Correct the specification, verify it again and obtain the required approval before proceeding.', label: 'Execution gate', rows: [['Parity', 'Mismatch'], ['Approval', 'Required'], ['Release', 'Blocked']] },
]

export function ContractStory() {
  const root = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  useEffect(() => {
    const panels = Array.from(root.current!.querySelectorAll<HTMLElement>('.contract-act'))
    let frame = 0
    const measure = () => {
      frame = 0
      const line = window.innerHeight * .52
      let index = 0
      panels.forEach((panel, i) => { if (panel.getBoundingClientRect().top <= line) index = i })
      setActive(index)
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const watch = new IntersectionObserver(([entry]) => {
      window.removeEventListener('scroll', queue)
      if (entry.isIntersecting) { measure(); window.addEventListener('scroll', queue, { passive: true }) }
    })
    watch.observe(root.current!)
    window.addEventListener('resize', queue)
    return () => { watch.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', queue); window.removeEventListener('resize', queue) }
  }, [])
  const act = acts[active]
  return <section className="contract-story folio-section" ref={root} aria-label="An illustrative agreement from intent to execution">
    <div className="contract-ledger" aria-hidden="true">
      <small>Jury example · ₹30,000 · {active + 1} / 5</small>
      <h2>{act.label}</h2>
      <div className="ledger-sculpture"><Scene chapter={active}/></div><div className="ledger-rule">{acts.map((item,i) => <i key={item.title} data-filled={i <= active}/>)}</div>
      <dl key={active}>{act.rows.map(([name,value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    </div>
    <div>{acts.map((item,i) => <article className="contract-act" key={item.title} data-active={i === active}>
      <small>Act {i+1} / 5 · Jury example</small><h3>{item.title}</h3><p>{item.body}</p>
      <dl>{item.rows.map(([name,value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    </article>)}</div>
  </section>
}
