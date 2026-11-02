/** Device-local public data. Electron keeps model secrets in its existing safeStorage path. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  entries<T>(prefix: string): Promise<T[]>
}
