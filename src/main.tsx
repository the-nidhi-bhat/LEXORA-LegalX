import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const savedTheme = typeof window !== 'undefined' && window.localStorage.getItem('legalx:theme') === 'dark' ? 'dark' : 'light'
document.documentElement.dataset.theme = savedTheme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
