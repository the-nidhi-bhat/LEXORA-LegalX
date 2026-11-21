import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/design.css'
import './styles/landing.css'
import './styles/astra-layout.css'

const savedTheme = (() => { try { return typeof window !== 'undefined' && window.localStorage.getItem('legalx:theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' } })()
document.documentElement.dataset.theme = savedTheme
if (__LEGALX_MEDIA__.day) document.documentElement.style.setProperty('--legalx-day-art', "url('/noir/living-contract-day.webp')")
if (__LEGALX_MEDIA__.night) document.documentElement.style.setProperty('--legalx-night-art', "url('/noir/living-contract.webp')")

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
