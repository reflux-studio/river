import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { init, toastError } from './lib/river'
import './index.css'

init().catch(toastError)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
