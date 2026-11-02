import type { ClientMessage, KeyValueStore } from '@river/client'
import type { DesktopHost } from '@river/app/host'
export interface OnlineApi {
  connect(): Promise<void>
  send(message: ClientMessage): Promise<void>
  onMessage(listener: (message: unknown) => void): () => void
  get: KeyValueStore['get']
  set: KeyValueStore['set']
  entries: KeyValueStore['entries']
  personas: DesktopHost['personas']
  provideAgent: DesktopHost['provideAgent']
  coach: DesktopHost['coach']
}
