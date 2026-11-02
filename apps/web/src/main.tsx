import { createRoot } from 'react-dom/client'
import { RiverApp, browserStore } from '@river/app'
import '@river/app/style.css'
createRoot(document.getElementById('root')!).render(
  <RiverApp
    store={browserStore()}
    defaultServer={`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`}
  />
)
