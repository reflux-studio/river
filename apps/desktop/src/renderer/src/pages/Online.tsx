import { useRiver, updateSettings } from '@/lib/river'
import { RiverApp, type DesktopHost } from '@river/app'
import type { KeyValueStore, Transport } from '@river/client'
import type { OnlineApi } from '../../../shared/online'
import '@river/app/style.css'
declare global {
  interface Window {
    riverOnline: OnlineApi
  }
}
const api = window.riverOnline
const store: KeyValueStore = {
  get: (key) => api.get(key),
  set: (key, value) => api.set(key, value),
  entries: (prefix) => api.entries(prefix)
}
const host: DesktopHost = {
  localTransport(): Transport {
    let unsubscribe: (() => void) | undefined
    return {
      async open(receive) {
        unsubscribe = api.onMessage(receive)
        await api.connect()
      },
      send(message) {
        void api.send(message)
      },
      close() {
        unsubscribe?.()
      }
    }
  },
  personas: () => api.personas(),
  provideAgent: (input) => api.provideAgent(input),
  coach: (view, question) => api.coach(view, question)
}
export function Online({ onSettings }: { onSettings(): void }) {
  const settings = useRiver((s) => s.settings)
  return (
    <RiverApp
      tableAppearance={settings}
      onAppearance={(value) => void updateSettings(value)}
      store={store}
      defaultServer="local"
      host={host}
      onSettings={onSettings}
    />
  )
}
