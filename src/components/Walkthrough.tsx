import { Icon } from './ui'
import '../styles/walkthrough.css'

type Scenario = { title: string; status: string }

export function ScenarioList({ steps, current, visited, onOpen }: {
  steps: Scenario[]
  current: number
  visited: number[]
  onOpen: (index: number) => void
}) {
  return <nav className="walk-list" aria-label="Walkthrough scenarios">
    <h2>Scenarios</h2>
    <ol>{steps.map((item, index) => {
      const state = index === current ? 'Current step' : visited.includes(index) ? 'Visited' : 'Upcoming'
      const mode = item.status === 'supported' ? 'Supported local path' : item.status === 'simulated' ? 'Simulation' : 'External action blocked'
      return <li key={item.title}>
        <button className="walk-row" aria-current={index === current ? 'step' : undefined} onClick={() => onOpen(index)}>
          <span className="walk-number">{String(index + 1).padStart(2, '0')}</span>
          <span className="walk-copy"><strong>{item.title}</strong><small>{state} · {mode}</small></span>
          <Icon name="chevron" size={16} />
        </button>
      </li>
    })}</ol>
  </nav>
}

export function WalkProgress({ value }: { value: number }) {
  return <div className="walk-progress">
    <label htmlFor="walk-position">Guided demo progress</label><strong>{value}%</strong>
    <progress id="walk-position" max={100} value={value} />
  </div>
}
